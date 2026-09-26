"""Market data (luce/gas) from public sources, cached in Mongo and refreshed monthly.

- Luce: day-ahead price, bidding zone IT-North (Energy-Charts / Bundesnetzagentur SMARD, CC BY 4.0),
  monthly average in EUR/MWh — reference for the PUN.
- Gas: ARERA CMEM,m (official monthly average of the PSV day-ahead) in EUR/MWh and EUR/Smc.
"""
import asyncio
import logging
import re
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger("bolty.market")

ROME = ZoneInfo("Europe/Rome")
MONTHS_SHOWN = 12
CACHE_TTL = timedelta(hours=24)

ENERGY_CHARTS_URL = "https://api.energy-charts.info/price"
ARERA_CMEM_URL = "https://www.arera.it/area-operatori/prezzi-e-tariffe/valore-cmemm-vulnerabili"

IT_MONTHS = {
    "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
    "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
}
IT_MONTH_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

# Fallback (indicative) series used only if a source is unreachable and nothing is cached yet.
FALLBACK = {
    "luce": {"2025-09": 107.5, "2025-10": 112.1, "2025-11": 118.3, "2025-12": 115.5, "2026-01": 133.8, "2026-02": 115.9,
             "2026-03": 144.2, "2026-04": 121.1, "2026-05": 122.5, "2026-06": 133.7, "2026-07": 156.2, "2026-08": 177.1},
    "gas": {"2025-09": 34.89, "2025-10": 33.05, "2025-11": 32.59, "2025-12": 30.65, "2026-01": 37.75, "2026-02": 35.21,
            "2026-03": 52.12, "2026-04": 46.01, "2026-05": 46.89, "2026-06": 47.18, "2026-07": 56.69, "2026-08": 64.15},
}


def _month_label(key: str) -> str:
    y, m = key.split("-")
    return f"{IT_MONTH_SHORT[int(m) - 1]} {y[2:]}"


def _last_complete_month(now: datetime) -> str:
    first = now.astimezone(ROME).replace(day=1)
    prev = first - timedelta(days=1)
    return prev.strftime("%Y-%m")


def _month_keys(end_key: str, n: int) -> list[str]:
    y, m = (int(x) for x in end_key.split("-"))
    keys = []
    for _ in range(n):
        keys.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(keys))


# --------------------------------------------------------------------------- fetchers
async def fetch_luce(now: datetime) -> dict[str, float]:
    """Monthly averages (EUR/MWh) for IT-North, last 13 complete months + current partial month."""
    start = (now.astimezone(ROME).replace(day=1) - timedelta(days=13 * 31)).replace(day=1)
    params = {"bzn": "IT-North", "start": start.strftime("%Y-%m-%d"), "end": now.astimezone(ROME).strftime("%Y-%m-%d")}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(ENERGY_CHARTS_URL, params=params)
        r.raise_for_status()
        data = r.json()
    buckets: dict[str, list[float]] = defaultdict(list)
    for ts, price in zip(data.get("unix_seconds", []), data.get("price", [])):
        if price is None:
            continue
        buckets[datetime.fromtimestamp(ts, ROME).strftime("%Y-%m")].append(float(price))
    return {k: round(sum(v) / len(v), 2) for k, v in buckets.items() if v}


async def fetch_gas() -> dict[str, dict]:
    """ARERA CMEM,m table -> {YYYY-MM: {mwh, smc}}."""
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": "Mozilla/5.0 (Bolty market)"}, follow_redirects=True) as client:
        r = await client.get(ARERA_CMEM_URL)
        r.raise_for_status()
        html = r.text
    table = re.search(r"<table.*?</table>", html, re.S)
    if not table:
        raise ValueError("ARERA: tabella CMEM non trovata")
    out: dict[str, dict] = {}
    year = None
    for row in re.findall(r"<tr.*?</tr>", table.group(0), re.S):
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)]
        if not cells:
            continue
        if re.fullmatch(r"20\d{2}", cells[0]):
            year = int(cells[0])
            continue
        month = IT_MONTHS.get(cells[0].lower())
        if year and month and len(cells) >= 4 and cells[1]:
            try:
                mwh = float(cells[1].replace(".", "").replace(",", "."))
                smc = float(cells[3].replace(".", "").replace(",", "."))
            except ValueError:
                continue
            out[f"{year:04d}-{month:02d}"] = {"mwh": round(mwh, 2), "smc": round(smc, 4)}
    if not out:
        raise ValueError("ARERA: nessun valore CMEM estratto")
    return out


# --------------------------------------------------------------------------- cache / refresh
async def refresh_market(db, force: bool = False) -> None:
    now = datetime.now(timezone.utc)
    for kind in ("luce", "gas"):
        cached = await db.market_data.find_one({"kind": kind})
        if cached and not force:
            fetched = datetime.fromisoformat(cached["fetched_at"])
            if now - fetched < CACHE_TTL:
                continue
        try:
            if kind == "luce":
                series = await fetch_luce(now)
                doc = {"kind": kind, "series": series, "fetched_at": now.isoformat(), "status": "live"}
            else:
                series = await fetch_gas()
                doc = {"kind": kind, "series": series, "fetched_at": now.isoformat(), "status": "live"}
            await db.market_data.update_one({"kind": kind}, {"$set": doc}, upsert=True)
            logger.info(f"Market {kind}: refreshed ({len(series)} mesi)")
        except Exception as e:
            logger.warning(f"Market {kind}: refresh failed: {e}")
            if cached:
                await db.market_data.update_one({"kind": kind}, {"$set": {"last_error": str(e), "last_error_at": now.isoformat()}})


async def refresh_loop(db) -> None:
    """Background task: check daily; sources publish new monthly values in the first days of each month."""
    while True:
        try:
            await refresh_market(db)
        except Exception as e:
            logger.warning(f"Market refresh loop: {e}")
        await asyncio.sleep(6 * 3600)


# --------------------------------------------------------------------------- overview
def _pct(cur: float, ref: float | None) -> float | None:
    if ref is None or ref == 0:
        return None
    return round((cur - ref) / ref * 100, 1)


def _trend(delta: float | None) -> str:
    if delta is None:
        return "stabile"
    return "in calo" if delta < -1 else "in aumento" if delta > 1 else "stabile"


def _block(kind: str, values: dict[str, float], end_key: str, status: str, fetched_at: str | None, extra: dict) -> dict:
    keys = _month_keys(end_key, MONTHS_SHOWN)
    series = [{"month": _month_label(k), "key": k, "value": values.get(k)} for k in keys]
    available = [k for k in keys if values.get(k) is not None]
    cur_key = available[-1] if available else end_key
    current = values.get(cur_key)
    prev_key = _month_keys(cur_key, 2)[0]
    year_key = f"{int(cur_key[:4]) - 1}{cur_key[4:]}"
    delta_m = _pct(current, values.get(prev_key)) if current is not None else None
    delta_y = _pct(current, values.get(year_key)) if current is not None else None
    return {
        "kind": kind,
        "current": current,
        "current_month": _month_label(cur_key),
        "unit": "€/MWh",
        "previous": values.get(prev_key),
        "delta_month_pct": delta_m,
        "delta_year_pct": delta_y,
        "trend": _trend(delta_m),
        "series": series,
        "status": status,
        "fetched_at": fetched_at,
        **extra,
    }


def _insights(luce: dict, gas: dict) -> list[dict]:
    out = []
    dl, dg = luce.get("delta_month_pct"), gas.get("delta_month_pct")
    if dl is not None:
        if dl < -1:
            out.append({"title": "Luce in calo", "text": f"Il prezzo all'ingrosso dell'elettricità è sceso del {abs(dl):.1f}% nell'ultimo mese: le offerte a prezzo variabile indicizzato stanno diventando più convenienti."})
        elif dl > 1:
            out.append({"title": "Luce in aumento", "text": f"Il prezzo all'ingrosso dell'elettricità è salito del {dl:.1f}% nell'ultimo mese: se hai un'offerta variabile, valuta un prezzo fisso per proteggerti dai rincari."})
        else:
            out.append({"title": "Luce stabile", "text": "Il prezzo all'ingrosso dell'elettricità è stabile: è un buon momento per confrontare con calma le offerte disponibili."})
    if dg is not None:
        if dg < -1:
            out.append({"title": "Gas in calo", "text": f"Il PSV è sceso del {abs(dg):.1f}% rispetto al mese precedente. Cambiare fornitore ora può bloccare un prezzo conveniente prima dell'inverno."})
        elif dg > 1:
            out.append({"title": "Gas in aumento", "text": f"Il PSV è salito del {dg:.1f}% rispetto al mese precedente. Controlla la componente materia prima della tua bolletta: potresti pagare più del necessario."})
        else:
            out.append({"title": "Gas stabile", "text": "Il prezzo del gas all'ingrosso è stabile: confronta la quota fissa e gli oneri, spesso pesano più della materia prima."})
    out.append({"title": "Controlla il costo fisso", "text": "Oltre al prezzo dell'energia, verifica la quota fissa mensile e gli oneri: spesso pesano più di quanto sembri."})
    return out


async def market_overview(db) -> dict:
    now = datetime.now(timezone.utc)
    end_key = _last_complete_month(now)

    luce_doc = await db.market_data.find_one({"kind": "luce"}, {"_id": 0})
    gas_doc = await db.market_data.find_one({"kind": "gas"}, {"_id": 0})

    if luce_doc:
        luce_vals = {k: float(v) for k, v in luce_doc["series"].items()}
        luce_status, luce_fetched = "live", luce_doc["fetched_at"]
    else:
        luce_vals, luce_status, luce_fetched = dict(FALLBACK["luce"]), "fallback", None

    if gas_doc:
        gas_vals = {k: float(v["mwh"]) for k, v in gas_doc["series"].items()}
        gas_smc = {k: float(v["smc"]) for k, v in gas_doc["series"].items()}
        gas_status, gas_fetched = "live", gas_doc["fetched_at"]
    else:
        gas_vals, gas_status, gas_fetched = dict(FALLBACK["gas"]), "fallback", None
        gas_smc = {k: round(v * 0.0107, 4) for k, v in gas_vals.items()}

    # Current partial month for luce (day-ahead is daily, so we can show "month to date").
    cur_month_key = now.astimezone(ROME).strftime("%Y-%m")
    luce_mtd = luce_vals.get(cur_month_key)

    luce = _block(
        "luce", luce_vals, end_key, luce_status, luce_fetched,
        {
            "label": "Prezzo day-ahead · Zona Nord (riferimento PUN)",
            "household_unit": "€/kWh",
            "household_price": None,
            "month_to_date": {"month": _month_label(cur_month_key), "value": luce_mtd} if luce_mtd is not None else None,
            "note": "Media mensile del prezzo all'ingrosso dell'elettricità nella zona Nord Italia, che rappresenta oltre la metà dei consumi nazionali ed è il riferimento più vicino al PUN. Quando scende, le offerte a prezzo variabile diventano più convenienti.",
            "source": "Energy-Charts (Fraunhofer ISE) · dati Bundesnetzagentur | SMARD.de · CC BY 4.0",
        },
    )
    if luce["current"] is not None:
        luce["household_price"] = f"{luce['current'] / 1000:.3f}".replace(".", ",")

    gas = _block(
        "gas", gas_vals, end_key, gas_status, gas_fetched,
        {
            "label": "PSV · media mensile ufficiale (CMEM,m ARERA)",
            "household_unit": "€/Smc",
            "household_price": None,
            "month_to_date": None,
            "note": "Il PSV è il riferimento del prezzo del gas all'ingrosso in Italia. ARERA ne pubblica la media mensile entro i primi due giorni lavorativi del mese successivo.",
            "source": "ARERA – Autorità di Regolazione per Energia Reti e Ambiente (componente CMEM,m)",
        },
    )
    gas_cur_key = next((s["key"] for s in reversed(gas["series"]) if s["value"] is not None), None)
    if gas_cur_key and gas_smc.get(gas_cur_key) is not None:
        gas["household_price"] = f"{gas_smc[gas_cur_key]:.3f}".replace(".", ",")

    fetched = [d for d in (luce_fetched, gas_fetched) if d]
    return {
        "updated_at": max(fetched) if fetched else now.isoformat(),
        "reference_month": _month_label(end_key),
        "live": luce_status == "live" and gas_status == "live",
        "disclaimer": "Prezzi all'ingrosso (materia prima), medie mensili. Il prezzo in bolletta include anche quota fissa, trasporto, oneri e imposte. Non costituiscono un'offerta commerciale.",
        "luce": luce,
        "gas": gas,
        "insights": _insights(luce, gas),
        "sources": [luce["source"], gas["source"]],
    }
