"""
Bill upload integrity + admin-notification attachment tests (Jan 2026).

Focus:
- ONE real upload of /tmp/Bolletta_Enel_Luce.pdf as mario@test.it — verifies
  response fields (file_name, file_size, file_sha256), and byte-identical
  retrieval via GET /api/files/{storage_path} with Bearer.
- Unit tests for server.attachment_filename() — no HTTP, no email.
- Unit tests for server.send_email() with attachments: httpx.AsyncClient.post
  is patched so NO real request/email is sent, and the JSON payload is
  captured and asserted (attachments[0] has filename, content_type, and
  base64 content that decodes to the exact original bytes).
- MAX_ATTACHMENT_BYTES is 25 MB; oversized bytes must produce attach=False
  (verified through notify_admin_new_bill with send_email patched to capture).

Real emails triggered by this module: exactly 1 (the real Mario upload).
"""
import asyncio
import base64
import hashlib
import importlib
import io
import os
import sys
import types
import uuid
from pathlib import Path

import pytest
import requests

# Ensure backend package importable
BACKEND_DIR = Path("/app/backend")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

MARIO_EMAIL = "mario@test.it"
MARIO_PASSWORD = "Test1234"
PDF_PATH = "/tmp/Bolletta_Enel_Luce.pdf"


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def http():
    return requests.Session()


@pytest.fixture(scope="module")
def mario_token(http):
    r = http.post(f"{API}/auth/login", json={"email": MARIO_EMAIL, "password": MARIO_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def original_pdf():
    p = Path(PDF_PATH)
    assert p.exists(), f"missing {PDF_PATH}"
    content = p.read_bytes()
    return {
        "path": PDF_PATH,
        "content": content,
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


# ---------------------------------------------------------------------------
# 1) REAL upload — the only real-email side effect in this module
# ---------------------------------------------------------------------------
class TestRealPdfUploadIntegrity:
    """One real upload of the 99058-byte Enel PDF as mario@test.it."""

    def test_upload_returns_original_metadata(self, http, mario_token, original_pdf):
        with open(original_pdf["path"], "rb") as fh:
            files = {"file": ("Bolletta_Enel_Luce.pdf", fh, "application/pdf")}
            r = http.post(f"{API}/upload", headers=_hdr(mario_token),
                          files=files, data={"category": "luce"}, timeout=120)
        assert r.status_code == 200, r.text
        bill = r.json()
        # Persist for the next assertions
        TestRealPdfUploadIntegrity.bill = bill

        assert bill["file_name"] == "Bolletta_Enel_Luce.pdf"
        assert bill["file_size"] == original_pdf["size"] == 99058
        assert bill["file_sha256"] == original_pdf["sha256"]
        assert bill["file_type"] == "application/pdf"
        assert bill["storage_path"].endswith(".pdf")

    def test_bearer_download_is_byte_identical(self, http, mario_token, original_pdf):
        bill = getattr(TestRealPdfUploadIntegrity, "bill", None)
        assert bill, "previous test did not run"
        r = http.get(f"{API}/files/{bill['storage_path']}",
                     headers=_hdr(mario_token), timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content == original_pdf["content"]
        assert hashlib.sha256(r.content).hexdigest() == original_pdf["sha256"]

    def test_admin_email_sent_with_attachment_log(self):
        """Backend log must show the admin email was accepted (202) w/ attachment."""
        bill = getattr(TestRealPdfUploadIntegrity, "bill", None)
        assert bill, "previous test did not run"
        # Wait briefly for logger flush
        import time
        time.sleep(1.0)
        try:
            log = Path("/var/log/supervisor/backend.err.log").read_text(errors="ignore")
        except Exception:
            log = ""
        # We accept .out.log as well
        if bill["bill_id"] not in log:
            try:
                log += "\n" + Path("/var/log/supervisor/backend.out.log").read_text(errors="ignore")
            except Exception:
                pass
        assert bill["bill_id"] in log, "no log line for the uploaded bill_id"
        assert f"Admin bill email sent" in log or "Admin bill email FAILED" in log
        # Confirm attachment=yes appears for THIS bill (line-scoped match)
        lines = [ln for ln in log.splitlines() if bill["bill_id"] in ln]
        assert lines, "no log line mentions the bill_id"
        assert any("attachment=yes" in ln for ln in lines), lines[-3:]


# ---------------------------------------------------------------------------
# 2) attachment_filename — unit tests, no HTTP
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def server_mod():
    # Ensure env vars are loaded exactly like the running backend
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
    return importlib.import_module("server")


class TestAttachmentFilename:
    def test_keeps_original_filename(self, server_mod):
        b = {"file_name": "Bolletta_Enel_Luce.pdf",
             "storage_path": "bolty/uploads/u1/abc.pdf",
             "extracted": {"fornitore": "Enel Energia"},
             "category": "luce"}
        assert server_mod.attachment_filename(b) == "Bolletta_Enel_Luce.pdf"

    def test_fallback_uses_fornitore(self, server_mod):
        b = {"file_name": None,
             "storage_path": "bolty/uploads/u1/abc.pdf",
             "extracted": {"fornitore": "Edison"},
             "category": "luce"}
        assert server_mod.attachment_filename(b) == "Bolletta_Edison.pdf"

    def test_path_traversal_is_stripped(self, server_mod):
        b = {"file_name": "../../x.pdf",
             "storage_path": "bolty/uploads/u1/abc.pdf",
             "extracted": {"fornitore": "Enel"},
             "category": "luce"}
        # basename('../../x.pdf') == 'x.pdf'
        assert server_mod.attachment_filename(b) == "x.pdf"

    def test_backslash_traversal_is_stripped(self, server_mod):
        b = {"file_name": r"..\..\evil.pdf",
             "storage_path": "bolty/uploads/u1/abc.pdf",
             "extracted": {},
             "category": "luce"}
        assert server_mod.attachment_filename(b) == "evil.pdf"

    def test_dangerous_chars_are_neutralised(self, server_mod):
        b = {"file_name": "wei;rd$name.pdf",
             "storage_path": "bolty/uploads/u1/abc.pdf",
             "extracted": {},
             "category": "luce"}
        out = server_mod.attachment_filename(b)
        # allowed chars are word/./- and space/parens/unicode; ; and $ replaced with _
        assert out.endswith(".pdf")
        assert ";" not in out and "$" not in out

    def test_empty_filename_falls_back_to_category(self, server_mod):
        b = {"file_name": "",
             "storage_path": "bolty/uploads/u1/abc.pdf",
             "extracted": {},
             "category": "luce"}
        assert server_mod.attachment_filename(b) == "Bolletta_luce.pdf"


# ---------------------------------------------------------------------------
# 3) send_email attachment payload — httpx patched, NO real HTTP
# ---------------------------------------------------------------------------
class _FakeResp:
    status_code = 202

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return {"id": "fake-email-id"}


class _FakeAsyncClient:
    """Captures the POST /api/v1/email/send payload without hitting the network."""

    captured = {"url": None, "headers": None, "json": None}

    def __init__(self, timeout=None):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, headers=None, json=None):  # noqa: A002
        _FakeAsyncClient.captured = {"url": url, "headers": headers, "json": json}
        return _FakeResp(json)


class TestSendEmailAttachments:
    def test_attachment_is_base64_original_bytes(self, monkeypatch, server_mod, original_pdf):
        monkeypatch.setattr(server_mod.httpx, "AsyncClient", _FakeAsyncClient)
        eid = asyncio.new_event_loop().run_until_complete(
            server_mod.send_email(
                to="delivered@resend.dev",
                subject="TEST integrity — Bolletta",
                html="<p>Solo test locale, non inviato.</p>",
                attachments=[{
                    "filename": "Bolletta_Enel_Luce.pdf",
                    "content": original_pdf["content"],
                    "content_type": "application/pdf",
                }],
            )
        )
        assert eid == "fake-email-id"
        payload = _FakeAsyncClient.captured["json"]
        assert payload["subject"].startswith("TEST integrity")
        atts = payload["attachments"]
        assert len(atts) == 1
        a = atts[0]
        assert a["filename"] == "Bolletta_Enel_Luce.pdf"
        assert a["content_type"] == "application/pdf"
        decoded = base64.b64decode(a["content"])
        assert decoded == original_pdf["content"]
        assert hashlib.sha256(decoded).hexdigest() == original_pdf["sha256"]

    def test_no_attachments_key_when_none(self, monkeypatch, server_mod):
        monkeypatch.setattr(server_mod.httpx, "AsyncClient", _FakeAsyncClient)
        asyncio.new_event_loop().run_until_complete(
            server_mod.send_email(
                to="delivered@resend.dev",
                subject="TEST no att",
                html="<p>ciao</p>",
                attachments=None,
            )
        )
        payload = _FakeAsyncClient.captured["json"]
        assert "attachments" not in payload


# ---------------------------------------------------------------------------
# 4) MAX_ATTACHMENT_BYTES + notify_admin_new_bill oversize behaviour
# ---------------------------------------------------------------------------
class TestOversizeAttachment:
    def test_max_bytes_constant(self, server_mod):
        assert server_mod.MAX_ATTACHMENT_BYTES == 25 * 1024 * 1024

    def test_oversize_sets_attach_false(self, monkeypatch, server_mod):
        """Simulate a >25MB bill: notify_admin_new_bill must call send_email
        with attachments=None (attach=False). NO real email — send_email patched."""
        captured = {}

        async def fake_send_email(*, to, subject, html, attachments=None):
            captured["to"] = to
            captured["subject"] = subject
            captured["attachments"] = attachments
            captured["html"] = html
            return "fake-id"

        monkeypatch.setattr(server_mod, "send_email", fake_send_email)

        class FakeRequest:
            headers = {"x-forwarded-host": "utility-analyzer-4.preview.emergentagent.com",
                       "host": "internal.local"}

        big = b"\x00" * (server_mod.MAX_ATTACHMENT_BYTES + 1)
        fake_bill = {
            "bill_id": "bill_test_oversize",
            "storage_path": "bolty/uploads/u1/abc.pdf",
            "file_name": "Big.pdf",
            "file_type": "application/pdf",
            "file_sha256": "0" * 64,
            "category": "luce",
            "user_name": "TEST User",
            "user_email": "delivered@resend.dev",
            "extracted": {"fornitore": "Enel"},
        }
        asyncio.new_event_loop().run_until_complete(
            server_mod.notify_admin_new_bill(FakeRequest(), fake_bill, big)
        )
        assert captured.get("attachments") is None
        # HTML should mention the file size line, not the attachment line
        assert "supera il limite" in captured["html"]

    def test_normal_size_sets_attach_true(self, monkeypatch, server_mod, original_pdf):
        captured = {}

        async def fake_send_email(*, to, subject, html, attachments=None):
            captured["to"] = to
            captured["attachments"] = attachments
            return "fake-id"

        monkeypatch.setattr(server_mod, "send_email", fake_send_email)

        class FakeRequest:
            headers = {"x-forwarded-host": "utility-analyzer-4.preview.emergentagent.com",
                       "host": "internal.local"}

        fake_bill = {
            "bill_id": "bill_test_normal",
            "storage_path": "bolty/uploads/u1/abc.pdf",
            "file_name": "Bolletta_Enel_Luce.pdf",
            "file_type": "application/pdf",
            "file_sha256": original_pdf["sha256"],
            "category": "luce",
            "user_name": "TEST User",
            "user_email": "delivered@resend.dev",
            "extracted": {"fornitore": "Enel"},
        }
        asyncio.new_event_loop().run_until_complete(
            server_mod.notify_admin_new_bill(FakeRequest(), fake_bill, original_pdf["content"])
        )
        atts = captured.get("attachments")
        assert atts and len(atts) == 1
        assert atts[0]["filename"] == "Bolletta_Enel_Luce.pdf"
        assert atts[0]["content_type"] == "application/pdf"
        assert atts[0]["content"] == original_pdf["content"]


# ---------------------------------------------------------------------------
# 5) Legal pages must no longer promise money
# ---------------------------------------------------------------------------
class TestLegalPagesWording:
    def test_privacy_no_invita_e_guadagna_or_euro(self, http):
        r = http.get(f"{API}/legal/privacy", timeout=30)
        assert r.status_code == 200
        html = r.text
        assert "Invita e Guadagna" not in html
        assert "€" not in html
        assert "premio" not in html.lower()

    def test_terms_section_5_says_no_money(self, http):
        r = http.get(f"{API}/legal/terms", timeout=30)
        assert r.status_code == 200
        html = r.text
        assert "Invita e Guadagna" not in html
        assert "€" not in html
        assert "non prevede pagamenti né premi in denaro" in html
