"""
Tests for GET /api/market/overview.
- 401 without token
- 200 with customer token; shape and values are correct
- 200 with admin token
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASSWORD = "Bolty!Admin2026"


@pytest.fixture(scope="module")
def http():
    return requests.Session()


@pytest.fixture(scope="module")
def customer_token(http):
    email = f"TEST_market_{uuid.uuid4().hex[:8]}@test.it"
    r = http.post(f"{API}/auth/register", json={"name": "Test Market", "email": email, "password": "Test1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


class TestMarketOverview:
    def test_unauthorized(self, http):
        r = http.get(f"{API}/market/overview", timeout=30)
        assert r.status_code == 401

    def test_bad_token(self, http):
        r = http.get(f"{API}/market/overview", headers=_hdr("nope"), timeout=30)
        assert r.status_code == 401

    def test_customer_shape(self, http, customer_token):
        r = http.get(f"{API}/market/overview", headers=_hdr(customer_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()

        # top-level keys
        for k in ("updated_at", "disclaimer", "luce", "gas", "insights", "sources"):
            assert k in data, f"missing key {k}"

        # insights - 3 items with title/text
        assert isinstance(data["insights"], list) and len(data["insights"]) == 3
        for it in data["insights"]:
            assert "title" in it and "text" in it and it["title"] and it["text"]

        # sources - non-empty list
        assert isinstance(data["sources"], list) and len(data["sources"]) >= 1

        # per-block validation
        for key in ("luce", "gas"):
            b = data[key]
            for k in ("current", "unit", "previous", "delta_month_pct", "delta_year_pct", "trend",
                      "series", "household_unit", "household_price", "note"):
                assert k in b, f"{key} missing key {k}"
            assert isinstance(b["current"], (int, float))
            assert isinstance(b["previous"], (int, float))
            assert isinstance(b["delta_month_pct"], (int, float))
            assert isinstance(b["delta_year_pct"], (int, float))
            assert b["unit"] == "€/MWh"
            assert isinstance(b["trend"], str) and b["trend"]
            assert isinstance(b["series"], list) and len(b["series"]) == 12
            for p in b["series"]:
                assert "month" in p and "value" in p
                assert isinstance(p["month"], str) and p["month"]
                assert isinstance(p["value"], (int, float))
            assert b["household_unit"] in ("€/kWh", "€/Smc")
            assert isinstance(b["household_price"], str) and b["household_price"]
            assert isinstance(b["note"], str) and b["note"]

        # spec: luce current 90, gas current 28
        assert data["luce"]["current"] == 90
        assert data["gas"]["current"] == 28
        assert data["luce"]["household_unit"] == "€/kWh"
        assert data["gas"]["household_unit"] == "€/Smc"

    def test_admin_ok(self, http, admin_token):
        r = http.get(f"{API}/market/overview", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["luce"]["current"] == 90 and data["gas"]["current"] == 28
