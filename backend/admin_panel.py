"""Admin panel API — every route requires role=admin (enforced server-side via get_admin_user).
Important admin operations are written to `admin_audit`."""
import re
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

CONTACT_STATUSES = ["nuovo", "da_contattare", "contattato", "in_lavorazione", "concluso"]


def build_router(db, get_admin_user, now_utc, make_id) -> APIRouter:
    r = APIRouter(prefix="/admin")

    async def audit(admin: dict, action: str, target: str, details: Optional[dict] = None):
        await db.admin_audit.insert_one({
            "audit_id": make_id("aud"), "admin_id": admin["user_id"], "admin_email": admin.get("email"),
            "action": action, "target": target, "details": details or {}, "created_at": now_utc().isoformat(),
        })

    def rx(q: str):
        return {"$regex": re.escape(q.strip()), "$options": "i"}

    async def enrich_bill(b: dict) -> dict:
        u = await db.users.find_one({"user_id": b["user_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1}) or {}
        c = b.get("contact_request") or {}
        b["customer"] = {"name": b.get("user_name") or u.get("name"), "email": u.get("email") or b.get("user_email"), "phone": u.get("phone")}
        b["contact_email"] = c.get("email")
        b["contact_phone"] = c.get("phone")
        b["contact_status"] = c.get("status")
        b["offer"] = await db.offers.find_one({"bill_id": b["bill_id"]}, {"_id": 0})
        return b

    # ------------------------------------------------------------------ dashboard
    @r.get("/stats")
    async def stats(admin: dict = Depends(get_admin_user)):
        now = now_utc()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week = (now - timedelta(days=7)).isoformat()
        live = {"deleted_at": None}
        latest_bills = [await enrich_bill(b) for b in await db.bills.find(live, {"_id": 0}).sort("created_at", -1).to_list(6)]
        latest_contacts = [await enrich_bill(b) for b in await db.bills.find({**live, "contact_request": {"$ne": None}}, {"_id": 0}).sort("contact_request.consent_at", -1).to_list(6)]
        return {
            "users_total": await db.users.count_documents({"role": {"$ne": "admin"}}),
            "bills_total": await db.bills.count_documents(live),
            "bills_today": await db.bills.count_documents({**live, "created_at": {"$gte": today}}),
            "bills_week": await db.bills.count_documents({**live, "created_at": {"$gte": week}}),
            "bills_new": await db.bills.count_documents({**live, "status": "nuova"}),
            "contacts_total": await db.bills.count_documents({**live, "contact_request": {"$ne": None}}),
            "contacts_with_email": await db.bills.count_documents({**live, "contact_request.email": {"$nin": [None, ""]}}),
            "contacts_with_phone": await db.bills.count_documents({**live, "contact_request.phone": {"$nin": [None, ""]}}),
            "contacts_open": await db.bills.count_documents({**live, "contact_request.status": {"$in": ["nuovo", "da_contattare"]}}),
            "referrals_total": await db.users.count_documents({"referred_by": {"$nin": [None, ""]}}),
            "unread_notifications": await db.admin_notifications.count_documents({"read": False}),
            "latest_bills": latest_bills,
            "latest_contacts": latest_contacts,
            "generated_at": now.isoformat(),
        }

    # ------------------------------------------------------------------ bills
    @r.get("/bills/search")
    async def bills_search(
        admin: dict = Depends(get_admin_user),
        q: Optional[str] = None,
        filter: Optional[str] = Query(None, description="nuove|da_analizzare|da_contattare|contattati|conclusi"),
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = Query(100, ge=1, le=500),
    ):
        cond: dict = {"deleted_at": None}
        if filter == "nuove":
            cond["created_at"] = {"$gte": (now_utc() - timedelta(days=7)).isoformat()}
            cond["status"] = "nuova"
        elif filter == "da_analizzare":
            cond["status"] = "nuova"
        elif filter == "da_contattare":
            cond["contact_request.status"] = {"$in": ["nuovo", "da_contattare"]}
        elif filter == "contattati":
            cond["contact_request.status"] = {"$in": ["contattato", "in_lavorazione"]}
        elif filter == "conclusi":
            cond["$or"] = [{"contact_request.status": "concluso"}, {"status": "contratto_concluso"}]
        if date_from or date_to:
            cond.setdefault("created_at", {})
            if date_from:
                cond["created_at"]["$gte"] = date_from
            if date_to:
                cond["created_at"]["$lte"] = date_to + "T23:59:59" if len(date_to) == 10 else date_to
        if q and q.strip():
            rq = rx(q)
            user_ids = [u["user_id"] async for u in db.users.find({"$or": [{"name": rq}, {"email": rq}, {"phone": rq}]}, {"user_id": 1})]
            ors = [
                {"user_name": rq}, {"user_email": rq}, {"file_name": rq}, {"status": rq}, {"created_at": rq},
                {"extracted.fornitore": rq}, {"extracted.intestatario": rq}, {"extracted.codice_fiscale": rq}, {"extracted.partita_iva": rq},
                {"contact_request.email": rq}, {"contact_request.phone": rq}, {"contact_request.status": rq},
            ]
            if user_ids:
                ors.append({"user_id": {"$in": user_ids}})
            cond = {"$and": [cond, {"$or": ors}]}
        bills = await db.bills.find(cond, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return [await enrich_bill(b) for b in bills]

    # ------------------------------------------------------------------ users
    @r.get("/users")
    async def users(admin: dict = Depends(get_admin_user), q: Optional[str] = None, limit: int = Query(200, ge=1, le=1000)):
        cond: dict = {"role": {"$ne": "admin"}}
        if q and q.strip():
            rq = rx(q)
            cond["$or"] = [{"name": rq}, {"email": rq}, {"phone": rq}, {"referral_code": rq}]
        out = []
        async for u in db.users.find(cond, {"_id": 0, "password_hash": 0, "apple_refresh_token": 0}).sort("created_at", -1).limit(limit):
            uid = u["user_id"]
            u["bills_count"] = await db.bills.count_documents({"user_id": uid, "deleted_at": None})
            u["referrals_count"] = await db.users.count_documents({"referred_by": uid})
            u["contacts_count"] = await db.bills.count_documents({"user_id": uid, "contact_request": {"$ne": None}})
            last_bill = await db.bills.find_one({"user_id": uid}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
            last_sess = await db.user_sessions.find_one({"user_id": uid}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
            cands = [(x.isoformat() if hasattr(x, "isoformat") else str(x)) for x in [(last_bill or {}).get("created_at"), (last_sess or {}).get("created_at"), u.get("created_at")] if x]
            u["last_activity"] = max(cands) if cands else None
            if hasattr(u.get("created_at"), "isoformat"):
                u["created_at"] = u["created_at"].isoformat()
            u["account_status"] = "attivo"
            out.append(u)
        return out

    @r.get("/users/{user_id}")
    async def user_detail(user_id: str, admin: dict = Depends(get_admin_user)):
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0, "apple_refresh_token": 0})
        if not u:
            raise HTTPException(status_code=404, detail="Utente non trovato")
        bills = [await enrich_bill(b) for b in await db.bills.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)]
        contracts = await db.contracts.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        referred = await db.users.find({"referred_by": user_id}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "created_at": 1}).to_list(200)
        referrer = await db.users.find_one({"user_id": u.get("referred_by")}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}) if u.get("referred_by") else None
        notifications = await db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
        timeline = sorted(
            [{"type": "registrazione", "at": u.get("created_at"), "text": "Account creato"}]
            + [{"type": "bolletta", "at": b["created_at"], "text": f"Bolletta {b['category']} caricata ({b.get('file_name') or 'file'})", "bill_id": b["bill_id"]} for b in bills]
            + [{"type": "contatto", "at": b["contact_request"]["consent_at"], "text": "Richiesta di contatto lasciata", "bill_id": b["bill_id"]} for b in bills if b.get("contact_request")]
            + [{"type": "contratto", "at": c["created_at"], "text": f"Richiesta contratto {c.get('provider_name') or ''}".strip(), "contract_id": c["contract_id"]} for c in contracts]
            + [{"type": "referral", "at": x["created_at"], "text": f"Ha invitato {x.get('name') or x.get('email')}"} for x in referred],
            key=lambda e: e["at"] or "", reverse=True,
        )
        await audit(admin, "view_user", user_id)
        return {"user": u, "bills": bills, "contracts": contracts, "referred": referred, "referrer": referrer, "notifications": notifications, "timeline": timeline}

    # ------------------------------------------------------------------ contact requests
    class ContactStatusInput(BaseModel):
        status: str = Field(pattern="^(" + "|".join(CONTACT_STATUSES) + ")$")
        note: Optional[str] = Field(default=None, max_length=1000)

    @r.get("/contacts")
    async def contacts(admin: dict = Depends(get_admin_user), status: Optional[str] = None, q: Optional[str] = None):
        cond: dict = {"deleted_at": None, "contact_request": {"$ne": None}}
        if status in CONTACT_STATUSES:
            cond["contact_request.status"] = status
        if q and q.strip():
            rq = rx(q)
            cond["$or"] = [{"user_name": rq}, {"user_email": rq}, {"contact_request.email": rq}, {"contact_request.phone": rq}, {"extracted.intestatario": rq}, {"extracted.fornitore": rq}]
        bills = await db.bills.find(cond, {"_id": 0}).sort("contact_request.consent_at", -1).to_list(500)
        return [await enrich_bill(b) for b in bills]

    @r.put("/contacts/{bill_id}/status")
    async def contact_status(bill_id: str, inp: ContactStatusInput, admin: dict = Depends(get_admin_user)):
        bill = await db.bills.find_one({"bill_id": bill_id, "contact_request": {"$ne": None}})
        if not bill:
            raise HTTPException(status_code=404, detail="Richiesta non trovata")
        upd = {"contact_request.status": inp.status, "contact_request.updated_at": now_utc().isoformat(), "contact_request.updated_by": admin["user_id"]}
        if inp.note is not None:
            upd["contact_request.note"] = inp.note.strip()
        await db.bills.update_one({"bill_id": bill_id}, {"$set": upd})
        await audit(admin, "contact_status", bill_id, {"from": bill["contact_request"].get("status"), "to": inp.status})
        return await enrich_bill(await db.bills.find_one({"bill_id": bill_id}, {"_id": 0}))

    # ------------------------------------------------------------------ referrals
    @r.get("/referrals")
    async def referrals(admin: dict = Depends(get_admin_user)):
        out = []
        async for u in db.users.find({"referred_by": {"$nin": [None, ""]}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "created_at": 1, "referred_by": 1}).sort("created_at", -1).limit(500):
            ref = await db.users.find_one({"user_id": u["referred_by"]}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "referral_code": 1}) or {}
            activated = await db.rewards.find_one({"referrer_id": u["referred_by"], "referred_user_id": u["user_id"]}, {"_id": 0, "created_at": 1})
            has_bill = await db.bills.count_documents({"user_id": u["user_id"], "deleted_at": None}) > 0
            out.append({
                "referrer": ref, "code": ref.get("referral_code"), "link": f"bolty://register?ref={ref.get('referral_code', '')}",
                "referred": {"user_id": u["user_id"], "name": u.get("name"), "email": u.get("email")},
                "invited_at": u.get("created_at"),
                "status": "offerta_attivata" if activated else "bolletta_caricata" if has_bill else "registrato",
                "activated_at": (activated or {}).get("created_at"),
            })
        codes = [{"user_id": x["user_id"], "name": x.get("name"), "email": x.get("email"), "code": x.get("referral_code")} async for x in db.users.find({"role": {"$ne": "admin"}, "referral_code": {"$ne": None}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "referral_code": 1}).limit(1000)]
        return {"referrals": out, "codes": codes}

    # ------------------------------------------------------------------ notifications
    @r.get("/notifications")
    async def admin_notifications(admin: dict = Depends(get_admin_user), limit: int = Query(100, ge=1, le=500)):
        items = await db.admin_notifications.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return {"items": items, "unread": await db.admin_notifications.count_documents({"read": False})}

    @r.put("/notifications/read")
    async def admin_notifications_read(admin: dict = Depends(get_admin_user), notification_id: Optional[str] = None):
        cond = {"notification_id": notification_id} if notification_id else {}
        res = await db.admin_notifications.update_many(cond, {"$set": {"read": True}})
        return {"updated": res.modified_count}

    # ------------------------------------------------------------------ audit
    @r.get("/audit")
    async def audit_log(admin: dict = Depends(get_admin_user), limit: int = Query(100, ge=1, le=500)):
        return await db.admin_audit.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)

    return r
