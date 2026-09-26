"""
Tests for the market data feature.

Covers:
- GET /api/market/overview (auth, shape, values)
- POST /api/admin/market/refresh (auth, admin-only, DB persistence)
- Unit tests for market.py helpers: _month_keys, _last_complete_month,
  fetch_gas parsing, and market_overview fallback path with an empty DB.
"""
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests

# Make sure /app/backend is importable so `import market` works
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import market  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASSWORD = "Bolty!Admin2026"

MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")


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


# ---------------------------------------------------------------------------
# GET /api/market/overview
# ---------------------------------------------------------------------------
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
        for k in ("updated_at", "reference_month", "live", "disclaimer", "luce", "gas", "insights", "sources"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["live"], bool)

        # insights - exactly 3 items with title/text
        assert isinstance(data["insights"], list) and len(data["insights"]) == 3
        for it in data["insights"]:
            assert it.get("title") and it.get("text")

        # sources - exactly 2 items (luce + gas)
        assert isinstance(data["sources"], list) and len(data["sources"]) == 2

        # per-block validation
        for key in ("luce", "gas"):
            b = data[key]
            for k in ("kind", "current", "current_month", "unit", "previous",
                      "delta_month_pct", "delta_year_pct", "trend", "series",
                      "status", "fetched_at", "label",
                      "household_unit", "household_price", "month_to_date",
                      "note", "source"):
                assert k in b, f"{key} missing key {k}"
            assert b["kind"] == key
            assert isinstance(b["current"], (int, float))
            assert isinstance(b["previous"], (int, float))
            assert isinstance(b["delta_month_pct"], (int, float))
            assert isinstance(b["delta_year_pct"], (int, float))
            assert b["unit"] == "€/MWh"
            assert isinstance(b["trend"], str) and b["trend"]
            assert isinstance(b["series"], list) and len(b["series"]) == 12
            for p in b["series"]:
                assert p.get("month") and MONTH_KEY_RE.match(p.get("key", ""))
                assert isinstance(p["value"], (int, float))
            assert isinstance(b["household_price"], str) and "," in b["household_price"]

        # spec: last complete month before today (server = Sep 2026) => "2026-08"
        for key in ("luce", "gas"):
            keys = [p["key"] for p in data[key]["series"]]
            # 12 consecutive months ending at "2026-08"
            assert keys[-1] == "2026-08", f"{key} last series key is {keys[-1]}"
            for i in range(1, 12):
                y0, m0 = map(int, keys[i - 1].split("-"))
                y1, m1 = map(int, keys[i].split("-"))
                assert (y1, m1) == (y0 + (1 if m0 == 12 else 0), 1 if m0 == 12 else m0 + 1)

        # plausible ranges + household units
        assert 20 <= data["luce"]["current"] <= 600
        assert 5 <= data["gas"]["current"] <= 300
        assert data["luce"]["household_unit"] == "€/kWh"
        assert data["gas"]["household_unit"] == "€/Smc"

        # luce.household_price ≈ current / 1000 (formatted "0,xyz")
        hp_luce = float(data["luce"]["household_price"].replace(",", "."))
        assert abs(hp_luce - data["luce"]["current"] / 1000) < 0.002

        # month_to_date shape
        mtd = data["luce"]["month_to_date"]
        if mtd is not None:
            assert "month" in mtd and "value" in mtd
        assert data["gas"]["month_to_date"] is None

        # statuses
        assert data["luce"]["status"] in ("live", "fallback")
        assert data["gas"]["status"] in ("live", "fallback")

    def test_admin_ok(self, http, admin_token):
        r = http.get(f"{API}/market/overview", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["luce"]["current"] > 0 and data["gas"]["current"] > 0


# ---------------------------------------------------------------------------
# POST /api/admin/market/refresh
# ---------------------------------------------------------------------------
class TestMarketRefresh:
    def test_refresh_unauth(self, http):
        r = http.post(f"{API}/admin/market/refresh", timeout=60)
        assert r.status_code == 401

    def test_refresh_customer_forbidden(self, http, customer_token):
        r = http.post(f"{API}/admin/market/refresh", headers=_hdr(customer_token), timeout=60)
        assert r.status_code == 403

    def test_refresh_admin_ok(self, http, admin_token):
        before = datetime.now(timezone.utc)
        r = http.post(f"{API}/admin/market/refresh", headers=_hdr(admin_token), timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        # After forced refresh with reachable sources we expect live=True
        assert data["live"] is True, data
        assert data["luce"]["status"] == "live"
        assert data["gas"]["status"] == "live"

        # Verify Mongo persistence: kind='luce' and kind='gas' with fresh fetched_at
        async def _check():
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                db = client[DB_NAME]
                luce = await db.market_data.find_one({"kind": "luce"}, {"_id": 0})
                gas = await db.market_data.find_one({"kind": "gas"}, {"_id": 0})
                assert luce and gas, "missing market_data docs"
                assert luce["status"] == "live" and gas["status"] == "live"
                fl = datetime.fromisoformat(luce["fetched_at"])
                fg = datetime.fromisoformat(gas["fetched_at"])
                # fetched_at should be at or after the start of this test
                assert fl >= before.replace(microsecond=0) - abs(before - before)
                assert fg >= before.replace(microsecond=0) - abs(before - before)
                # series present
                assert isinstance(luce["series"], dict) and len(luce["series"]) >= 6
                assert isinstance(gas["series"], dict) and len(gas["series"]) >= 6
            finally:
                client.close()

        asyncio.run(_check())


# ---------------------------------------------------------------------------
# Unit tests for market.py helpers
# ---------------------------------------------------------------------------
class TestMarketHelpers:
    def test_month_keys_consecutive(self):
        keys = market._month_keys("2026-08", 12)
        assert len(keys) == 12
        assert keys[-1] == "2026-08"
        assert keys[0] == "2025-09"
        # all consecutive
        for i in range(1, 12):
            y0, m0 = map(int, keys[i - 1].split("-"))
            y1, m1 = map(int, keys[i].split("-"))
            expected = (y0 + 1, 1) if m0 == 12 else (y0, m0 + 1)
            assert (y1, m1) == expected

    def test_month_keys_year_rollover(self):
        keys = market._month_keys("2026-02", 4)
        assert keys == ["2025-11", "2025-12", "2026-01", "2026-02"]

    def test_last_complete_month(self):
        d = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)
        assert market._last_complete_month(d) == "2026-08"
        d2 = datetime(2026, 1, 3, 0, 0, tzinfo=timezone.utc)
        assert market._last_complete_month(d2) == "2025-12"

    def test_fetch_gas_parsing(self):
        result = asyncio.run(market.fetch_gas())
        assert isinstance(result, dict) and len(result) >= 6
        # every key is YYYY-MM and every value is {mwh, smc}
        for k, v in result.items():
            assert MONTH_KEY_RE.match(k)
            assert "mwh" in v and "smc" in v
            assert 5 <= float(v["mwh"]) <= 300
            assert 0.005 <= float(v["smc"]) <= 3.0

    def test_market_overview_fallback_with_empty_db(self):
        """With an empty temporary DB, market_overview must not raise and must
        return status='fallback' and live=False for both blocks."""
        temp_db_name = f"TEST_market_fallback_{uuid.uuid4().hex[:8]}"

        async def _run():
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                db = client[temp_db_name]
                data = await market.market_overview(db)
                assert data["live"] is False
                assert data["luce"]["status"] == "fallback"
                assert data["gas"]["status"] == "fallback"
                # shape is still complete
                assert len(data["luce"]["series"]) == 12
                assert len(data["gas"]["series"]) == 12
                assert data["gas"]["household_price"] and "," in data["gas"]["household_price"]
                assert data["luce"]["household_price"] and "," in data["luce"]["household_price"]
            finally:
                await client.drop_database(temp_db_name)
                client.close()

        asyncio.run(_run())
