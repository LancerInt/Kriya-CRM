# Deploying Kriya CRM to Render — Production Plan

Production deployment on Render's **Pro workspace** (~$102/mo total). All services on paid compute tiers, no sleep, no 90-day database expiry, full Celery scheduler running every task on time.

The repo's [render.yaml](render.yaml) Blueprint provisions everything in one click.

---

## 1. Pricing model — how Render charges

Render's pricing has two layers:

1. **Workspace subscription** — flat monthly fee that unlocks features:
   - Hobby = $0/mo (free tier, limited)
   - **Pro = $25/mo** (production-grade, what we want)
   - Scale = $499/mo (advanced governance)
   - Enterprise = custom
2. **+ compute** for every service you run (web, worker, DB, redis, disk) based on its instance size.

You need **Pro workspace** for production. Sign up once in the Render dashboard; the Blueprint provisions services on top.

---

## 2. What gets deployed and what it costs

| Item                                         | Plan                                     | Monthly |
| -------------------------------------------- | ---------------------------------------- | ------- |
| **Pro workspace** (base subscription)        | —                                        | **$25** |
| `kriya-crm-db`                               | PostgreSQL **Standard** (10 GB, backups + PITR) | $20 |
| `kriya-crm-redis`                            | Key-Value **Starter** (250 MB)           | $10     |
| `kriya-crm-api`                              | Web **Standard** (2 GB RAM, 1 CPU)       | $25     |
| `kriya-crm-worker`                           | Background Worker **Starter**            | $7      |
| `kriya-crm-beat`                             | Background Worker **Starter**            | $7      |
| `kriya-crm` (frontend)                       | Web **Starter**                          | $7      |
| `kriya-crm-media` (persistent disk, 5 GB)    | —                                        | $1.25   |
| **Total**                                    |                                          | **≈ $102/mo** |

### Lean variant (~$70/mo)
Drop daily backups + PITR, lower API RAM, smaller disk:
- DB plan: `standard` → `starter` (save $13)
- API plan: `standard` → `starter`, `WEB_CONCURRENCY` → 2 (save $18)
- Disk: 5 GB → 1 GB (save $1)
- **Total: ≈ $70/mo**

### Headroom variant (~$140/mo)
For heavier traffic / PDF workloads:
- API plan: `standard` → `pro` (4 GB / 2 CPU, +$60)
- Worker concurrency: 4 → 8, OR add a second worker service (+$7)

Authentication is **JWT** (`djangorestframework-simplejwt`) — frontend stores tokens in `localStorage` and refreshes on 401 via [frontend/lib/axios.js](frontend/lib/axios.js). Django admin still uses session + CSRF. Role gating (`admin` / `manager` / `executive`) is enforced in each ViewSet's `get_queryset`.

---

## 3. Prerequisites

- A Render account on **Pro workspace** ($25/mo) — upgrade in dashboard → Workspace Settings → Plan
- A payment method on file (Render bills monthly, prorated)
- The repo pushed to GitHub / GitLab / Bitbucket
- SMTP credentials for outgoing email (Gmail App Password works fine)
- Optional but useful: a custom domain you can point at Render

---

## 4. One-click Blueprint deploy

1. Push the latest commit (with [render.yaml](render.yaml)).
2. Render dashboard → **New +** → **Blueprint** → connect repo → confirm.
3. Render provisions everything. `DATABASE_URL`, `REDIS_URL`, and a fresh `DJANGO_SECRET_KEY` are wired between services automatically.
4. Open **`kriya-crm-api`** → **Environment** tab. Fill in everything marked `sync: false`:
   - `ALLOWED_HOSTS` = `kriya-crm-api.onrender.com` (or your custom domain; comma-separated)
   - `CORS_ALLOWED_ORIGINS` = `https://kriya-crm.onrender.com` (frontend URL, full origin)
   - `CSRF_TRUSTED_ORIGINS` = same as `CORS_ALLOWED_ORIGINS`
   - SMTP: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS=True`, `DEFAULT_FROM_EMAIL`
   - AI keys: `GROQ_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY` (whichever you use)
5. The worker + beat services automatically pull most of these via `fromService` references. Their `sync: false` slots are duplicated for clarity — fill them on the worker too (or use Render's "Copy from another service" link).
6. Open **`kriya-crm`** (frontend) → **Environment** → set `NEXT_PUBLIC_API_URL` = `https://kriya-crm-api.onrender.com/api`.
7. Click **Save, Rebuild & Deploy** on each. Watch the API logs until `/healthz/` returns 200. The worker log should show `celery@<host> ready.`, beat should show `beat: Starting...`.

---

## 5. First admin user

Paid plans include a Shell tab. On `kriya-crm-api`, click **Shell** and run:

```bash
python manage.py createsuperuser
```

Enter email, name, password. Visit `https://<api-host>/admin/` to confirm.

---

## 6. Day-to-day: deploying updates

Push to `main` → Render auto-deploys all linked services. The backend's build command runs `migrate` automatically. Celery worker + beat reload on every deploy.

For a manual deploy: any service → **Manual Deploy** → **Clear build cache & deploy**.

To roll back: service → **Events** tab → find the previous successful deploy → **Rollback to this deploy**. (Paid plans only.)

---

## 7. Scheduled tasks — all 17 run via Celery beat

The full schedule from [backend/config/celery.py](backend/config/celery.py) runs as designed. No cron jobs needed, no compromise.

| Task                                            | Frequency       |
| ----------------------------------------------- | --------------- |
| `communications.sync_emails`                    | every 5 min     |
| `workflows.scan_emails_for_alerts`              | every 15 min    |
| `workflows.auto_pipeline_from_emails`           | every 15 min    |
| `workflows.check_meeting_reminders`             | every 30 min    |
| `orders.check_cro_reminders`                    | every 30 min    |
| `orders.check_transit_doc_reminders`            | every 30 min    |
| `samples.check_sample_reply_reminders`          | every minute    |
| `samples.check_sample_feedback_reminders`       | every minute    |
| `orders.check_delivery_reminders`               | every minute    |
| `tasks.check_task_due_reminders`                | daily 08:30 IST |
| `workflows.check_overdue_tasks`                 | daily 09:00 IST |
| `orders.check_balance_payment_reminders`        | daily 09:00 IST |
| `orders.check_overdue_payment_reminders`        | daily 09:15 IST |
| `workflows.check_overdue_invoices`              | daily 09:30 IST |
| `workflows.check_stale_tasks`                   | 09:45 + 17:00 IST |
| `workflows.purge_recycle_bin`                   | daily 02:00 IST |
| `workflows.auto_archive_non_client_emails`      | daily 03:00 IST |

Inbound emails are picked up within 5 minutes, sample/delivery reminders fire within 1 minute, and the per-order reminder cool-downs work exactly as written.

---

## 8. Persistent media disk

5 GB is mounted at `backend/media/`. Uploaded PIF/CI PDFs, attachments, generated documents persist across deploys and restarts.

When you outgrow 5 GB:

| Need                   | Recommended fix                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| 5 → 20 GB              | Resize the Render Disk in the dashboard. `$0.25/GB-mo`. Same disk, no migration.        |
| > 50 GB or want a CDN  | Move to S3-compatible storage. Uncomment the `STORAGES['default']` block at the bottom of [backend/config/settings/production.py](backend/config/settings/production.py), `pip install django-storages[boto3]`, set `AWS_*` env vars. Then drop the disk from `render.yaml` and redeploy. Existing files: copy from the disk to the bucket before removing the disk. |

Cloudflare R2 is the cheapest at scale (no egress fees, $0.015/GB-mo).

---

## 9. Database backups (Standard plan includes them)

`kriya-crm-db` on Postgres Standard auto-backs up daily + supports point-in-time recovery for 7 days. Restore from dashboard → DB service → **Recovery** tab.

To take an ad-hoc dump:
```bash
# From your laptop, using the External Database URL from Render
pg_dump "$RENDER_EXTERNAL_DB_URL" > kriya-crm-$(date +%F).sql
```

---

## 10. Authentication & authorization

Already in place — listed here so reviewers can trace the flow.

| Layer | Where | What it does |
| ----- | ----- | ------------ |
| JWT login | `accounts/views.py` + `simplejwt` | `POST /api/auth/login/` → `{access, refresh}` (12 h / 7 d rotating) |
| Auth header | `frontend/lib/axios.js` | `Authorization: Bearer <access>` on every request |
| Auto-refresh on 401 | `frontend/lib/axios.js` | Calls `/api/auth/token/refresh/`, retries the original request |
| Per-view permissions | DRF `IsAuthenticated` + overrides | Role-gated endpoints |
| Account scoping | `clients.views.get_client_qs_for_user` | Executives see only assigned/shadowed clients |
| Admin | `/admin/` | Django session + CSRF |
| CORS | `corsheaders` + `CORS_ALLOWED_ORIGINS` | Credentials enabled |
| CSRF cross-origin | `CSRF_TRUSTED_ORIGINS` | Required for admin login from the deployed frontend |
| HTTPS enforcement | `production.py` (`SECURE_PROXY_SSL_HEADER`, `SECURE_SSL_REDIRECT`) | Trusts Render's `X-Forwarded-Proto: https` |
| Secure cookies | `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` | Only sent over HTTPS |
| HSTS | `SECURE_HSTS_SECONDS` | Set to `31536000` after a week of healthy production (see §10) |

---

## 11. Post-launch hardening (1 week after going live)

Once you've confirmed nothing is breaking:

1. **Turn on HSTS** — Render dashboard → `kriya-crm-api` → Environment → `SECURE_HSTS_SECONDS=31536000`. Save → deploy. This forces browsers to use HTTPS for a year. Don't do it on day 1 in case you need to roll back to HTTP for debugging.
2. **Custom domains** — `kriya-crm-api` → **Settings** → **Custom Domains** → add `api.kriya.com`. Add the suggested DNS records at your registrar. Repeat for the frontend (`crm.kriya.com`). Update `ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` / `NEXT_PUBLIC_API_URL` env vars to use the custom domains. Redeploy.
3. **Sentry or similar error tracking** — Add `sentry-sdk[django]` to `requirements.txt`, `SENTRY_DSN` to env vars, init it in `production.py`. Catches 500s, slow queries, and Celery task failures before users report them.
4. **Uptime monitoring** — UptimeRobot (free) → ping `/healthz/` every 5 min, alert email/Slack on failure.
5. **Log aggregation** — Render's "Log Stream" feature can forward all service logs to Logtail, Datadog, Better Stack, etc. Useful when you have 6 services and don't want to switch dashboards.

---

## 12. Scaling up

| Bottleneck                                            | Fix                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Page loads slow under concurrent users                | API: Standard → **Pro** ($85, 4 GB / 2 CPU); bump `WEB_CONCURRENCY` to 8 |
| Async tasks backing up (Celery queue depth grows)     | Worker plan: Starter → Standard ($25); raise `--concurrency=8`, or add a second worker service |
| DB connections > 80 / 100 ceiling                     | DB: Standard → **Pro** ($95, 4 GB / 200 conn). Confirm `conn_max_age=600` is set (it is, in production.py) |
| Redis evictions in logs                               | Redis: Starter → **Standard** ($30, 1 GB) |
| Frontend slow under traffic                           | Frontend: Starter → Standard ($25, 2 GB) — Next.js bundle gets bigger as features grow |
| Disk full warnings                                    | Resize disk in dashboard; or move to S3 (see §7) |

Render lets you change plans on a service without redeploy — pick the new plan in the dashboard and it restarts the instance live.

---

## 13. Cost-down path (if you want to trim)

To drop to ~$70/mo (Pro workspace + lean compute):
- API plan: Standard → **Starter** ($25 → $7) — only do this if you have ≤ 10 concurrent users
- DB plan: Standard → **Starter** ($20 → $7) — gives up daily backups + PITR
- Disk size: 5 GB → 1 GB ($1.25 → $0.25)
- Net saving: ~$32/mo, total ≈ $70

To go truly minimum (~$55/mo) — drop the worker:
- Remove `kriya-crm-worker` + `kriya-crm-beat` services
- Replace with the 9 Render Cron Jobs from the free-tier version (use `python manage.py run_task <path>`)
- High-frequency tasks (per-minute, 5-min, 15-min) won't run. See §6 of the free-tier guide for the trade-off.

---

## 14. Local production-build smoke test

```bash
# Backend
cd backend
export DJANGO_ENV=production
export DJANGO_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')"
export ALLOWED_HOSTS=localhost,127.0.0.1
export CORS_ALLOWED_ORIGINS=http://localhost:3000
export CSRF_TRUSTED_ORIGINS=http://localhost:3000
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/kriya_crm_db
export REDIS_URL=redis://localhost:6379
export SECURE_SSL_REDIRECT=False
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
gunicorn config.wsgi:application --bind 127.0.0.1:8000

# Frontend (separate terminal)
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.production.local
npm ci
npm run build
npm run start

# Celery worker (separate terminal) — only if you want to test scheduled tasks
celery -A config worker --loglevel=info
celery -A config beat --loglevel=info
```

---

## 15. Troubleshooting

| Symptom                                  | Fix                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `DisallowedHost at /`                    | Add the hostname to `ALLOWED_HOSTS`.                                              |
| Frontend 401s after login                | `NEXT_PUBLIC_API_URL` must match the backend URL exactly (scheme + host + `/api`). |
| `CSRF verification failed` on admin      | Add the admin's origin to `CSRF_TRUSTED_ORIGINS`.                                 |
| Browser blocks API call (CORS)           | `CORS_ALLOWED_ORIGINS` needs the **full origin** (scheme + host, no path).         |
| Worker shows "no broker"                 | Confirm `REDIS_URL` is set on `kriya-crm-worker`. It should auto-wire from the Redis service. |
| Uploaded PDFs disappear                  | The disk isn't mounted. Check the disk's status in the API service dashboard.     |
| Static files 404                         | Build must include `collectstatic`. WhiteNoise serves them after that.            |
| `migration failed` on first deploy       | Build log shows the underlying error one line above the Django message.            |
| HSTS lock-in after misconfig             | If you set `SECURE_HSTS_SECONDS` and need to rollback to HTTP, browsers will refuse for the cached HSTS duration. Always start at 0, ramp up to 60 → 3600 → 31536000 over a week. |

---

## 16. Files added/changed for production

- [render.yaml](render.yaml) — Blueprint at the repo root (Option B configuration)
- [backend/.env.example](backend/.env.example) — annotated env template
- [backend/requirements.txt](backend/requirements.txt) — added `gunicorn`, `whitenoise`, `dj-database-url`
- [backend/config/settings/__init__.py](backend/config/settings/__init__.py) — picks `production.py` when `DJANGO_ENV=production`
- [backend/config/settings/production.py](backend/config/settings/production.py) — full prod settings (env-driven, WhiteNoise, security headers, optional S3 hook)
- [backend/config/urls.py](backend/config/urls.py) — `/healthz/` for Render health checks
- [backend/common/management/commands/run_task.py](backend/common/management/commands/run_task.py) — generic task invoker (only used if you ever drop the worker for cron jobs)
- [frontend/.env.example](frontend/.env.example) — annotated env template
- [frontend/next.config.mjs](frontend/next.config.mjs) — allow remote images from the API host
- [frontend/package.json](frontend/package.json) — `start` honours Render's `PORT`
- DEPLOY.md — this file

No application code changed — same routes, same auth, same data model.
