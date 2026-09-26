"""Admin panel end-to-end + authorization tests.

Runs against the public preview URL. One real /api/upload (LLM + admin email).
"""
import os
import hashlib
import time
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://utility-analyzer-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASSWORD = "Bolty!Admin2026"
CUSTOMER_EMAIL = "mario@test.it"
CUSTOMER_PASSWORD = "Test1234"

DUFERCO = Path("/tmp/duferco.pdf")


# ----------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{API}/auth/login", json={"email": CUSTOMER_EMAIL, "password": CUSTOMER_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def temp_user():
    ts = int(time.time())
    email = f"TEST_admin_flow_{ts}@esempio.it"
    payload = {"name": "TEST AdminFlow", "email": email, "password": "TestPass123!"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "user": data["user"]}


ADMIN_ROUTES_GET = [
    "/admin/stats",
    "/admin/bills/search",
    "/admin/users",
    "/admin/contacts",
    "/admin/referrals",
    "/admin/notifications",
    "/admin/audit",
]


# ============================================================ SECURITY
class TestAdminAuthorization:
    """Every /api/admin/* route must return 401 without token and 403 with a customer token."""

    @pytest.mark.parametrize("route", ADMIN_ROUTES_GET)
    def test_no_token_401(self, route):
        r = requests.get(f"{API}{route}", timeout=30)
        assert r.status_code == 401, f"{route} -> {r.status_code} {r.text}"

    @pytest.mark.parametrize("route", ADMIN_ROUTES_GET)
    def test_customer_token_403(self, route, customer_token):
        r = requests.get(f"{API}{route}", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 403, f"{route} -> {r.status_code} {r.text}"

    @pytest.mark.parametrize("route", ADMIN_ROUTES_GET)
    def test_admin_token_200(self, route, admin_token):
        r = requests.get(f"{API}{route}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200, f"{route} -> {r.status_code} {r.text}"

    def test_notifications_read_put(self, customer_token, admin_token):
        # 401
        r = requests.put(f"{API}/admin/notifications/read", timeout=30)
        assert r.status_code == 401
        # 403 customer
        r = requests.put(f"{API}/admin/notifications/read", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 403
        # 200 admin
        r = requests.put(f"{API}/admin/notifications/read", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200

    def test_news_refresh_customer_403(self, customer_token):
        r = requests.post(f"{API}/admin/news/refresh", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 403

    def test_users_detail_customer_403(self, customer_token):
        r = requests.get(f"{API}/admin/users/usr_bogus", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 403

    def test_contact_status_put_customer_403(self, customer_token):
        r = requests.put(
            f"{API}/admin/contacts/bill_bogus/status",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"status": "contattato"},
            timeout=30,
        )
        assert r.status_code == 403


class TestCustomerCrossAccess:
    """A customer must NOT access another customer's bills or files."""

    def test_customer_cannot_see_other_bill_storage(self, admin_token, customer_token):
        # Find a bill NOT owned by mario via admin
        r = requests.get(f"{API}/admin/bills/search?limit=50", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        bills = r.json()
        # Mario's email
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30).json()["user"]
        others = [b for b in bills if b["user_id"] != me["user_id"]]
        if not others:
            pytest.skip("no cross-customer bill available")
        target = others[0]
        # GET /api/bills/{bill_id} -> 403
        r = requests.get(f"{API}/bills/{target['bill_id']}", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 403, r.text
        # GET /api/files/{storage_path} with customer bearer -> 403
        r = requests.get(f"{API}/files/{target['storage_path']}", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 403, r.text

    def test_customer_bills_list_only_own(self, customer_token):
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30).json()["user"]
        r = requests.get(f"{API}/bills", headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
        assert r.status_code == 200
        for b in r.json():
            assert b["user_id"] == me["user_id"]


# ============================================================ FULL FLOW
@pytest.fixture(scope="session")
def uploaded_bill(temp_user):
    """One real upload of /tmp/duferco.pdf under the temp user."""
    assert DUFERCO.exists()
    data = DUFERCO.read_bytes()
    sha_local = hashlib.sha256(data).hexdigest()
    files = {"file": ("duferco.pdf", data, "application/pdf")}
    r = requests.post(
        f"{API}/upload",
        files=files,
        data={"category": "luce"},
        headers={"Authorization": f"Bearer {temp_user['token']}"},
        timeout=180,
    )
    assert r.status_code == 200, r.text
    bill = r.json()
    return {"bill": bill, "sha256": sha_local, "bytes": data}


class TestFullFlow:
    def test_extracted_matches(self, uploaded_bill):
        b = uploaded_bill["bill"]
        ex = b["extracted"]
        assert ex.get("fornitore") == "Duferco Energia SpA", ex
        assert ex.get("intestatario") == "VERBA GROUP SRLS", ex
        assert ex.get("tipo_intestatario") == "azienda", ex
        assert ex.get("codice_fiscale") == "04137230928", ex
        assert ex.get("partita_iva") == "04137230928", ex
        assert b.get("analysis") is None

    def test_admin_open_file_returns_identical_bytes_and_audit(self, uploaded_bill, admin_token):
        b = uploaded_bill["bill"]
        r = requests.get(
            f"{API}/files/{b['storage_path']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert hashlib.sha256(r.content).hexdigest() == uploaded_bill["sha256"]

        # audit contains open_file for this bill
        time.sleep(0.5)
        au = requests.get(f"{API}/admin/audit?limit=200", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert au.status_code == 200
        matches = [a for a in au.json() if a.get("action") == "open_file" and a.get("target") == b["bill_id"]]
        assert matches, "open_file audit missing"

    def test_contact_request_and_admin_status_flow(self, uploaded_bill, temp_user, admin_token):
        bill_id = uploaded_bill["bill"]["bill_id"]
        r = requests.post(
            f"{API}/bills/{bill_id}/contact",
            headers={"Authorization": f"Bearer {temp_user['token']}"},
            json={"email": "temp@esempio.it", "phone": "+39 333 0000000", "consent": True},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        cr = r.json()["contact_request"]
        assert cr["status"] == "nuovo", cr

        # Admin contacts?status=nuovo contains it
        r = requests.get(
            f"{API}/admin/contacts?status=nuovo",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200
        found = [x for x in r.json() if x["bill_id"] == bill_id]
        assert found, "new contact not listed under status=nuovo"
        assert found[0]["contact_email"] == "temp@esempio.it"
        assert found[0]["contact_phone"] == "+393330000000"

        # PUT status contattato
        r = requests.put(
            f"{API}/admin/contacts/{bill_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "contattato", "note": "ok"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["contact_request"]["status"] == "contattato"

        # Audit contains contact_status
        au = requests.get(f"{API}/admin/audit?limit=200", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30).json()
        assert any(a.get("action") == "contact_status" and a.get("target") == bill_id for a in au)

        # invalid status -> 422
        r = requests.put(
            f"{API}/admin/contacts/{bill_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "bogus"},
            timeout=30,
        )
        assert r.status_code == 422, r.text

    def test_stats_and_latest_and_search(self, uploaded_bill, admin_token, temp_user):
        bill_id = uploaded_bill["bill"]["bill_id"]
        r = requests.get(f"{API}/admin/stats", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        st = r.json()
        for k in ("users_total", "bills_total", "contacts_total", "contacts_with_email", "contacts_with_phone", "latest_bills", "latest_contacts"):
            assert k in st, k
        assert st["bills_total"] >= 1
        assert st["contacts_total"] >= 1
        assert st["contacts_with_email"] >= 1
        assert st["contacts_with_phone"] >= 1
        # latest_bills[0] should be our new bill (freshly created)
        assert st["latest_bills"] and st["latest_bills"][0]["bill_id"] == bill_id
        assert any(c["bill_id"] == bill_id for c in st["latest_contacts"])

        # notifications: bolletta + contatto with bill_id
        r = requests.get(f"{API}/admin/notifications?limit=50", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        items = r.json()["items"]
        kinds = {i["kind"] for i in items if i.get("bill_id") == bill_id}
        assert "bolletta" in kinds, kinds
        assert "contatto" in kinds, kinds

        # Mark them read
        for i in [x for x in items if x.get("bill_id") == bill_id][:2]:
            r = requests.put(
                f"{API}/admin/notifications/read?notification_id={i['notification_id']}",
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=30,
            )
            assert r.status_code == 200
            assert r.json().get("updated") >= 1

        # Search by intestatario
        r = requests.get(f"{API}/admin/bills/search?q=VERBA", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert any(b["bill_id"] == bill_id for b in r.json())

        # Search by P.IVA
        r = requests.get(f"{API}/admin/bills/search?q=04137230928", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert any(b["bill_id"] == bill_id for b in r.json())

        # filter=contattati (we set contattato above)
        r = requests.get(f"{API}/admin/bills/search?filter=contattati", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert any(b["bill_id"] == bill_id for b in r.json())

        # filter=da_contattare should NOT contain it (state is contattato)
        r = requests.get(f"{API}/admin/bills/search?filter=da_contattare", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert all(b["bill_id"] != bill_id for b in r.json())

        # date_from=today
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = requests.get(f"{API}/admin/bills/search?date_from={today}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert any(b["bill_id"] == bill_id for b in r.json())

    def test_users_and_user_detail(self, uploaded_bill, temp_user, admin_token):
        r = requests.get(
            f"{API}/admin/users?q={temp_user['email']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200
        rows = [u for u in r.json() if u["email"].lower() == temp_user["email"].lower()]
        assert rows, "temp user not returned"
        u = rows[0]
        assert u["bills_count"] == 1

        r = requests.get(
            f"{API}/admin/users/{u['user_id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200
        detail = r.json()
        types = {e["type"] for e in detail["timeline"]}
        assert {"registrazione", "bolletta", "contatto"}.issubset(types), types


class TestReferrals:
    def test_referral_row_present(self, temp_user, admin_token):
        # get temp user's referral code
        r = requests.get(f"{API}/referral", headers={"Authorization": f"Bearer {temp_user['token']}"}, timeout=30)
        assert r.status_code == 200
        code = r.json()["code"]
        assert code

        # register second temp user with that code
        ts = int(time.time())
        email2 = f"TEST_referred_{ts}@esempio.it"
        r = requests.post(
            f"{API}/auth/register",
            json={"name": "TEST Referred", "email": email2, "password": "TestPass123!", "referral_code": code},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        second = r.json()["user"]

        # admin /referrals contains a row
        r = requests.get(f"{API}/admin/referrals", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        payload = r.json()
        rows = [row for row in payload["referrals"] if row["referred"]["user_id"] == second["user_id"]]
        assert rows, "referral row missing"
        row = rows[0]
        assert row["status"] == "registrato"
        assert row["code"] == code
        assert row["referrer"]["email"].lower() == temp_user["email"].lower()


# ============================================================ REGRESSION
class TestOldDashboardStillExists:
    def test_admin_dashboard_still_present(self, admin_token):
        r = requests.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {admin_token}"}, timeout=30)
        assert r.status_code == 200
        assert "stats" in r.json()
