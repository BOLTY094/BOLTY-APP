"""Seed a temp user, upload a bill, admin creates an offer. Prints creds + offer id."""
import os, io, requests, time, secrets, json
from PIL import Image

BASE = "https://utility-analyzer-4.preview.emergentagent.com"
ADMIN_EMAIL = "admin@bolty.it"
ADMIN_PASS = "Bolty!Admin2026"

s = requests.Session()

# 1. Register a new temp user
suffix = secrets.token_hex(3)
email = f"TEST_contract_{suffix}@test.it"
password = "Test1234"
name = "Contract Tester"
r = s.post(f"{BASE}/api/auth/register", json={"email": email, "password": password, "name": name})
print("register", r.status_code, r.text[:120])
assert r.status_code == 200
tok = r.json()["token"]

# 2. Upload a small PNG
img = Image.new("RGB", (300, 300), (200, 200, 200))
buf = io.BytesIO()
img.save(buf, format="PNG")
buf.seek(0)
files = {"file": ("bill.png", buf, "image/png")}
data = {"category": "luce"}
r = s.post(f"{BASE}/api/upload", files=files, data=data, headers={"Authorization": f"Bearer {tok}"})
print("upload", r.status_code, r.text[:200])
assert r.status_code == 200
bill_id = r.json()["bill_id"]
print("bill_id", bill_id)

# 3. Admin login
r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
print("admin login", r.status_code)
assert r.status_code == 200
admin_tok = r.json()["token"]

# 4. Admin creates offer for the bill
payload = {"provider_name": "Test Energia", "current_monthly": 80, "proposed_monthly": 65, "notes": "test"}
r = s.post(f"{BASE}/api/admin/bills/{bill_id}/offer", json=payload, headers={"Authorization": f"Bearer {admin_tok}"})
print("admin create offer", r.status_code, r.text[:300])
assert r.status_code == 200
offer_id = r.json().get("offer_id") or r.json().get("id")
print("offer_id", offer_id)

out = {"email": email, "password": password, "token": tok, "bill_id": bill_id, "offer_id": offer_id}
with open("/tmp/contract_test.json", "w") as f:
    json.dump(out, f)
print("SAVED", out)
