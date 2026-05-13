"""
Production settings — loaded when DJANGO_ENV=production.

Render-friendly: every secret/host is read from an environment variable,
DATABASE_URL is auto-parsed (Render provides it for PostgreSQL), static
files are served via WhiteNoise, and security headers + HTTPS redirect
are enabled because Render terminates TLS at its edge proxy.
"""
import os
from .base import *  # noqa: F401,F403
from urllib.parse import urlparse

# ── Core ───────────────────────────────────────────────────────────────
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() in ('true', '1', 'yes')

# Comma-separated host list. Render auto-injects RENDER_EXTERNAL_HOSTNAME
# for web services; we add it so you don't have to set ALLOWED_HOSTS by
# hand on a fresh deploy.
ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '').split(',') if h.strip()]
_render_host = os.getenv('RENDER_EXTERNAL_HOSTNAME')
if _render_host and _render_host not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_render_host)

# ── Database ────────────────────────────────────────────────────────────
# Prefer DATABASE_URL (Render PostgreSQL) — fall back to discrete DB_* vars
# so you can run production settings locally too.
DATABASE_URL = os.getenv('DATABASE_URL', '')
if DATABASE_URL:
    try:
        import dj_database_url
        DATABASES = {
            'default': dj_database_url.parse(
                DATABASE_URL,
                conn_max_age=600,
                ssl_require=True,
            ),
        }
    except ImportError:  # graceful fallback if dj-database-url isn't installed yet
        _u = urlparse(DATABASE_URL)
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': _u.path.lstrip('/'),
                'USER': _u.username or '',
                'PASSWORD': _u.password or '',
                'HOST': _u.hostname or '',
                'PORT': str(_u.port or 5432),
                'OPTIONS': {'sslmode': 'require'},
            }
        }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', ''),
            'USER': os.getenv('DB_USER', ''),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', ''),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }

# ── CORS / CSRF ─────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()
]
CORS_ALLOW_CREDENTIALS = True

# Django needs the frontend origin in CSRF_TRUSTED_ORIGINS even when we use
# JWT, because admin login + DRF browsable API still go through CSRF.
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()
]

# ── Static & media via WhiteNoise ───────────────────────────────────────
# Insert WhiteNoise right after SecurityMiddleware so it serves the
# collected static files in production without needing nginx.
_MW = list(MIDDLEWARE)  # noqa: F405
if 'whitenoise.middleware.WhiteNoiseMiddleware' not in _MW:
    try:
        _idx = _MW.index('django.middleware.security.SecurityMiddleware') + 1
    except ValueError:
        _idx = 1
    _MW.insert(_idx, 'whitenoise.middleware.WhiteNoiseMiddleware')
MIDDLEWARE = _MW

# Django 5.0+: STORAGES replaces STATICFILES_STORAGE / DEFAULT_FILE_STORAGE.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

# ── HTTPS / security headers (Render terminates TLS at its edge) ────────
# Render forwards `X-Forwarded-Proto: https` — trust it so Django knows
# the request is secure and Set-Cookie marks the cookie Secure.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True').lower() in ('true', '1', 'yes')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HSTS — turn on once you've confirmed the deployment is healthy.
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '0'))  # set 31536000 once stable
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
X_FRAME_OPTIONS = 'DENY'

# ── Email (SMTP) ────────────────────────────────────────────────────────
# Falls back to console backend so a misconfigured deploy doesn't 500 on
# password-reset etc. Set EMAIL_HOST etc. in Render env to enable real mail.
if os.getenv('EMAIL_HOST'):
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = os.getenv('EMAIL_HOST')
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
    EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
    EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 'yes')
    EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False').lower() in ('true', '1', 'yes')
    DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# ── Cache / Celery ──────────────────────────────────────────────────────
# Render provides REDIS_URL via its Key-Value (Redis) service. If you skip
# Redis entirely on the first deploy, the cache falls back to LocMem so the
# app still boots — just slower and not shared across web workers.
_REDIS_URL = os.getenv('REDIS_URL', '').strip()
if _REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _REDIS_URL,
        }
    }
    CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', _REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', _REDIS_URL)
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'kriya-locmem',
        }
    }

# ── Logging (stdout — Render captures it) ───────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'verbose'},
    },
    'root': {'handlers': ['console'], 'level': os.getenv('LOG_LEVEL', 'INFO')},
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'django.security': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    },
}

# ── S3 storage hook (uncomment + install boto3 + django-storages) ───────
# Render's filesystem is ephemeral — uploads (PDFs, attachments) are wiped
# on every deploy unless you mount a Disk (paid) or move them to object
# storage. For real production, point DEFAULT_FILE_STORAGE at S3/Spaces:
# STORAGES['default'] = {'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage'}
# AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
# AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
# AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME')
# AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', 'ap-south-1')
# AWS_QUERYSTRING_AUTH = False
