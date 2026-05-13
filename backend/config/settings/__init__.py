# Pick development or production settings based on DJANGO_ENV.
# - DJANGO_ENV=production → load production settings (Render, etc.)
# - anything else / unset  → load development settings (local laptop)
import os

_env = os.getenv('DJANGO_ENV', 'development').lower()
if _env in ('production', 'prod'):
    from .production import *  # noqa: F401,F403
else:
    from .development import *  # noqa: F401,F403
