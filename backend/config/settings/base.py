import os
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'dev-secret-key-change-in-production')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'django_extensions',
    # Local apps
    'common',
    'accounts',
    'clients',
    'communications',
    'tasks',
    'products',
    'quotations',
    'orders',
    'shipments',
    'quality',
    'samples',
    'finance',
    'documents',
    'analytics',
    'meetings',
    'workflows',
    'notifications',
    'agents',
    'teamchat',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

AUTH_USER_MODEL = 'accounts.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── File storage backends ───────────────────────────────────────────────
# Flip USE_R2_STORAGE=True in the env to route uploaded media (COA PDFs,
# product docs, chat attachments, etc.) to Cloudflare R2. Static files use
# the plain Django backend here; production.py swaps in WhiteNoise.
USE_R2_STORAGE = os.getenv('USE_R2_STORAGE', 'False').lower() in ('true', '1', 'yes')

STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}

if USE_R2_STORAGE:
    STORAGES['default'] = {
        'BACKEND': 'storages.backends.s3.S3Storage',
        'OPTIONS': {
            'access_key': os.getenv('R2_ACCESS_KEY_ID'),
            'secret_key': os.getenv('R2_SECRET_ACCESS_KEY'),
            'bucket_name': os.getenv('R2_BUCKET_NAME'),
            'endpoint_url': os.getenv('R2_ENDPOINT_URL'),
            'region_name': os.getenv('R2_REGION', 'auto'),
            'signature_version': 's3v4',
            'addressing_style': 'virtual',
            # R2 rejects ACL headers; signed URLs gate access for private CRM files.
            'default_acl': None,
            'querystring_auth': True,
            'querystring_expire': 3600,
            'file_overwrite': False,
        },
    }

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'common.pagination.StandardPagination',
    'PAGE_SIZE': 20,
    'DATETIME_FORMAT': '%Y-%m-%dT%H:%M:%S%z',
}

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# Celery
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Kolkata'

# Cache
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/1'),
    }
}

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}

# Email signature logo — must be a publicly reachable HTTPS/HTTP URL so Gmail
# can proxy it through its image cache. Embedding via cid:/data: causes Gmail
# to show an attachment chip in the inbox preview, so we use a hosted URL.
# Default is the raw GitHub URL of frontend/public/logo.png so it works out
# of the box. Override via SIGNATURE_LOGO_URL env var if you move the file.
SIGNATURE_LOGO_URL = os.getenv(
    'SIGNATURE_LOGO_URL',
    'https://raw.githubusercontent.com/LancerInt/Kriya-CRM/main/frontend/public/logo.png',
)

# Lead time the AI quotes when acknowledging a sample request. Override via
# the SAMPLE_DISPATCH_DAYS env var if your operational lead time changes.
SAMPLE_DISPATCH_DAYS = os.getenv('SAMPLE_DISPATCH_DAYS', '10-15 days')
