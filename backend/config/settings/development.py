from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

# Safety net: if DATABASE_URL is set in the environment (e.g., we're running
# on Render/AWS/etc. with DJANGO_SETTINGS_MODULE accidentally pointing here),
# prefer it over the localhost defaults. Otherwise fall back to the discrete
# DB_* vars for genuine local development on a laptop.
_DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
if _DATABASE_URL and not _DATABASE_URL.startswith('postgres://user:pass@host'):
    try:
        import dj_database_url
        DATABASES = {
            'default': dj_database_url.parse(
                _DATABASE_URL,
                conn_max_age=600,
                ssl_require=True,
            ),
        }
    except ImportError:
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': os.getenv('DB_NAME', 'kriya_crm_db'),
                'USER': os.getenv('DB_USER', 'postgres'),
                'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
                'HOST': os.getenv('DB_HOST', 'localhost'),
                'PORT': os.getenv('DB_PORT', '5432'),
            }
        }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'kriya_crm_db'),
            'USER': os.getenv('DB_USER', 'postgres'),
            'PASSWORD': os.getenv('DB_PASSWORD', 'postgres'),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
        }
    }

# CORS
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Email (console backend for dev)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
