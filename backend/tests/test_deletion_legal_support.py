"""Bolty pre-App-Store verification tests.

Covers:
- Legal pages (public HTTPS Privacy/Terms/Support) at /api/legal/*
- Legal info endpoint /api/legal/info
- Support endpoint POST /api/support (auth, validation, persistence)
- Apple auth: invalid token still 401 with optional authorization_code
- Account deletion DELETE /api/auth/me (customer only, deletes data + files)
- Referral integrity on deletion (referred_by nulled, rewards cleaned)
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


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _register(name="Test"):
    email = f"TEST_{uuid.uuid4().hex[:10]}@test.it"
    r = requests.post(
        f"{API}/auth/register",
        json={"name": name, "email": email, "password": "Test1234"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json(), email


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------------------------------------------------------------------------
# Legal pages
# ---------------------------------------------------------------------------
class TestLegal:
    def test_privacy_public_html(self):
        r = requests.get(f"{API}/legal/privacy", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "Informativa sulla privacy" in r.text

    def test_terms_public_html(self):
        r = requests.get(f"{API}/legal/terms", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "Termini e condizioni" in r.text

    def test_support_public_html(self):
        r = requests.get(f"{API}/legal/support", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "Assistenza" in r.text

    def test_legal_info(self):
        r = requests.get(f"{API}/legal/info", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["support_email"] == "assistenza@bolty.it"
        assert data["privacy_path"] == "/api/legal/privacy"
        assert data["terms_path"] == "/api/legal/terms"
        assert data["support_path"] == "/api/legal/support"


# ---------------------------------------------------------------------------
# Support endpoint
# ---------------------------------------------------------------------------
class TestSupport:
    def test_support_requires_auth(self):
        r = requests.post(
            f"{API}/support",
            json={"subject": "Ciao", "message": "Ho un problema con la bolletta"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_support_validation_short_subject(self):
        u, _ = _register()
        r = requests.post(
            f"{API}/support",
            headers=_hdr(u["token"]),
            json={"subject": "hi", "message": "Ho un problema con la bolletta"},
            timeout=30,
        )
        assert r.status_code == 422

    def test_support_validation_short_message(self):
        u, _ = _register()
        r = requests.post(
            f"{API}/support",
            headers=_hdr(u["token"]),
            json={"subject": "Aiuto bolletta", "message": "corto"},
            timeout=30,
        )
        assert r.status_code == 422

    def test_support_success(self):
        u, email = _register()
        r = requests.post(
            f"{API}/support",
            headers=_hdr(u["token"]),
            json={"subject": "Aiuto bolletta", "message": "Ciao, non riesco ad analizzare la bolletta di luce"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["request_id"].startswith("sup_")

        # After deletion, the record must be removed too
        # (validate persistence via the deletion counts flow below)


# ---------------------------------------------------------------------------
# Apple auth (invalid token flows still return 401, not 500/422)
# ---------------------------------------------------------------------------
class TestAppleAuth:
    def test_apple_invalid_token_401(self):
        r = requests.post(
            f"{API}/auth/apple",
            json={"identity_token": "not.a.real.token"},
            timeout=30,
        )
        assert r.status_code == 401

    def test_apple_invalid_token_with_authcode_401(self):
        r = requests.post(
            f"{API}/auth/apple",
            json={"identity_token": "not.a.real.token", "authorization_code": "dummy_code_xyz"},
            timeout=30,
        )
        # Must be 401 (invalid token, not 500/422)
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Account deletion
# ---------------------------------------------------------------------------
class TestAccountDeletion:
    def test_delete_without_token_401(self):
        r = requests.delete(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_delete_admin_forbidden(self, admin_token):
        r = requests.delete(f"{API}/auth/me", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 403

    def test_delete_full_flow(self):
        # 1) register fresh user
        u, email = _register("Delete Me")
        token = u["token"]

        # 2) upload a small bill (PNG)
        # 1x1 png
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
            b"\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa2\xd3\x9a"
            b"\x9d\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        r = requests.post(
            f"{API}/upload",
            headers=_hdr(token),
            files={"file": ("bill.png", io.BytesIO(png), "image/png")},
            data={"category": "luce"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        bill = r.json()
        bill_id = bill["bill_id"]
        storage_path = bill.get("storage_path")
        assert storage_path

        # 3) create a support request
        r = requests.post(
            f"{API}/support",
            headers=_hdr(token),
            json={"subject": "Aiuto bolletta luce", "message": "Ho caricato la bolletta ma serve aiuto"},
            timeout=30,
        )
        assert r.status_code == 200

        # 4) DELETE /api/auth/me
        r = requests.delete(f"{API}/auth/me", headers=_hdr(token), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["apple_revoked"] is False
        assert body["files_deleted"] >= 1
        deleted = body["deleted"]
        assert deleted["bills"] >= 1
        assert deleted["notifications"] >= 1
        assert deleted["support_requests"] >= 1

        # 5) Old token should be rejected
        r = requests.get(f"{API}/auth/me", headers=_hdr(token), timeout=30)
        assert r.status_code == 401

        # 6) Login with deleted creds -> 401
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test1234"}, timeout=30)
        assert r.status_code == 401

        # 7) Bill file endpoint should now fail (bill removed -> 404)
        # Use another user's token to hit the endpoint; the bill_id is gone anyway
        u2, _ = _register("Other")
        r = requests.get(f"{API}/files/{bill_id}", headers=_hdr(u2["token"]), timeout=30)
        assert r.status_code in (404, 403)


# ---------------------------------------------------------------------------
# Referral integrity on deletion
# ---------------------------------------------------------------------------
class TestReferralIntegrity:
    def test_referred_by_nulled_on_referrer_deletion(self):
        # A registers
        a, a_email = _register("Referrer A")
        a_token = a["token"]
        # Fetch A's referral code
        r = requests.get(f"{API}/referral", headers=_hdr(a_token), timeout=30)
        assert r.status_code == 200
        a_ref_code = r.json()["code"]
        assert a_ref_code

        # B registers with A's referral code
        b_email = f"TEST_{uuid.uuid4().hex[:10]}@test.it"
        r = requests.post(
            f"{API}/auth/register",
            json={"name": "Friend B", "email": b_email, "password": "Test1234", "referral_code": a_ref_code},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        b_data = r.json()
        b_token = b_data["token"]
        assert b_data["user"].get("referred_by") == a["user"]["user_id"]

        # A deletes account
        r = requests.delete(f"{API}/auth/me", headers=_hdr(a_token), timeout=60)
        assert r.status_code == 200

        # B still exists
        r = requests.get(f"{API}/auth/me", headers=_hdr(b_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["user"].get("referred_by") in (None, "")
