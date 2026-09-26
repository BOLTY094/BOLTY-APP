"""News section — real articles from reliable Italian energy-sector RSS feeds.

- Fetched automatically every 3 days (checked every 6h), stored in Mongo `news` (deduped by link).
- Nothing is generated: title, summary, date, link and source come from the publisher's feed.
- General-economy feeds are filtered by energy keywords; specialised feeds are taken as-is.
"""
import asyncio
import html
import logging
import re
from datetime import datetime, timezone, timedelta
from time import mktime

import feedparser
import httpx

logger = logging.getLogger("bolty.news")

REFRESH_EVERY = timedelta(days=3)
CHECK_EVERY_SECONDS = 6 * 3600
MAX_PER_FEED = 40

FEEDS = [
    {"name": "QualEnergia.it", "url": "https://www.qualenergia.it/feed/", "filter": False},
    {"name": "Canale Energia", "url": "https://www.canaleenergia.com/feed/", "filter": False},
    {"name": "Rinnovabili.it", "url": "https://www.rinnovabili.it/energia/feed/", "filter": False},
    {"name": "ANSA Economia", "url": "https://www.ansa.it/sito/notizie/economia/economia_rss.xml", "filter": True},
    {"name": "Il Sole 24 Ore", "url": "https://www.ilsole24ore.com/rss/economia.xml", "filter": True},
]

KEYWORDS = re.compile(
    r"\b(energia|energetic\w*|gas|luce|elettric\w*|bollett\w*|arera|pun\b|psv\b|mercato libero|fornitor\w*|"
    r"rinnovabil\w*|fotovoltaic\w*|eolic\w*|tariff\w*|metano|gnl|ttf|nucleare|rete elettrica|"
    r"terna|snam|enel|eni\b|edison|a2a|hera|iren|plenitude|gme\b|prezzo dell'energia|caro bollette)\b",
    re.I,
)


def _clean(text: str, limit: int = 320) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(re.sub(r"\s+", " ", text)).strip()
    return text[: limit - 1] + "…" if len(text) > limit else text


def _published(entry) -> str | None:
    for key in ("published_parsed", "updated_parsed"):
        t = entry.get(key)
        if t:
            try:
                return datetime.fromtimestamp(mktime(t), tz=timezone.utc).isoformat()
            except Exception:
                continue
    return None


def _category(title: str, summary: str) -> str:
    blob = f"{title} {summary}".lower()
    if re.search(r"\bgas\b|metano|gnl|psv|ttf", blob):
        return "gas"
    if re.search(r"elettric|luce|pun\b|rete|terna|fotovoltaic|eolic|rinnovabil", blob):
        return "luce"
    if re.search(r"bollett|tariff|mercato libero|fornitor|arera|offert", blob):
        return "mercato"
    return "energia"


async def fetch_feed(feed: dict) -> list[dict]:
    async with httpx.AsyncClient(timeout=25, headers={"User-Agent": "Mozilla/5.0 (Bolty news)"}, follow_redirects=True) as c:
        r = await c.get(feed["url"])
        r.raise_for_status()
    parsed = feedparser.parse(r.content)
    items = []
    for e in parsed.entries[:MAX_PER_FEED]:
        link = (e.get("link") or "").strip()
        title = _clean(e.get("title") or "", 200)
        if not link or not title:
            continue
        summary = _clean(e.get("summary") or e.get("description") or "")
        if feed["filter"] and not KEYWORDS.search(f"{title} {summary}"):
            continue
        published = _published(e)
        if not published:
            continue  # no reliable date -> skip, never invent one
        items.append({
            "link": link,
            "title": title,
            "summary": summary,
            "source": feed["name"],
            "source_url": feed["url"],
            "published_at": published,
            "category": _category(title, summary),
        })
    return items


async def refresh_news(db, force: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    state = await db.news_state.find_one({"_id": "news"})
    if state and not force:
        last = datetime.fromisoformat(state["last_refresh"])
        if now - last < REFRESH_EVERY:
            return {"refreshed": False, "next_refresh": (last + REFRESH_EVERY).isoformat()}

    added, errors = 0, []
    for feed in FEEDS:
        try:
            items = await fetch_feed(feed)
        except Exception as e:
            errors.append(f"{feed['name']}: {e}")
            logger.warning(f"News feed {feed['name']} failed: {e}")
            continue
        for it in items:
            res = await db.news.update_one(
                {"link": it["link"]},
                {"$setOnInsert": {**it, "fetched_at": now.isoformat()}},
                upsert=True,
            )
            if res.upserted_id is not None:
                added += 1
    await db.news_state.update_one(
        {"_id": "news"},
        {"$set": {"last_refresh": now.isoformat(), "last_added": added, "last_errors": errors}},
        upsert=True,
    )
    logger.info(f"News refreshed: +{added} articles, errors={len(errors)}")
    return {"refreshed": True, "added": added, "errors": errors, "last_refresh": now.isoformat()}


async def refresh_loop(db) -> None:
    while True:
        try:
            await refresh_news(db)
        except Exception as e:
            logger.warning(f"News refresh loop: {e}")
        await asyncio.sleep(CHECK_EVERY_SECONDS)


async def list_news(db, limit: int = 30, before: str | None = None) -> dict:
    query = {"published_at": {"$lt": before}} if before else {}
    items = await db.news.find(query, {"_id": 0}).sort("published_at", -1).to_list(limit + 1)
    has_more = len(items) > limit
    state = await db.news_state.find_one({"_id": "news"}, {"_id": 0}) or {}
    return {
        "items": items[:limit],
        "has_more": has_more,
        "next_before": items[limit - 1]["published_at"] if has_more else None,
        "last_refresh": state.get("last_refresh"),
        "next_refresh": (datetime.fromisoformat(state["last_refresh"]) + REFRESH_EVERY).isoformat() if state.get("last_refresh") else None,
        "sources": [f["name"] for f in FEEDS],
    }
