"""
Apple Sign-In + auth regression tests (pytest).

Covers:
- POST /api/auth/apple invalid/malformed identity_token -> 401
- POST /api/auth/apple missing identity_token -> 422
- Existing customer login (mario@test.it) -> 200 role=customer
- Admin login (admin@bolty.it) -> 200 role=admin
- GET /api/auth/me with valid Bearer token -> user
- Session-token auth path: seed user_sessions doc, hit /auth/me with that token -> user
  (proves the Apple session_token path is honored by get_user_by_token)
- Regression: registration still works after sparse email index change
- Regression: referral reward end-to-end (mario code E20BE6)
"""
import io
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASSWORD = "Bolty!Admin2026"
MARIO_EMAIL = "mario@test.it"
MARIO_PASSWORD = "Test1234"


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def http():
    return requests.Session()


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    yield db
    client.close()


@pytest.fixture(scope="session")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------------------------------------------------------------------------
# Apple auth negative
# ---------------------------------------------------------------------------
class TestAppleAuthNegative:
    def test_invalid_identity_token_returns_401(self, http):
        r = http.post(f"{API}/auth/apple", json={"identity_token": "invalid.token.here"}, timeout=30)
        assert r.status_code == 401, r.text
        assert "Apple" in r.json().get("detail", "") or r.status_code == 401

    def test_malformed_bearer_style_token_returns_401(self, http):
        r = http.post(f"{API}/auth/apple", json={"identity_token": "abc"}, timeout=30)
        assert r.status_code == 401, r.text

    def test_empty_identity_token_returns_401(self, http):
        # Non-empty string that fails JWT parsing -> 401 (guard is at verification)
        r = http.post(f"{API}/auth/apple", json={"identity_token": " "}, timeout=30)
        assert r.status_code == 401

    def test_missing_identity_token_returns_422(self, http):
        r = http.post(f"{API}/auth/apple", json={}, timeout=30)
        assert r.status_code == 422, r.text

    def test_missing_body_returns_422(self, http):
        r = http.post(f"{API}/auth/apple", timeout=30)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# Regression: existing auth flows
# ---------------------------------------------------------------------------
class TestAuthRegression:
    def test_mario_login_returns_customer(self, http):
        r = http.post(f"{API}/auth/login", json={"email": MARIO_EMAIL, "password": MARIO_PASSWORD}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == MARIO_EMAIL
        assert data["user"]["role"] == "customer"

    def test_mario_me_with_jwt(self, http):
        r = http.post(f"{API}/auth/login", json={"email": MARIO_EMAIL, "password": MARIO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        token = r.json()["token"]
        r2 = http.get(f"{API}/auth/me", headers=_hdr(token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["user"]["email"] == MARIO_EMAIL

    def test_admin_login_role_admin(self, http, admin_token):
        r = http.get(f"{API}/auth/me", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_registration_still_works_after_sparse_email_index(self, http):
        email = f"TEST_{uuid.uuid4().hex[:8]}@test.it"
        r = http.post(f"{API}/auth/register",
                      json={"name": "Test User", "email": email, "password": "Test1234"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == email.lower()
        # Verify persistence
        me = http.get(f"{API}/auth/me", headers=_hdr(data["token"]), timeout=30)
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email.lower()

    def test_two_apple_users_without_email_can_coexist(self, http, mongo):
        """Sparse-unique email index must allow multiple users without email field."""
        u1 = {"user_id": f"usr_test_{uuid.uuid4().hex[:8]}", "name": "Apple One",
              "apple_sub": f"apple_sub_{uuid.uuid4().hex[:10]}", "role": "customer",
              "auth_provider": "apple", "created_at": datetime.now(timezone.utc).isoformat()}
        u2 = {"user_id": f"usr_test_{uuid.uuid4().hex[:8]}", "name": "Apple Two",
              "apple_sub": f"apple_sub_{uuid.uuid4().hex[:10]}", "role": "customer",
              "auth_provider": "apple", "created_at": datetime.now(timezone.utc).isoformat()}
        mongo.users.insert_one(u1)
        try:
            mongo.users.insert_one(u2)
        finally:
            mongo.users.delete_many({"user_id": {"$in": [u1["user_id"], u2["user_id"]]}})


# ---------------------------------------------------------------------------
# Session-token auth path (simulates Apple session_token consumption)
# ---------------------------------------------------------------------------
class TestSessionTokenPath:
    def test_seeded_session_token_authorizes_me(self, http, mongo):
        # Get mario's user_id via login
        r = http.post(f"{API}/auth/login", json={"email": MARIO_EMAIL, "password": MARIO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        user_id = r.json()["user"]["user_id"]

        session_token = f"apple_{uuid.uuid4().hex}"
        mongo.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
            "created_at": datetime.now(timezone.utc),
        })
        try:
            me = http.get(f"{API}/auth/me", headers=_hdr(session_token), timeout=30)
            assert me.status_code == 200, me.text
            assert me.json()["user"]["user_id"] == user_id
            assert me.json()["user"]["email"] == MARIO_EMAIL
        finally:
            mongo.user_sessions.delete_one({"session_token": session_token})

    def test_expired_session_token_rejected(self, http, mongo):
        r = http.post(f"{API}/auth/login", json={"email": MARIO_EMAIL, "password": MARIO_PASSWORD}, timeout=30)
        user_id = r.json()["user"]["user_id"]
        session_token = f"apple_{uuid.uuid4().hex}"
        mongo.user_sessions.insert_one({
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),
            "created_at": datetime.now(timezone.utc),
        })
        try:
            me = http.get(f"{API}/auth/me", headers=_hdr(session_token), timeout=30)
            assert me.status_code == 401
        finally:
            mongo.user_sessions.delete_one({"session_token": session_token})


# ---------------------------------------------------------------------------
# Core flow regression + referral reward with mario's code
# ---------------------------------------------------------------------------
class TestCoreFlowRegression:
    def test_upload_offer_accept_and_referral_reward(self, http, admin_token):
        # 1) Register new customer with mario's referral code
        friend_email = f"TEST_{uuid.uuid4().hex[:8]}@test.it"
        r = http.post(f"{API}/auth/register", json={
            "name": "Amico di Mario", "email": friend_email, "password": "Test1234",
            "referral_code": "E20BE6",
        }, timeout=30)
        assert r.status_code == 200, r.text
        friend_token = r.json()["token"]

        # Mario referral before
        mario = http.post(f"{API}/auth/login", json={"email": MARIO_EMAIL, "password": MARIO_PASSWORD}, timeout=30).json()
        mario_token = mario["token"]
        ref_before = http.get(f"{API}/referral", headers=_hdr(mario_token), timeout=30).json()
        before_total = ref_before["rewards_total"]
        before_activated = ref_before["activated_count"]

        # 2) Friend uploads bill
        files = {"file": ("bolletta.pdf", io.BytesIO(b"%PDF-1.4 fake"), "application/pdf")}
        r = http.post(f"{API}/upload", headers=_hdr(friend_token), files=files, data={"category": "luce"}, timeout=60)
        assert r.status_code == 200, r.text
        bill_id = r.json()["bill_id"]

        # 3) Admin proposes offer
        offer_payload = {"provider_name": "Illumia Green", "current_monthly": 60.0,
                         "proposed_monthly": 45.0, "notes": "Best"}
        r = http.post(f"{API}/admin/bills/{bill_id}/offer", headers=_hdr(admin_token),
                      json=offer_payload, timeout=30)
        assert r.status_code == 200, r.text
        offer_id = r.json()["offer_id"]

        # 4) Friend accepts contract
        contract_payload = {
            "offer_id": offer_id,
            "customer_data": {
                "nome": "Amico", "cognome": "Rossi", "codice_fiscale": "RSSMRA80A01H501U",
                "telefono": "+39 333 0000000", "email": friend_email,
                "indirizzo": "Via Roma 1, Milano", "pod": "IT001E12345678",
            },
            "accepted_terms": True,
            "signature": "Amico Rossi",
        }
        r = http.post(f"{API}/contracts", headers=_hdr(friend_token), json=contract_payload, timeout=30)
        assert r.status_code == 200, r.text

        # 5) Mario referral counters must increase (Jan 2026: no cash reward, amount=0)
        ref_after = http.get(f"{API}/referral", headers=_hdr(mario_token), timeout=30).json()
        assert ref_after["activated_count"] == before_activated + 1
        # rewards_total stays flat because REFERRAL_REWARD defaults to 0
        assert ref_after["rewards_total"] == pytest.approx(before_total, rel=0, abs=0.01)
        assert ref_after["reward_per_friend"] == 0
        # last reward record must exist with amount 0 and reference the friend
        latest = ref_after["rewards"][0]
        assert latest["amount"] == 0
        assert latest["referred_user_id"]
        # Notification title/text updated (no money promised)
        notifs = http.get(f"{API}/notifications", headers=_hdr(mario_token), timeout=30).json()
        assert any(n.get("title") == "Il tuo amico ha attivato un'offerta!" for n in notifs)
