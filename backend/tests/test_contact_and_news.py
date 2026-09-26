"""Tests for new endpoints: contact request on bill + news feed."""
import io
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


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer(http):
    email = f"TEST_{uuid.uuid4().hex[:8]}@test.it"
    r = http.post(f"{API}/auth/register",
                  json={"name": "Test Contact", "email": email, "password": "Test1234"},
                  timeout=30)
    assert r.status_code == 200, r.text
    return {"email": email, "token": r.json()["token"], "user_id": r.json()["user"]["user_id"]}


@pytest.fixture(scope="module")
def customer_bill(http, customer):
    """Upload a tiny non-PDF (extraction fails fast -> all fields null, method image-vision)."""
    files = {"file": ("tiny.jpg", io.BytesIO(b"\xff\xd8\xff\xe0not-a-real-jpeg"), "image/jpeg")}
    r = http.post(f"{API}/upload", headers=_hdr(customer["token"]),
                  files=files, data={"category": "luce"}, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()


# ============================================================================
# Contact request validations
# ============================================================================
class TestContactRequest:
    def test_missing_both_email_and_phone_returns_422(self, http, customer, customer_bill):
        r = http.post(f"{API}/bills/{customer_bill['bill_id']}/contact",
                      headers=_hdr(customer["token"]),
                      json={"consent": True}, timeout=30)
        assert r.status_code == 422, r.text

    def test_invalid_email_returns_422(self, http, customer, customer_bill):
        r = http.post(f"{API}/bills/{customer_bill['bill_id']}/contact",
                      headers=_hdr(customer["token"]),
                      json={"email": "abc", "consent": True}, timeout=30)
        assert r.status_code == 422

    def test_invalid_phone_returns_422(self, http, customer, customer_bill):
        r = http.post(f"{API}/bills/{customer_bill['bill_id']}/contact",
                      headers=_hdr(customer["token"]),
                      json={"phone": "12ab", "consent": True}, timeout=30)
        assert r.status_code == 422

    def test_missing_consent_returns_422(self, http, customer, customer_bill):
        r = http.post(f"{API}/bills/{customer_bill['bill_id']}/contact",
                      headers=_hdr(customer["token"]),
                      json={"email": "cliente@esempio.it", "consent": False}, timeout=30)
        assert r.status_code == 422

    def test_other_users_bill_returns_404(self, http, customer_bill):
        # Register a different user
        email2 = f"TEST_{uuid.uuid4().hex[:8]}@test.it"
        r = http.post(f"{API}/auth/register",
                      json={"name": "Other", "email": email2, "password": "Test1234"}, timeout=30)
        assert r.status_code == 200
        other_token = r.json()["token"]
        r = http.post(f"{API}/bills/{customer_bill['bill_id']}/contact",
                      headers=_hdr(other_token),
                      json={"email": "cliente@esempio.it", "consent": True}, timeout=30)
        assert r.status_code == 404

    @pytest.mark.skipif(os.environ.get("SKIP_REAL_EMAIL") == "1",
                        reason="Set SKIP_REAL_EMAIL=1 to avoid sending real email")
    def test_valid_contact_request_success(self, http, customer, customer_bill):
        r = http.post(f"{API}/bills/{customer_bill['bill_id']}/contact",
                      headers=_hdr(customer["token"]),
                      json={"email": "cliente@esempio.it",
                            "phone": "+39 333 1234567",
                            "consent": True},
                      timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        cr = body.get("contact_request")
        assert cr is not None
        assert cr["email"] == "cliente@esempio.it"
        # phone should be normalised (spaces stripped)
        assert cr["phone"] == "+393331234567"
        assert cr["status"] == "da_contattare"
        assert "consent_at" in cr and cr["consent_at"]

        # Notification created
        n = http.get(f"{API}/notifications", headers=_hdr(customer["token"]), timeout=30)
        assert n.status_code == 200
        titles = [x.get("title") for x in n.json()]
        assert "Richiesta di contatto inviata" in titles


# ============================================================================
# News
# ============================================================================
class TestNews:
    def test_get_news_requires_auth(self, http):
        r = http.get(f"{API}/news", timeout=30)
        assert r.status_code == 401

    def test_get_news_returns_paginated_items(self, http, customer):
        r = http.get(f"{API}/news?limit=5", headers=_hdr(customer["token"]), timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "items" in body
        assert "has_more" in body
        assert "next_before" in body
        assert "last_refresh" in body
        assert "next_refresh" in body
        assert "sources" in body and len(body["sources"]) == 5
        assert set(body["sources"]) == {
            "QualEnergia.it", "Canale Energia", "Rinnovabili.it",
            "ANSA Economia", "Il Sole 24 Ore",
        }
        # If any items were fetched, validate schema and sort order
        items = body["items"]
        if items:
            assert len(items) <= 5
            for it in items:
                assert it["title"] and isinstance(it["title"], str)
                assert it["link"].startswith("http")
                assert it["source"] in set(body["sources"])
                assert it["published_at"]
                assert it["category"] in {"luce", "gas", "mercato", "energia"}
                assert "summary" in it
            # sorted desc by published_at
            dates = [it["published_at"] for it in items]
            assert dates == sorted(dates, reverse=True)

    def test_pagination_no_duplicates(self, http, customer):
        r = http.get(f"{API}/news?limit=5", headers=_hdr(customer["token"]), timeout=30)
        assert r.status_code == 200
        page1 = r.json()
        if not page1["has_more"] or not page1["items"]:
            pytest.skip("Not enough news to paginate")
        r2 = http.get(f"{API}/news?limit=5&before={page1['next_before']}",
                      headers=_hdr(customer["token"]), timeout=30)
        assert r2.status_code == 200
        page2 = r2.json()
        # No duplicate links
        links1 = {i["link"] for i in page1["items"]}
        links2 = {i["link"] for i in page2["items"]}
        assert not links1 & links2
        # All page2 items are older than next_before
        for i in page2["items"]:
            assert i["published_at"] < page1["next_before"]

    def test_next_refresh_is_last_refresh_plus_3_days(self, http, customer):
        from datetime import datetime, timedelta
        r = http.get(f"{API}/news?limit=1", headers=_hdr(customer["token"]), timeout=30)
        body = r.json()
        if not body.get("last_refresh"):
            pytest.skip("No refresh has happened yet")
        last = datetime.fromisoformat(body["last_refresh"])
        nxt = datetime.fromisoformat(body["next_refresh"])
        assert nxt - last == timedelta(days=3)

    def test_admin_force_refresh(self, http, admin_token):
        r = http.post(f"{API}/admin/news/refresh", headers=_hdr(admin_token), timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["refreshed"] is True
        assert body["added"] >= 0
        assert isinstance(body["errors"], list)

    def test_customer_force_refresh_forbidden(self, http, customer):
        r = http.post(f"{API}/admin/news/refresh", headers=_hdr(customer["token"]), timeout=30)
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_refresh_news_under_3_days_returns_next_refresh(self):
        """Direct call: right after a force refresh, subsequent non-force call must NOT refresh."""
        import sys
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        import news as news_mod
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        try:
            # Force a refresh so last_refresh is now
            await news_mod.refresh_news(db, force=True)
            res = await news_mod.refresh_news(db, force=False)
            assert res["refreshed"] is False
            assert "next_refresh" in res
        finally:
            client.close()

    def test_no_duplicate_links_in_collection(self):
        """Check there are no duplicate links in the news collection."""
        import pymongo
        client = pymongo.MongoClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        try:
            pipeline = [{"$group": {"_id": "$link", "n": {"$sum": 1}}},
                        {"$match": {"n": {"$gt": 1}}}]
            dups = list(db.news.aggregate(pipeline))
            assert dups == [], f"Duplicate news links found: {dups}"
        finally:
            client.close()
