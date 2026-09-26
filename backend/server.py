import os
import base64
import hashlib
import asyncio
import re
import uuid
import logging
import ipaddress
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated, Any

import jwt
import bcrypt
import httpx
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Form, Query, Request
from fastapi.responses import Response, HTMLResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import market
import legal
import extraction
import news
import admin_panel

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("bolty")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "bolty"
_storage_key = None

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "BOLTY")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
ADMIN_NAME = os.environ.get("ADMIN_NAME", "Admin")
# Inbox that receives operational notifications (new bills, support requests). Defaults to the admin login email.
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "").strip() or ADMIN_EMAIL

REFERRAL_REWARD = float(os.environ.get("REFERRAL_REWARD", "0"))  # no cash reward: referral is invite-only

APPLE_AUDIENCES = [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "").split(",") if a.strip()]
APPLE_ISSUER = "https://appleid.apple.com"
_apple_jwk_client = None
# Optional: needed only to revoke Apple tokens on account deletion (Apple REST API).
APPLE_TEAM_ID = os.environ.get("APPLE_TEAM_ID", "").strip()
APPLE_KEY_ID = os.environ.get("APPLE_KEY_ID", "").strip()
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY", "").replace("\\n", "\n").strip()
APPLE_REVOKE_ENABLED = bool(APPLE_TEAM_ID and APPLE_KEY_ID and APPLE_PRIVATE_KEY and APPLE_AUDIENCES)

SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "").strip() or ADMIN_NOTIFY_EMAIL


def apple_jwk_client():
    global _apple_jwk_client
    if _apple_jwk_client is None:
        _apple_jwk_client = jwt.PyJWKClient("https://appleid.apple.com/auth/keys")
    return _apple_jwk_client

app = FastAPI(title="BOLTY API")
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def apple_client_secret() -> str:
    """Client secret JWT (ES256) for Apple's /auth/token and /auth/revoke endpoints."""
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"iss": APPLE_TEAM_ID, "iat": int(now.timestamp()), "exp": int((now + timedelta(minutes=10)).timestamp()),
         "aud": APPLE_ISSUER, "sub": APPLE_AUDIENCES[0]},
        APPLE_PRIVATE_KEY, algorithm="ES256", headers={"kid": APPLE_KEY_ID},
    )


async def apple_exchange_code(code: str) -> Optional[str]:
    """Exchange the authorizationCode for a refresh token (stored to allow revocation on deletion)."""
    if not APPLE_REVOKE_ENABLED:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{APPLE_ISSUER}/auth/token", data={
                "client_id": APPLE_AUDIENCES[0], "client_secret": apple_client_secret(),
                "code": code, "grant_type": "authorization_code",
            })
        if r.status_code == 200:
            return r.json().get("refresh_token")
        logger.warning(f"Apple code exchange failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        logger.warning(f"Apple code exchange error: {e}")
    return None


async def apple_revoke(refresh_token: str) -> bool:
    if not APPLE_REVOKE_ENABLED or not refresh_token:
        return False
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{APPLE_ISSUER}/auth/revoke", data={
                "client_id": APPLE_AUDIENCES[0], "client_secret": apple_client_secret(),
                "token": refresh_token, "token_type_hint": "refresh_token",
            })
        return r.status_code == 200
    except Exception as e:
        logger.warning(f"Apple revoke error: {e}")
        return False


def delete_object(path: str) -> None:
    """Erase a stored file. The object store has no DELETE API, so we overwrite the
    object with 0 bytes (PUT overwrites silently) — the personal content is gone and the
    DB record pointing to it is removed by the caller."""
    try:
        put_object(path, b"", "application/octet-stream")
    except Exception as e:
        logger.warning(f"Storage erase {path} error: {e}")


def _validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


async def ensure_referral_code(user: dict) -> str:
    if user and user.get("referral_code"):
        return user["referral_code"]
    for _ in range(10):
        code = uuid.uuid4().hex[:6].upper()
        if not await db.users.find_one({"referral_code": code}):
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
            return code
    code = user["user_id"][-6:].upper()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
    return code


# ---------------------------------------------------------------------------
# Auth utilities
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_jwt(user_id: str) -> str:
    payload = {"user_id": user_id, "exp": now_utc() + timedelta(days=7), "iat": now_utc()}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


FILE_LINK_DAYS = int(os.environ.get("FILE_LINK_DAYS", "7"))


def create_file_token(path: str) -> str:
    """Short-lived, single-purpose token that opens ONE stored file (used in the admin email link)."""
    payload = {"scope": "file", "path": path, "exp": now_utc() + timedelta(days=FILE_LINK_DAYS), "iat": now_utc()}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def verify_file_token(token: Optional[str], path: str) -> bool:
    if not token:
        return False
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return False
    return claims.get("scope") == "file" and claims.get("path") == path


def public_base_url(request: Request) -> str:
    """Public https origin of this API as seen by the client (works behind the ingress and after deploy)."""
    configured = (os.environ.get("APP_PUBLIC_URL") or "").strip().rstrip("/")
    if configured:
        return configured
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    host = host.split(",")[0].strip()
    return f"https://{host}"


async def get_user_by_token(authorization: Optional[str]) -> Optional[dict]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None

    # 1) Google session token stored in user_sessions
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, datetime):
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < now_utc():
                return None
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
        return user

    # 2) JWT (email/password)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
        return user
    except Exception:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    user = await get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Non autenticato")
    return user


async def get_admin_user(authorization: Optional[str] = Header(None)) -> dict:
    user = await get_user_by_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Non autenticato")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato all'amministratore")
    return user


# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    global _storage_key
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Email (Emergent Resend) — guardrail gate + sender
# ---------------------------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


def _email_template(title: str, message: str) -> str:
    return (
        f'<table role="presentation" width="100%" style="background:#F9F9F8;padding:24px 0">'
        f'<tr><td align="center">'
        f'<table role="presentation" width="480" style="background:#FFFFFF;border-radius:16px;'
        f'padding:32px;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td style="font-size:22px;color:#2D4A3E;font-weight:600;padding-bottom:8px">BOLTY</td></tr>'
        f'<tr><td style="font-size:18px;color:#1C1C1E;font-weight:600;padding-bottom:12px">{escape(title)}</td></tr>'
        f'<tr><td style="font-size:15px;color:#3A3A3C;line-height:22px">{message}</td></tr>'
        f'<tr><td style="padding-top:24px;font-size:12px;color:#8E8E93">'
        f'Inviato da {escape(EMAIL_FROM_NAME)}. Non chiediamo mai password o dati della carta via email.'
        f'</td></tr>'
        f'</table></td></tr></table>'
    )


async def send_email(*, to: str, subject: str, html: str, attachments: Optional[list] = None) -> Optional[str]:
    """attachments: [{"filename": str, "content": bytes, "content_type": str}] — sent as-is (base64), never transformed."""
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY missing; skipping email")
        return None
    _assert_safe_email(subject, html)
    payload: dict = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    if attachments:
        payload["attachments"] = [
            {"filename": a["filename"], "content": base64.b64encode(a["content"]).decode("ascii"), "content_type": a.get("content_type") or "application/octet-stream"}
            for a in attachments
        ]
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            resp = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None


async def notify_admin_panel(kind: str, title: str, message: str, bill_id: Optional[str] = None, user_id: Optional[str] = None, extra: Optional[dict] = None):
    """In-app notification for the admin panel (separate from customer notifications)."""
    await db.admin_notifications.insert_one({
        "notification_id": make_id("antf"), "kind": kind, "title": title, "message": message,
        "bill_id": bill_id, "user_id": user_id, "extra": extra or {}, "read": False, "created_at": now_utc().isoformat(),
    })


async def notify(user_id: str, title: str, message_html: str, subject: str):
    """Create an in-app notification and send an email (best effort)."""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return
    notif = {
        "notif_id": make_id("ntf"),
        "user_id": user_id,
        "title": title,
        "body": re.sub("<[^<]+?>", "", message_html),
        "read": False,
        "created_at": now_utc().isoformat(),
    }
    await db.notifications.insert_one(notif)
    if user.get("email"):
        await send_email(to=user["email"], subject=subject, html=_email_template(title, message_html))


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    referral_code: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class AppleInput(BaseModel):
    identity_token: str
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    authorization_code: Optional[str] = None


CATEGORIES = {"luce", "gas", "telefonia"}


class ExtractedData(BaseModel):
    """Only data that can be read on the document. No amounts, no estimates."""
    fornitore: Optional[str] = Field(default=None, max_length=120)
    intestatario: Optional[str] = Field(default=None, max_length=120)
    tipo_intestatario: Optional[str] = Field(default=None, pattern="^(persona|azienda)$")
    codice_fiscale: Optional[str] = Field(default=None, max_length=16)
    partita_iva: Optional[str] = Field(default=None, max_length=11)


class ContactRequestInput(BaseModel):
    email: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    consent: bool


class ConfirmBillInput(BaseModel):
    extracted: ExtractedData


class OfferInput(BaseModel):
    provider_name: str
    current_monthly: float
    proposed_monthly: float
    notes: Optional[str] = None


class CustomerData(BaseModel):
    nome: str
    cognome: str
    codice_fiscale: str
    telefono: str
    email: EmailStr
    indirizzo: str
    pod: Optional[str] = None
    pdr: Optional[str] = None


class ContractInput(BaseModel):
    offer_id: str
    customer_data: CustomerData
    accepted_terms: bool
    signature: Optional[str] = None


class SupportInput(BaseModel):
    subject: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=10, max_length=4000)


class ContractStatusInput(BaseModel):
    status: str


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------
def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    referred_by = None
    if inp.referral_code:
        ref = await db.users.find_one({"referral_code": inp.referral_code.strip().upper()})
        if ref:
            referred_by = ref["user_id"]
    user = {
        "user_id": make_id("usr"),
        "name": inp.name,
        "email": inp.email.lower(),
        "password_hash": hash_password(inp.password),
        "role": "customer",
        "auth_provider": "email",
        "referral_code": uuid.uuid4().hex[:6].upper(),
        "referred_by": referred_by,
        "reward_balance": 0.0,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user)
    token = create_jwt(user["user_id"])
    return {"token": token, "user": clean({**user})}


@api_router.post("/auth/login")
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = create_jwt(user["user_id"])
    return {"token": token, "user": clean({**user})}


@api_router.post("/auth/session")
async def google_session(inp: SessionInput):
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": inp.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessione non valida")
    data = resp.json()
    email = (data.get("email") or "").lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
    else:
        user_id = make_id("usr")
        await db.users.insert_one({
            "user_id": user_id,
            "name": data.get("name") or email.split("@")[0],
            "email": email,
            "picture": data.get("picture"),
            "role": "customer",
            "auth_provider": "google",
            "created_at": now_utc().isoformat(),
        })
    session_token = data.get("session_token")
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"session_token": session_token, "token": session_token, "user": user}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": user}


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api_router.post("/auth/apple")
async def apple_auth(inp: AppleInput):
    if not APPLE_AUDIENCES:
        raise HTTPException(status_code=500, detail="Apple Sign-In non configurato")
    try:
        signing_key = await run_in_threadpool(
            lambda: apple_jwk_client().get_signing_key_from_jwt(inp.identity_token)
        )
        claims = jwt.decode(
            inp.identity_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=APPLE_AUDIENCES,
            issuer=APPLE_ISSUER,
        )
    except Exception as e:
        logger.error(f"Apple token verify failed: {e}")
        raise HTTPException(status_code=401, detail="Token Apple non valido")

    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Token Apple non valido")

    email = (inp.email or claims.get("email") or "").lower() or None

    existing = await db.users.find_one({"apple_sub": apple_sub})
    if not existing and email:
        existing = await db.users.find_one({"email": email})

    if existing:
        user_id = existing["user_id"]
        set_fields = {"apple_sub": apple_sub}
        # Persist name/email only on first sign-in; never overwrite with nulls
        if not existing.get("email") and email:
            set_fields["email"] = email
        if (not existing.get("name") or existing.get("name") == "Utente Apple") and inp.name:
            set_fields["name"] = inp.name
        await db.users.update_one({"user_id": user_id}, {"$set": set_fields})
    else:
        user_id = make_id("usr")
        doc = {
            "user_id": user_id,
            "name": inp.name or (email.split("@")[0] if email else "Utente Apple"),
            "apple_sub": apple_sub,
            "role": "customer",
            "auth_provider": "apple",
            "referral_code": uuid.uuid4().hex[:6].upper(),
            "referred_by": None,
            "reward_balance": 0.0,
            "created_at": now_utc().isoformat(),
        }
        if email:
            doc["email"] = email
        await db.users.insert_one(doc)

    if inp.authorization_code and APPLE_REVOKE_ENABLED:
        rt = await apple_exchange_code(inp.authorization_code)
        if rt:
            await db.users.update_one({"user_id": user_id}, {"$set": {"apple_refresh_token": rt}})

    session_token = f"apple_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"token": session_token, "session_token": session_token, "user": user}


# ---------------------------------------------------------------------------
# Bills
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload_bill(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form(...),
    user: dict = Depends(get_current_user),
):
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria non valida")
    content = await file.read()
    ext = (file.filename or "file").split(".")[-1].lower()
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    sha256 = hashlib.sha256(content).hexdigest()
    try:
        await run_in_threadpool(put_object, path, content, content_type)
        # Integrity check: the stored copy must be byte-identical to what the customer uploaded
        stored, _ = await run_in_threadpool(get_object, path)
        if hashlib.sha256(stored).hexdigest() != sha256:
            raise RuntimeError("stored file differs from uploaded file")
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=502, detail="Caricamento file non riuscito")

    # Real extraction from the uploaded document only (supplier, holder, CF, P.IVA). Never estimated.
    result = await extraction.extract_bill_data(content, content_type, file.filename or "")
    extraction_meta = result.pop("_meta")
    extracted = result
    analysis = None
    bill = {
        "bill_id": make_id("bill"),
        "user_id": user["user_id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "category": category,
        "storage_path": path,
        "file_name": file.filename,
        "file_type": content_type,
        "file_size": len(content),
        "file_sha256": sha256,
        "status": "nuova",
        "extracted": extracted,
        "extraction_meta": extraction_meta,
        "analysis": analysis,
        "contact_request": None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "deleted_at": None,
    }
    await db.bills.insert_one(bill)
    await notify(
        user["user_id"], "Bolletta ricevuta",
        f"Abbiamo ricevuto la tua bolletta <strong>{escape(category)}</strong>. La analizziamo subito e ti avvisiamo appena è pronta la proposta. "
        "Per la tua privacy il file non viene allegato alle email: lo trovi sempre nella sezione Bollette dell'app.",
        "Bolletta ricevuta — BOLTY",
    )
    await notify_admin_new_bill(request, bill, content)
    await notify_admin_panel(
        "bolletta", "Nuova bolletta da analizzare",
        f"{user.get('name') or 'Cliente'} · {extracted.get('fornitore') or 'Fornitore non rilevato'} · {category}",
        bill_id=bill["bill_id"], user_id=user["user_id"],
        extra={"customer": user.get("name"), "fornitore": extracted.get("fornitore"), "category": category, "file_name": file.filename},
    )
    return clean(bill)


MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  # email providers cap attachments around 25-40 MB


def attachment_filename(bill: dict) -> str:
    """Original file name (basename, safe chars); falls back to Bolletta_<Fornitore>.<ext>."""
    original = os.path.basename((bill.get("file_name") or "").replace("\\", "/")).strip()
    original = re.sub(r"[^\w.\- ()àèéìòù]", "_", original, flags=re.UNICODE)
    if original and "." in original:
        return original
    ext = (bill.get("storage_path") or "").rsplit(".", 1)[-1] or "pdf"
    fornitore = re.sub(r"[^\w]", "", (bill.get("extracted") or {}).get("fornitore") or bill.get("category") or "Bolletta")
    return f"Bolletta_{fornitore}.{ext}"


async def notify_admin_new_bill(request: Request, bill: dict, content: bytes) -> None:
    """Email the administration about a new bill with the ORIGINAL uploaded file attached (byte-for-byte),
    plus a secure expiring link as a backup."""
    try:
        link = f"{public_base_url(request)}/api/files/{bill['storage_path']}?token={create_file_token(bill['storage_path'])}"
        who = escape(bill.get("user_name") or "Cliente")
        mail = escape(bill.get("user_email") or "email non disponibile")
        filename = attachment_filename(bill)
        size_kb = max(1, len(content) // 1024)
        attach = len(content) <= MAX_ATTACHMENT_BYTES
        attach_line = (
            f"<p>In allegato trovi il <strong>file originale</strong> caricato dal cliente: <strong>{escape(filename)}</strong> ({size_kb} KB).</p>"
            if attach else
            f"<p>Il file ({size_kb} KB) supera il limite per gli allegati email: aprilo dal link qui sotto.</p>"
        )
        html = _email_template(
            "Nuova bolletta da analizzare",
            f"<p><strong>{who}</strong> ({mail}) ha caricato una bolletta <strong>{escape(bill['category'])}</strong>.</p>"
            f"{attach_line}"
            f"<p>ID bolletta: {escape(bill['bill_id'])} · SHA-256: <code style=\"font-size:11px\">{escape(bill.get('file_sha256') or '')[:16]}…</code></p>"
            f"<p><a href=\"{link}\" style=\"display:inline-block;background:#16213E;color:#ffffff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600\">Apri la bolletta online</a></p>"
            f"<p style=\"font-size:12px;color:#6B7185\">Il link è personale e scade tra {FILE_LINK_DAYS} giorni. La bolletta è sempre disponibile anche nell'app Bolty (coda amministratore).</p>",
        )
        attachments = [{"filename": filename, "content": content, "content_type": bill.get("file_type") or "application/octet-stream"}] if attach else None
        email_id = await send_email(
            to=ADMIN_NOTIFY_EMAIL,
            subject=f"Nuova bolletta {bill['category']} da {bill.get('user_name') or 'cliente'} — BOLTY",
            html=html,
            attachments=attachments,
        )
        logger.info(f"Admin bill email {'sent ' + email_id if email_id else 'FAILED'} for {bill['bill_id']} (attachment={'yes' if attach else 'no'}, {size_kb} KB)")
    except Exception as e:
        logger.warning(f"Admin bill notification failed: {e}")


@api_router.get("/bills")
async def list_bills(user: dict = Depends(get_current_user), category: Optional[str] = None):
    q = {"user_id": user["user_id"], "deleted_at": None}
    if category:
        q["category"] = category
    bills = await db.bills.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return bills


@api_router.get("/bills/{bill_id}")
async def get_bill(bill_id: str, user: dict = Depends(get_current_user)):
    bill = await db.bills.find_one({"bill_id": bill_id, "deleted_at": None}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Bolletta non trovata")
    if bill["user_id"] != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Non autorizzato")
    offer = await db.offers.find_one({"bill_id": bill_id}, {"_id": 0})
    bill["offer"] = offer
    return bill


@api_router.put("/bills/{bill_id}/confirm")
async def confirm_bill(bill_id: str, inp: ConfirmBillInput, user: dict = Depends(get_current_user)):
    bill = await db.bills.find_one({"bill_id": bill_id, "deleted_at": None})
    if not bill or bill["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Bolletta non trovata")
    extracted = {k: (v.strip() if isinstance(v, str) and v.strip() else None) for k, v in inp.extracted.model_dump().items()}
    await db.bills.update_one(
        {"bill_id": bill_id},
        {"$set": {"extracted": extracted, "extraction_meta.confirmed_by_user": True, "updated_at": now_utc().isoformat()}},
    )
    await notify(
        user["user_id"], "Dati confermati",
        "Grazie! Abbiamo registrato i dati della tua bolletta. Un consulente la analizzerà e ti proporremo presto l'offerta migliore.",
        "Dati confermati — BOLTY",
    )
    updated = await db.bills.find_one({"bill_id": bill_id}, {"_id": 0})
    return updated


EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[0-9]{6,15}$")


@api_router.post("/bills/{bill_id}/contact")
async def bill_contact_request(bill_id: str, inp: ContactRequestInput, request: Request, user: dict = Depends(get_current_user)):
    """Customer voluntarily leaves contacts so a consultant can call back about this bill's offer."""
    bill = await db.bills.find_one({"bill_id": bill_id, "deleted_at": None})
    if not bill or bill["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Bolletta non trovata")
    if not inp.consent:
        raise HTTPException(status_code=422, detail="È necessario il consenso al trattamento dei dati per essere ricontattato")
    email = (inp.email or "").strip().lower() or None
    phone = re.sub(r"[\s().-]", "", inp.phone or "") or None
    if not email and not phone:
        raise HTTPException(status_code=422, detail="Inserisci almeno un recapito (email o telefono)")
    if email and not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Indirizzo email non valido")
    if phone and not PHONE_RE.match(phone):
        raise HTTPException(status_code=422, detail="Numero di telefono non valido")
    contact = {"email": email, "phone": phone, "consent_at": now_utc().isoformat(), "status": "nuovo"}
    await db.bills.update_one({"bill_id": bill_id}, {"$set": {"contact_request": contact, "updated_at": now_utc().isoformat()}})

    ex = bill.get("extracted") or {}
    rows = "".join(
        f"<tr><td style=\"padding:4px 8px;color:#6B7185\">{escape(k)}</td><td style=\"padding:4px 8px\"><strong>{escape(str(v))}</strong></td></tr>"
        for k, v in [
            ("Cliente", user.get("name") or "—"), ("Email account", user.get("email") or "—"),
            ("Email indicata", email or "—"), ("Telefono indicato", phone or "—"),
            ("Categoria", bill["category"]), ("Fornitore", ex.get("fornitore") or "Non rilevato"),
            ("Intestatario", ex.get("intestatario") or "Non rilevato"), ("Codice fiscale", ex.get("codice_fiscale") or "Non rilevato"),
            ("Partita IVA", ex.get("partita_iva") or "Non rilevato"), ("File", bill.get("file_name") or "—"), ("ID bolletta", bill["bill_id"]),
        ]
    )
    link = f"{public_base_url(request)}/api/files/{bill['storage_path']}?token={create_file_token(bill['storage_path'])}"
    email_id = await send_email(
        to=ADMIN_NOTIFY_EMAIL,
        subject=f"Richiesta di contatto da {user.get('name') or 'cliente'} — BOLTY",
        html=_email_template(
            "Un cliente vuole essere ricontattato",
            f"<p>Il cliente ha lasciato volontariamente i propri recapiti per ricevere informazioni sull'offerta relativa alla sua bolletta.</p>"
            f"<table style=\"border-collapse:collapse;font-size:14px\">{rows}</table>"
            f"<p style=\"margin-top:12px\"><a href=\"{link}\" style=\"display:inline-block;background:#16213E;color:#ffffff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600\">Apri la bolletta</a></p>"
            f"<p style=\"font-size:12px;color:#6B7185\">Consenso al trattamento dei dati prestato il {contact['consent_at'][:10]}.</p>",
        ),
    )
    logger.info(f"Contact request email {'sent ' + email_id if email_id else 'FAILED'} for {bill_id}")
    await notify_admin_panel(
        "contatto", "Nuova richiesta di contatto",
        f"{user.get('name') or 'Cliente'} · {email or ''} {phone or ''}".strip(),
        bill_id=bill_id, user_id=user["user_id"],
        extra={"customer": user.get("name"), "email": email, "phone": phone, "fornitore": ex.get("fornitore")},
    )
    await db.notifications.insert_one({
        "notification_id": make_id("ntf"), "user_id": user["user_id"], "title": "Richiesta di contatto inviata",
        "message": "Un nostro consulente ti contatterà per spiegarti la soluzione più adatta alle tue esigenze.",
        "read": False, "created_at": now_utc().isoformat(),
    })
    updated = await db.bills.find_one({"bill_id": bill_id}, {"_id": 0})
    return updated


@api_router.delete("/bills/{bill_id}")
async def delete_bill(bill_id: str, user: dict = Depends(get_current_user)):
    bill = await db.bills.find_one({"bill_id": bill_id})
    if not bill or bill["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Bolletta non trovata")
    await db.bills.update_one({"bill_id": bill_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# File download
# ---------------------------------------------------------------------------
@api_router.get("/files/{path:path}")
async def get_file(path: str, authorization: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    if not token and not authorization:
        raise HTTPException(status_code=401, detail="Non autenticato")
    bill = await db.bills.find_one({"storage_path": path}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="File non trovato")
    if not verify_file_token(token, path):
        auth_header = authorization or (f"Bearer {token}" if token else None)
        user = await get_user_by_token(auth_header)
        if not user:
            raise HTTPException(status_code=401, detail="Non autenticato")
        if bill["user_id"] != user["user_id"] and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Non autorizzato")
        if user.get("role") == "admin":
            await db.admin_audit.insert_one({"audit_id": make_id("aud"), "admin_id": user["user_id"], "admin_email": user.get("email"), "action": "open_file", "target": bill["bill_id"], "details": {"path": path}, "created_at": now_utc().isoformat()})
    try:
        content, content_type = await run_in_threadpool(get_object, path)
    except Exception as e:
        logger.error(f"Download failed: {e}")
        raise HTTPException(status_code=404, detail="File non trovato")
    return Response(content=content, media_type=content_type)


# ---------------------------------------------------------------------------
# Offers
# ---------------------------------------------------------------------------
@api_router.get("/offers")
async def list_offers(user: dict = Depends(get_current_user)):
    offers = await db.offers.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for o in offers:
        o["bill"] = await db.bills.find_one({"bill_id": o["bill_id"]}, {"_id": 0})
        o["contract"] = await db.contracts.find_one({"offer_id": o["offer_id"]}, {"_id": 0})
    return offers


@api_router.get("/offers/{offer_id}")
async def get_offer(offer_id: str, user: dict = Depends(get_current_user)):
    offer = await db.offers.find_one({"offer_id": offer_id}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offerta non trovata")
    if offer["user_id"] != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Non autorizzato")
    offer["bill"] = await db.bills.find_one({"bill_id": offer["bill_id"]}, {"_id": 0})
    offer["contract"] = await db.contracts.find_one({"offer_id": offer_id}, {"_id": 0})
    return offer


# ---------------------------------------------------------------------------
# Contracts (customer accepts offer)
# ---------------------------------------------------------------------------
@api_router.post("/contracts")
async def create_contract(inp: ContractInput, user: dict = Depends(get_current_user)):
    if not inp.accepted_terms:
        raise HTTPException(status_code=400, detail="Devi accettare le condizioni")
    offer = await db.offers.find_one({"offer_id": inp.offer_id})
    if not offer or offer["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Offerta non trovata")
    existing = await db.contracts.find_one({"offer_id": inp.offer_id})
    if existing:
        raise HTTPException(status_code=400, detail="Offerta già accettata")
    contract = {
        "contract_id": make_id("ctr"),
        "offer_id": inp.offer_id,
        "bill_id": offer["bill_id"],
        "user_id": user["user_id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "category": offer.get("category"),
        "customer_data": inp.customer_data.model_dump(),
        "accepted_terms": True,
        "signature": inp.signature,
        "status": "in_lavorazione",
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.contracts.insert_one(contract)
    await db.offers.update_one({"offer_id": inp.offer_id}, {"$set": {"status": "accettata"}})

    # Referral reward: reward the referrer the first time this friend activates an offer
    buyer = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    referrer_id = buyer.get("referred_by") if buyer else None
    if referrer_id and referrer_id != user["user_id"]:
        already = await db.rewards.find_one({"referrer_id": referrer_id, "referred_user_id": user["user_id"]})
        if not already:
            await db.rewards.insert_one({
                "reward_id": make_id("rwd"),
                "referrer_id": referrer_id,
                "referred_user_id": user["user_id"],
                "referred_name": user.get("name"),
                "amount": REFERRAL_REWARD,
                "status": "accreditato",
                "created_at": now_utc().isoformat(),
            })
            await db.users.update_one({"user_id": referrer_id}, {"$inc": {"reward_balance": REFERRAL_REWARD}})
            await notify(
                referrer_id, "Il tuo amico ha attivato un'offerta!",
                f"<strong>{escape(user.get('name') or 'Un tuo amico')}</strong> ha accettato il tuo invito e ha attivato un'offerta con Bolty: ora risparmia anche lui sulle sue fatture. Grazie per averlo invitato! 🎉",
                "Il tuo amico ha attivato un'offerta — BOLTY",
            )

    await notify(
        user["user_id"], "Richiesta ricevuta",
        f"Abbiamo ricevuto la tua richiesta per l'offerta <strong>{escape(offer.get('provider_name',''))}</strong>. La tua pratica è ora <strong>in lavorazione</strong>.",
        "Richiesta ricevuta — BOLTY",
    )
    return clean(contract)


@api_router.get("/contracts")
async def list_contracts(user: dict = Depends(get_current_user)):
    contracts = await db.contracts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return contracts


@api_router.get("/notifications")
async def list_notifications(user: dict = Depends(get_current_user)):
    notifs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifs


@api_router.put("/notifications/read")
async def mark_notifications_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.get("/referral")
async def get_referral(user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"user_id": user["user_id"]})
    code = await ensure_referral_code(full)
    rewards = await db.rewards.find({"referrer_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    invited = await db.users.count_documents({"referred_by": user["user_id"]})
    total = sum(float(r.get("amount", 0)) for r in rewards)
    return {
        "code": code,
        "invited_count": invited,
        "activated_count": len(rewards),
        "rewards_total": round(total, 2),
        "reward_per_friend": REFERRAL_REWARD,
        "rewards": rewards,
    }


# ---------------------------------------------------------------------------
# ADMIN
# ---------------------------------------------------------------------------
@api_router.get("/admin/dashboard")
async def admin_dashboard(admin: dict = Depends(get_admin_user)):
    seven_days_ago = (now_utc() - timedelta(days=7)).isoformat()
    nuove = await db.bills.count_documents({"status": "nuova", "deleted_at": None, "created_at": {"$gte": seven_days_ago}})
    da_analizzare = await db.bills.count_documents({"status": "nuova", "deleted_at": None})
    offerte_proposte = await db.offers.count_documents({})
    contratti = await db.contracts.count_documents({})
    contratti_conclusi = await db.contracts.count_documents({"status": "concluso"})
    bollette_analizzate = await db.bills.count_documents({"deleted_at": None})

    valore = 0.0
    async for o in db.offers.find({"status": "accettata"}, {"_id": 0, "annual_savings": 1}):
        valore += float(o.get("annual_savings") or 0)

    return {
        "stats": {
            "nuove_bollette": nuove,
            "da_analizzare": da_analizzare,
            "offerte_proposte": offerte_proposte,
            "contratti": contratti,
            "contratti_conclusi": contratti_conclusi,
            "bollette_analizzate": bollette_analizzate,
            "valore_generato": round(valore, 2),
        }
    }


@api_router.get("/admin/bills")
async def admin_bills(admin: dict = Depends(get_admin_user), status: Optional[str] = None):
    q = {"deleted_at": None}
    if status == "da_analizzare":
        q["status"] = "nuova"
    elif status == "offerta_proposta":
        q["status"] = "offerta_proposta"
    bills = await db.bills.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    for b in bills:
        b["offer"] = await db.offers.find_one({"bill_id": b["bill_id"]}, {"_id": 0})
    return bills


@api_router.post("/admin/bills/{bill_id}/offer")
async def admin_create_offer(bill_id: str, inp: OfferInput, admin: dict = Depends(get_admin_user)):
    bill = await db.bills.find_one({"bill_id": bill_id, "deleted_at": None})
    if not bill:
        raise HTTPException(status_code=404, detail="Bolletta non trovata")
    annual_savings = round((inp.current_monthly - inp.proposed_monthly) * 12, 2)
    existing = await db.offers.find_one({"bill_id": bill_id})
    offer_doc = {
        "provider_name": inp.provider_name,
        "current_monthly": inp.current_monthly,
        "proposed_monthly": inp.proposed_monthly,
        "annual_savings": annual_savings,
        "notes": inp.notes,
        "category": bill["category"],
        "user_id": bill["user_id"],
        "bill_id": bill_id,
        "status": "proposta",
        "updated_at": now_utc().isoformat(),
    }
    if existing:
        await db.offers.update_one({"offer_id": existing["offer_id"]}, {"$set": offer_doc})
        offer_id = existing["offer_id"]
    else:
        offer_doc["offer_id"] = make_id("off")
        offer_doc["created_at"] = now_utc().isoformat()
        await db.offers.insert_one(offer_doc)
        offer_id = offer_doc["offer_id"]
    await db.bills.update_one({"bill_id": bill_id}, {"$set": {"status": "offerta_proposta", "updated_at": now_utc().isoformat()}})
    await notify(
        bill["user_id"], "Nuova offerta disponibile",
        f"Abbiamo una proposta per la tua bolletta <strong>{escape(bill['category'])}</strong>: <strong>{inp.proposed_monthly} €/mese</strong> con un risparmio stimato di <strong>{annual_savings} €/anno</strong>. Aprila nell'app per accettarla.",
        "Nuova offerta disponibile — BOLTY",
    )
    result = await db.offers.find_one({"offer_id": offer_id}, {"_id": 0})
    return result


@api_router.get("/admin/contracts")
async def admin_contracts(admin: dict = Depends(get_admin_user)):
    contracts = await db.contracts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for c in contracts:
        c["offer"] = await db.offers.find_one({"offer_id": c["offer_id"]}, {"_id": 0})
    return contracts


@api_router.put("/admin/contracts/{contract_id}/status")
async def admin_update_contract(contract_id: str, inp: ContractStatusInput, admin: dict = Depends(get_admin_user)):
    valid = {"in_lavorazione", "concluso", "annullato"}
    if inp.status not in valid:
        raise HTTPException(status_code=400, detail="Stato non valido")
    contract = await db.contracts.find_one({"contract_id": contract_id})
    if not contract:
        raise HTTPException(status_code=404, detail="Contratto non trovato")
    await db.contracts.update_one({"contract_id": contract_id}, {"$set": {"status": inp.status, "updated_at": now_utc().isoformat()}})
    if inp.status == "concluso":
        await notify(
            contract["user_id"], "Contratto completato",
            "Ottima notizia! Il tuo contratto è stato <strong>completato</strong>. Inizierai presto a risparmiare con la nuova offerta.",
            "Contratto completato — BOLTY",
        )
    else:
        await notify(
            contract["user_id"], "Aggiornamento pratica",
            f"Lo stato della tua pratica è stato aggiornato a: <strong>{escape(inp.status.replace('_',' '))}</strong>.",
            "Aggiornamento pratica — BOLTY",
        )
    updated = await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0})
    return updated


# ---------------------------------------------------------------------------
# ACCOUNT DELETION (Apple 5.1.1(v)) — permanently removes the user and personal data
# ---------------------------------------------------------------------------
@api_router.delete("/auth/me")
async def delete_account(user: dict = Depends(get_current_user)):
    if user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="L'account amministratore non può essere eliminato dall'app")
    uid = user["user_id"]
    full = await db.users.find_one({"user_id": uid}) or {}

    # Files on object storage (best effort, in a thread so we don't block the loop)
    paths = [b["storage_path"] async for b in db.bills.find({"user_id": uid, "storage_path": {"$ne": None}}, {"storage_path": 1}) if b.get("storage_path")]
    for pth in paths:
        await run_in_threadpool(delete_object, pth)

    # Apple: revoke the Sign in with Apple grant when credentials are configured
    apple_revoked = False
    if full.get("apple_refresh_token"):
        apple_revoked = await apple_revoke(full["apple_refresh_token"])

    # Detach referral links pointing to this user, then wipe collections
    await db.users.update_many({"referred_by": uid}, {"$set": {"referred_by": None}})
    counts = {}
    for coll in ("bills", "offers", "contracts", "notifications"):
        res = await getattr(db, coll).delete_many({"user_id": uid})
        counts[coll] = res.deleted_count
    res = await db.rewards.delete_many({"$or": [{"referrer_id": uid}, {"referred_id": uid}]})
    counts["rewards"] = res.deleted_count
    res = await db.support_requests.delete_many({"user_id": uid})
    counts["support_requests"] = res.deleted_count
    res = await db.user_sessions.delete_many({"user_id": uid})
    counts["sessions"] = res.deleted_count
    await db.users.delete_one({"user_id": uid})
    logger.info(f"Account {uid} deleted: {counts}, files={len(paths)}, apple_revoked={apple_revoked}")
    return {"ok": True, "deleted": counts, "files_deleted": len(paths), "apple_revoked": apple_revoked}


# ---------------------------------------------------------------------------
# SUPPORT
# ---------------------------------------------------------------------------
@api_router.get("/legal/info")
async def legal_info():
    return {"support_email": SUPPORT_EMAIL, "privacy_path": "/api/legal/privacy", "terms_path": "/api/legal/terms", "support_path": "/api/legal/support"}


@api_router.post("/support")
async def create_support_request(inp: SupportInput, user: dict = Depends(get_current_user)):
    doc = {
        "request_id": make_id("sup"),
        "user_id": user["user_id"],
        "user_email": user.get("email"),
        "user_name": user.get("name"),
        "subject": inp.subject.strip(),
        "message": inp.message.strip(),
        "status": "aperta",
        "created_at": now_utc().isoformat(),
    }
    await db.support_requests.insert_one(doc)
    who = escape(user.get("name") or "Utente")
    mail = escape(user.get("email") or "email non disponibile")
    await send_email(
        to=SUPPORT_EMAIL,
        subject=f"[Assistenza Bolty] {doc['subject']}",
        html=_email_template(
            "Nuova richiesta di assistenza",
            f"<p><strong>{who}</strong> ({mail}) ha scritto:</p><p>{escape(doc['message']).replace(chr(10), '<br>')}</p><p>ID richiesta: {doc['request_id']}</p>",
        ),
    )
    if user.get("email"):
        await send_email(
            to=user["email"],
            subject="Abbiamo ricevuto la tua richiesta — BOLTY",
            html=_email_template("Richiesta ricevuta", f"<p>Ciao {who}, abbiamo ricevuto la tua richiesta <strong>{escape(doc['subject'])}</strong>. Ti risponderemo entro 2 giorni lavorativi.</p>"),
        )
    return {"ok": True, "request_id": doc["request_id"]}


# ---------------------------------------------------------------------------
# LEGAL PAGES (public, HTTPS)
# ---------------------------------------------------------------------------
@api_router.get("/legal/privacy", response_class=HTMLResponse)
async def legal_privacy():
    return legal.privacy_html()


@api_router.get("/legal/terms", response_class=HTMLResponse)
async def legal_terms():
    return legal.terms_html()


@api_router.get("/legal/support", response_class=HTMLResponse)
async def legal_support():
    return legal.support_html()


# ---------------------------------------------------------------------------
# NEWS (real articles from RSS feeds, refreshed every 3 days — see news.py)
# ---------------------------------------------------------------------------
@api_router.get("/news")
async def get_news(limit: int = Query(30, ge=1, le=100), before: Optional[str] = None, user: dict = Depends(get_current_user)):
    return await news.list_news(db, limit=limit, before=before)


@api_router.post("/admin/news/refresh")
async def admin_news_refresh(admin: dict = Depends(get_admin_user)):
    return await news.refresh_news(db, force=True)


# ---------------------------------------------------------------------------
# MARKET OVERVIEW (live public sources, cached in Mongo — see market.py)
# ---------------------------------------------------------------------------
@api_router.get("/market/overview")
async def get_market_overview(user: dict = Depends(get_current_user)):
    return await market.market_overview(db)


@api_router.post("/admin/market/refresh")
async def admin_market_refresh(admin: dict = Depends(get_admin_user)):
    await market.refresh_market(db, force=True)
    return await market.market_overview(db)


@api_router.get("/")
async def root():
    return {"message": "BOLTY API"}


api_router.include_router(admin_panel.build_router(db, get_admin_user, now_utc, make_id))
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        # email may be absent for Apple private-relay users -> sparse unique
        try:
            await db.users.drop_index("email_1")
        except Exception:
            pass
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("apple_sub", unique=True, sparse=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.bills.create_index("user_id")
        await db.offers.create_index("bill_id")
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    # Market prices: refresh from public sources in background (daily check, monthly data)
    asyncio.create_task(market.refresh_loop(db))
    asyncio.create_task(news.refresh_loop(db))

    try:
        admin = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
        if not admin:
            await db.users.insert_one({
                "user_id": make_id("usr"),
                "name": ADMIN_NAME,
                "email": ADMIN_EMAIL.lower(),
                "password_hash": hash_password(ADMIN_PASSWORD),
                "role": "admin",
                "auth_provider": "email",
                "created_at": now_utc().isoformat(),
            })
            logger.info("Admin account seeded")
        else:
            await db.users.update_one({"email": ADMIN_EMAIL.lower()}, {"$set": {"role": "admin"}})
    except Exception as e:
        logger.warning(f"Admin seed: {e}")

    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
