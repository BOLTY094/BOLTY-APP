"""
Bolty backend regression tests (pytest).

Covers:
- Auth (register/login/me), role gating
- Bills upload/list/get/confirm/delete
- Admin (dashboard/bills/offer)
- Offers listing/get + customer contract creation
- Admin contracts + status update
- Notifications (list + mark read)
- Authorization negative tests (401/403)
"""
import io
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASSWORD = "Bolty!Admin2026"


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer(http):
    email = f"TEST_{uuid.uuid4().hex[:8]}@test.it"
    r = http.post(f"{API}/auth/register", json={"name": "Test Mario", "email": email, "password": "Test1234"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["token"], "user": data["user"], "email": email}


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


# -----------------------------
# Auth
# -----------------------------
class TestAuth:
    def test_register_login_me(self, http, customer):
        # login same account
        r = http.post(f"{API}/auth/login", json={"email": customer["email"], "password": "Test1234"}, timeout=30)
        assert r.status_code == 200
        token = r.json()["token"]
        r2 = http.get(f"{API}/auth/me", headers=_hdr(token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["user"]["role"] == "customer"

    def test_admin_login_role(self, http, admin_token):
        r = http.get(f"{API}/auth/me", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_login_wrong_password(self, http):
        r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_without_token(self, http):
        r = http.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# -----------------------------
# Full happy-path flow
# -----------------------------
class TestFlow:
    def test_full_flow(self, http, customer, admin_token):
        token = customer["token"]

        # Upload bill
        files = {"file": ("bolletta.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
        data = {"category": "luce"}
        r = http.post(f"{API}/upload", headers=_hdr(token), files=files, data=data, timeout=60)
        assert r.status_code == 200, r.text
        bill = r.json()
        assert bill["category"] == "luce"
        assert bill["status"] == "nuova"
        # New behaviour: analysis is None and extracted has only 5 keys (all can be None)
        assert bill.get("analysis") is None
        assert set(bill["extracted"].keys()) == {"fornitore", "intestatario", "tipo_intestatario", "codice_fiscale", "partita_iva"}
        assert "extraction_meta" in bill
        bill_id = bill["bill_id"]

        # List bills
        r = http.get(f"{API}/bills", headers=_hdr(token), timeout=30)
        assert r.status_code == 200 and any(b["bill_id"] == bill_id for b in r.json())

        # Get bill
        r = http.get(f"{API}/bills/{bill_id}", headers=_hdr(token), timeout=30)
        assert r.status_code == 200

        # Confirm bill: new payload only has the 5 allowed keys, old fields (totale/periodo_fatturazione) are ignored by Pydantic
        payload = {"extracted": {
            "fornitore": "Test Provider SpA", "intestatario": "Mario Rossi",
            "tipo_intestatario": "persona", "codice_fiscale": None, "partita_iva": None,
            "totale": 120.0, "periodo_fatturazione": "Bimestrale",  # extra fields should be dropped
        }}
        r = http.put(f"{API}/bills/{bill_id}/confirm", headers=_hdr(token), json=payload, timeout=30)
        assert r.status_code == 200
        confirmed = r.json()
        assert confirmed["extracted"].get("fornitore") == "Test Provider SpA"
        assert "totale" not in confirmed["extracted"]
        assert confirmed["extraction_meta"].get("confirmed_by_user") is True

        # Admin dashboard
        r = http.get(f"{API}/admin/dashboard", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert "stats" in r.json()

        # Admin lists bills
        r = http.get(f"{API}/admin/bills?status=da_analizzare", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

        # Admin creates offer
        offer_payload = {"provider_name": "Illumia Green", "current_monthly": 60.0, "proposed_monthly": 45.0, "notes": "Best fit"}
        r = http.post(f"{API}/admin/bills/{bill_id}/offer", headers=_hdr(admin_token), json=offer_payload, timeout=30)
        assert r.status_code == 200, r.text
        offer = r.json()
        assert offer["annual_savings"] == round((60.0 - 45.0) * 12, 2)
        offer_id = offer["offer_id"]

        # Bill status changed
        r = http.get(f"{API}/bills/{bill_id}", headers=_hdr(token), timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "offerta_proposta"
        assert r.json()["offer"] is not None

        # Customer offers list
        r = http.get(f"{API}/offers", headers=_hdr(token), timeout=30)
        assert r.status_code == 200 and any(o["offer_id"] == offer_id for o in r.json())

        # Customer get offer
        r = http.get(f"{API}/offers/{offer_id}", headers=_hdr(token), timeout=30)
        assert r.status_code == 200

        # Create contract (accept)
        contract_payload = {
            "offer_id": offer_id,
            "customer_data": {
                "nome": "Mario", "cognome": "Rossi", "codice_fiscale": "RSSMRA80A01H501U",
                "telefono": "+39 333 1234567", "email": customer["email"],
                "indirizzo": "Via Roma 1, Milano", "pod": "IT001E12345678", "pdr": None
            },
            "accepted_terms": True,
            "signature": "Mario Rossi"
        }
        r = http.post(f"{API}/contracts", headers=_hdr(token), json=contract_payload, timeout=30)
        assert r.status_code == 200, r.text
        contract_id = r.json()["contract_id"]
        assert r.json()["status"] == "in_lavorazione"

        # Offer now accettata
        r = http.get(f"{API}/offers/{offer_id}", headers=_hdr(token), timeout=30)
        assert r.json()["status"] == "accettata"

        # Duplicate contract -> 400
        r = http.post(f"{API}/contracts", headers=_hdr(token), json=contract_payload, timeout=30)
        assert r.status_code == 400

        # Admin contracts list
        r = http.get(f"{API}/admin/contracts", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200 and any(c["contract_id"] == contract_id for c in r.json())

        # Admin updates contract status
        r = http.put(f"{API}/admin/contracts/{contract_id}/status", headers=_hdr(admin_token), json={"status": "concluso"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "concluso"

        # Notifications
        r = http.get(f"{API}/notifications", headers=_hdr(token), timeout=30)
        assert r.status_code == 200
        notifs = r.json()
        assert len(notifs) >= 1
        r = http.put(f"{API}/notifications/read", headers=_hdr(token), timeout=30)
        assert r.status_code == 200

        # Soft delete bill
        r = http.delete(f"{API}/bills/{bill_id}", headers=_hdr(token), timeout=30)
        assert r.status_code == 200
        # After deletion detail should 404
        r = http.get(f"{API}/bills/{bill_id}", headers=_hdr(token), timeout=30)
        assert r.status_code == 404


# -----------------------------
# Authorization negative tests
# -----------------------------
class TestAuthz:
    def test_admin_endpoints_forbidden_for_customer(self, http, customer):
        token = customer["token"]
        for path in ["/admin/dashboard", "/admin/bills", "/admin/contracts"]:
            r = http.get(f"{API}{path}", headers=_hdr(token), timeout=30)
            assert r.status_code == 403, f"{path} -> {r.status_code}"

    def test_customer_endpoints_require_auth(self, http):
        for path in ["/bills", "/offers", "/notifications", "/auth/me"]:
            r = http.get(f"{API}{path}", timeout=30)
            assert r.status_code == 401, f"{path} -> {r.status_code}"

    def test_upload_invalid_category(self, http, customer):
        files = {"file": ("x.pdf", io.BytesIO(b"x"), "application/pdf")}
        r = http.post(f"{API}/upload", headers=_hdr(customer["token"]),
                      files=files, data={"category": "acqua"}, timeout=30)
        assert r.status_code == 400
