"""Bill data extraction — ONLY values that are really present in the uploaded document.

Pipeline:
1. PDF with text layer  -> text via pdfplumber
2. Scanned PDF / photo  -> page renders (pypdfium2) or the image itself -> vision model
3. LLM (GPT via emergentintegrations) returns strict JSON for 4 fields; null when not present.
4. Hard verification: when we have a text layer, every returned value MUST occur verbatim in the
   document text (digits-only match for CF/P.IVA), otherwise it is discarded ("Non rilevato").
Nothing is ever estimated: no consumption, prices, amounts or totals are produced here.
"""
import asyncio
import base64
import io
import json
import logging
import os
import re
from typing import Optional

logger = logging.getLogger("bolty.extraction")

FIELDS = ("fornitore", "intestatario", "tipo_intestatario", "codice_fiscale", "partita_iva")
EMPTY = {f: None for f in FIELDS}
MIN_TEXT_CHARS = 200
MAX_TEXT_CHARS = 60_000
MAX_VISION_PAGES = 2

SYSTEM_PROMPT = """Sei un estrattore di dati da bollette italiane (luce, gas, telefonia).
Restituisci SOLO un oggetto JSON con queste chiavi:
- "fornitore": nome del venditore/fornitore ESATTAMENTE come scritto nel documento (es. "Duferco Energia SpA"). Non il distributore (es. E-Distribuzione, Italgas) e non l'intestatario.
- "intestatario": intestatario della fornitura come scritto nel documento: nome e cognome se persona fisica, ragione sociale se azienda.
- "tipo_intestatario": "persona" oppure "azienda" oppure null.
- "codice_fiscale": codice fiscale dell'INTESTATARIO (16 caratteri alfanumerici per persone fisiche, 11 cifre per aziende) come scritto nel documento. NON il codice fiscale del fornitore.
- "partita_iva": partita IVA dell'INTESTATARIO (11 cifre) come scritto nel documento. NON la partita IVA del fornitore (spesso nel piè di pagina insieme a "Capitale Sociale", "Registro Imprese", "REA").
Regole assolute:
1. Copia i valori ESATTAMENTE come appaiono nel documento, senza correggerli, completarli o normalizzarli.
2. Se un dato non è presente o non è leggibile con certezza, usa null. Non stimare, non inventare, non dedurre.
3. Nessun altro campo, nessun commento: solo JSON valido."""


# --------------------------------------------------------------------------- document readers
def pdf_text(data: bytes) -> str:
    import pdfplumber
    parts = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
    text = "\n".join(parts)
    return text[:MAX_TEXT_CHARS]


def pdf_page_images(data: bytes, max_pages: int = MAX_VISION_PAGES, scale: float = 1.6) -> list[bytes]:
    import pypdfium2 as pdfium
    out = []
    pdf = pdfium.PdfDocument(data)
    for i in range(min(len(pdf), max_pages)):
        bitmap = pdf[i].render(scale=scale)
        img = bitmap.to_pil().convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        out.append(buf.getvalue())
    return out


def image_to_jpeg(data: bytes) -> bytes:
    from PIL import Image
    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((2000, 2000))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# --------------------------------------------------------------------------- LLM
def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return {}
    try:
        obj = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    return obj if isinstance(obj, dict) else {}


async def _ask_llm(text: Optional[str], images: list[bytes]) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY mancante")
    chat = LlmChat(api_key=api_key, session_id=f"extract-{os.urandom(6).hex()}", system_message=SYSTEM_PROMPT)
    chat.with_model("openai", os.environ.get("EXTRACTION_MODEL", "gpt-5.4"))
    if text is not None:
        msg = UserMessage(text=f"Testo estratto dalla bolletta:\n<<<\n{text}\n>>>\nRestituisci il JSON.")
    else:
        msg = UserMessage(
            text="Leggi la bolletta nelle immagini e restituisci il JSON.",
            file_contents=[ImageContent(image_base64=base64.b64encode(b).decode("ascii")) for b in images],
        )
    raw = await asyncio.wait_for(chat.send_message(msg), timeout=90)
    return _parse_json(str(raw))


# --------------------------------------------------------------------------- verification
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def _digits(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", s).upper()


def _verify(candidate: dict, text: Optional[str]) -> dict:
    """Keep only well-formed values; with a text layer, only values literally present in the document."""
    out = dict(EMPTY)
    norm_text = _norm(text) if text else None
    alnum_text = _digits(text) if text else None

    def present(value: str, mode: str) -> bool:
        if norm_text is None:
            return True  # vision path: no text layer to check against
        if mode == "code":
            return _digits(value) in alnum_text
        return _norm(value) in norm_text

    for key in ("fornitore", "intestatario"):
        v = candidate.get(key)
        if isinstance(v, str) and 2 <= len(v.strip()) <= 120 and present(v, "text"):
            out[key] = re.sub(r"\s+", " ", v).strip()

    v = candidate.get("codice_fiscale")
    if isinstance(v, str):
        code = _digits(v)
        if (re.fullmatch(r"[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]", code) or re.fullmatch(r"\d{11}", code)) and present(v, "code"):
            out["codice_fiscale"] = code

    v = candidate.get("partita_iva")
    if isinstance(v, str):
        code = _digits(v)
        if re.fullmatch(r"\d{11}", code) and present(v, "code"):
            out["partita_iva"] = code

    t = candidate.get("tipo_intestatario")
    if t in ("persona", "azienda"):
        out["tipo_intestatario"] = t
    elif out["partita_iva"] or (out["codice_fiscale"] and len(out["codice_fiscale"]) == 11):
        out["tipo_intestatario"] = "azienda"
    elif out["codice_fiscale"] and len(out["codice_fiscale"]) == 16:
        out["tipo_intestatario"] = "persona"
    return out


# --------------------------------------------------------------------------- entry point
async def extract_bill_data(content: bytes, content_type: str, filename: str = "") -> dict:
    """Returns {fields..., "_meta": {"method": "pdf-text"|"pdf-vision"|"image-vision"|"none", "verified": bool, "error": str|None}}."""
    meta = {"method": "none", "verified": False, "error": None}
    is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf") or content[:5] == b"%PDF-"
    text: Optional[str] = None
    images: list[bytes] = []
    try:
        if is_pdf:
            text = await asyncio.to_thread(pdf_text, content)
            if len(re.sub(r"\s", "", text)) >= MIN_TEXT_CHARS:
                meta["method"] = "pdf-text"
            else:
                text = None
                images = await asyncio.to_thread(pdf_page_images, content)
                meta["method"] = "pdf-vision"
        else:
            images = [await asyncio.to_thread(image_to_jpeg, content)]
            meta["method"] = "image-vision"

        candidate = await _ask_llm(text, images)
        fields = _verify(candidate, text)
        meta["verified"] = text is not None
    except Exception as e:
        logger.warning(f"Extraction failed ({meta['method']}): {e}")
        meta["error"] = str(e)[:200]
        fields = dict(EMPTY)
    return {**fields, "_meta": meta}
