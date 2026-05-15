# Pick development or production settings.
#
# Selection rules (in order):
#   1. DJANGO_ENV=production  → production
#   2. DATABASE_URL is set to a real remote DB → production
#      (covers Render/AWS/etc. where a stale DJANGO_SETTINGS_MODULE or a
#      lingering .env file could otherwise pin development as the default)
#   3. Anything else → development (local laptop)
import os

_env = os.getenv('DJANGO_ENV', '').lower()
_db_url = os.getenv('DATABASE_URL', '').strip()
_has_remote_db = bool(_db_url) and not _db_url.startswith('postgres://user:pass@host')

if _env in ('production', 'prod') or _has_remote_db:
    from .production import *  # noqa: F401,F403
else:
    from .development import *  # noqa: F401,F403
