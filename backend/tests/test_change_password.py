"""
Tests for PUT /api/auth/password (change password feature).
Covers:
- Temp customer full flow: wrong current (401), weak (422), same (400), success (200 + new token)
- Old tokens invalidated on other devices; new token works; login with old/new passwords
- No token -> 401
- Admin round-trip: change to temp -> old admin token invalid -> audit contains change_password ->
  restore admin -> login with original credentials works.
"""
import os
import time
import requests
import pytest

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASSWORD = "Bolty!Admin2026"


def _register(email, password, name="TEST User"):
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name})
    return r


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


def _me(token):
    return requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})


def _change(token, current, new):
    return requests.put(
        f"{API}/auth/password",
        json={"current_password": current, "new_password": new},
        headers={"Authorization": f"Bearer {token}"},
    )


# ---------------- Customer change-password flow ----------------
class TestCustomerChangePassword:
    email = f"TEST_pwchg_{int(time.time())}@esempio.it"
    original_pw = "Test1234"
    new_pw = "Nuova1234"
    newer_pw = "Altra5678"

    def test_00_no_token_unauthorized(self):
        r = requests.put(f"{API}/auth/password", json={"current_password": "x", "new_password": "Nuova1234"})
        assert r.status_code == 401, r.text

    def test_01_register_and_login_twice(self):
        r = _register(self.__class__.email, self.original_pw)
        assert r.status_code == 200, r.text
        a = _login(self.__class__.email, self.original_pw)
        b = _login(self.__class__.email, self.original_pw)
        assert a.status_code == 200 and b.status_code == 200
        self.__class__.token_a = a.json()["token"]
        self.__class__.token_b = b.json()["token"]
        assert _me(self.__class__.token_a).status_code == 200
        assert _me(self.__class__.token_b).status_code == 200

    def test_02_wrong_current_401(self):
        r = _change(self.__class__.token_a, "wrongpass", "Nuova1234")
        assert r.status_code == 401, r.text

    def test_03_weak_new_422(self):
        r = _change(self.__class__.token_a, self.original_pw, "tuttominuscolo")
        assert r.status_code == 422, r.text

    def test_04_same_as_current_400(self):
        r = _change(self.__class__.token_a, self.original_pw, self.original_pw)
        assert r.status_code == 400, r.text

    def test_05_valid_change_returns_token(self):
        r = _change(self.__class__.token_a, self.original_pw, self.new_pw)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert isinstance(body.get("token"), str) and len(body["token"]) > 20
        self.__class__.new_token = body["token"]

    def test_06_old_tokens_invalidated(self):
        assert _me(self.__class__.token_a).status_code == 401
        assert _me(self.__class__.token_b).status_code == 401

    def test_07_new_token_works(self):
        r = _me(self.__class__.new_token)
        assert r.status_code == 200, r.text
        body = r.json()
        user = body.get("user", body)
        assert (user.get("email") or "").lower() == self.__class__.email.lower()

    def test_08_login_with_old_and_new(self):
        assert _login(self.__class__.email, self.original_pw).status_code == 401
        r = _login(self.__class__.email, self.new_pw)
        assert r.status_code == 200
        assert _me(r.json()["token"]).status_code == 200

    def test_09_change_again_and_cleanup(self):
        r = _change(self.__class__.new_token, self.new_pw, self.newer_pw)
        assert r.status_code == 200, r.text
        newer_token = r.json()["token"]
        # cleanup: delete the temp user with the freshest token
        d = requests.delete(f"{API}/auth/me", headers={"Authorization": f"Bearer {newer_token}"})
        assert d.status_code == 200, d.text
        # after deletion, the token should no longer authenticate
        assert _me(newer_token).status_code == 401


# ---------------- Admin round-trip ----------------
class TestAdminChangePasswordRoundTrip:
    temp_pw = "Temp!Admin2026x"

    def test_10_admin_roundtrip(self):
        # Login as admin
        r = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
        assert r.status_code == 200, r.text
        old_token = r.json()["token"]

        # Change to temp
        r = _change(old_token, ADMIN_PASSWORD, self.temp_pw)
        assert r.status_code == 200, r.text
        new_token = r.json()["token"]
        assert isinstance(new_token, str)

        try:
            # Old admin token invalidated
            assert _me(old_token).status_code == 401
            # New token works
            assert _me(new_token).status_code == 200

            # Admin audit contains change_password action for this admin
            aud = requests.get(f"{API}/admin/audit?limit=50", headers={"Authorization": f"Bearer {new_token}"})
            assert aud.status_code == 200, aud.text
            payload = aud.json()
            items = payload if isinstance(payload, list) else payload.get("items", [])
            actions = [it.get("action") for it in items]
            emails = [it.get("admin_email") for it in items]
            assert "change_password" in actions, f"audit missing change_password: {actions[:20]}"
            assert ADMIN_EMAIL in emails

            # Login with old admin password should now fail
            assert _login(ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 401
            # Login with new temp password works
            assert _login(ADMIN_EMAIL, self.temp_pw).status_code == 200
        finally:
            # ALWAYS restore original admin password
            restore = _change(new_token, self.temp_pw, ADMIN_PASSWORD)
            assert restore.status_code == 200, restore.text
            # And confirm login with original credentials works
            back = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
            assert back.status_code == 200, back.text
            assert _me(back.json()["token"]).status_code == 200
