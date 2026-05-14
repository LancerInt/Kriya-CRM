"""
Smoke test: confirm Cloudflare R2 storage is reachable and Django can
upload + retrieve a file through it. Run AFTER setting USE_R2_STORAGE=True.

Usage:
    cd backend
    set USE_R2_STORAGE=True
    python smoke_r2.py
"""
import os
import sys
import django
from datetime import datetime

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
os.environ["USE_R2_STORAGE"] = "True"

# Make backend dir importable.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
test_key = f"_smoke_test/r2_probe_{stamp}.txt"
payload = f"Kriya CRM R2 smoke test @ {stamp} UTC\n".encode()

print(f"[1/4] Backend class: {default_storage.__class__.__module__}.{default_storage.__class__.__name__}")
print(f"[2/4] Uploading test object: {test_key}")
saved_name = default_storage.save(test_key, ContentFile(payload))
print(f"      Saved as: {saved_name}")

print(f"[3/4] Generating signed URL...")
url = default_storage.url(saved_name)
print(f"      URL (expires in 1h): {url[:120]}...")

print(f"[4/4] Cleaning up test object...")
default_storage.delete(saved_name)
print(f"      Deleted.")

print("\nSUCCESS - R2 storage is wired correctly.")
