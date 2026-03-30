# Deploy Zoom Momentum (public URL for Zoom Marketplace)

One **HTTPS URL** should serve:

1. The **React app** (Zoom App Home URL)
2. **`/api/*`** (OAuth, AI, transcript, RTMS webhooks) on the **same origin**

This repo’s Express server serves `client/dist` in production so `fetch('/api/...')` works without a separate API domain.

## Environment variables (production)

Set these on your host (Railway, Render, Fly, EC2, etc.). Copy from [`.env.example`](.env.example).

| Variable | Example |
|----------|---------|
| `PORT` | Usually set automatically by the platform (often `3001` or dynamic) |
| `CLIENT_URL` | **`https://YOUR-PUBLIC-URL`** (same as the app URL users open — no trailing path) |
| `ZOOM_REDIRECT_URL` | `https://YOUR-PUBLIC-URL/api/auth/callback` |
| `DATABASE_URL` | PostgreSQL connection string (Neon, Railway Postgres, etc.) |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | Marketplace app |
| `ZOOM_SECRET_TOKEN` | Webhook secret token |
| `SESSION_SECRET` | Random string |
| `ZM_RTMS_CLIENT`, `ZM_RTMS_SECRET` | Same as Zoom Client ID/Secret unless Zoom says otherwise |
| AI keys | As required by your [`server/src/routes/ai.ts`](server/src/routes/ai.ts) |

**Important:** `CLIENT_URL` must match the public HTTPS origin where the app is hosted (Zoom OAuth redirect returns to the app with `?zoom_auth=callback`).

## Option A: Docker (any platform)

From the repo root:

```bash
docker build -t zoom-momentum .
docker run --env-file .env -p 3001:3001 zoom-momentum
```

Use your host’s secret/env UI instead of `--env-file` in production. Point HTTPS (TLS) at the container port (or use the platform’s managed TLS).

## Option B: Railway

1. New project → **Deploy from GitHub** with this repo. Prefer **Dockerfile** as the builder (repo root).
2. **Add PostgreSQL** (Railway → **New** → **Database** → **PostgreSQL**) *or* use an external DB (e.g. Neon).
3. **Wire `DATABASE_URL` to this app service** — this is required or the container exits with a clear error:
   - **Variables** → **New Variable** → **Reference** → choose your Postgres service → **`DATABASE_URL`**, *or*
   - Paste the same connection string manually as `DATABASE_URL`.
4. Add the rest: `ZOOM_*`, `SESSION_SECRET`, `CLIENT_URL` (your Railway HTTPS URL), `ZOOM_REDIRECT_URL`, etc.
5. **Networking** → generate a **public domain**; set `CLIENT_URL` and `ZOOM_REDIRECT_URL` to that origin.

If logs show `Environment variable not found: DATABASE_URL`, the app service never received **`DATABASE_URL`** — fix Variables (reference or paste), redeploy.

**Note:** `@zoom/rtms` includes a native addon. If a non-Docker build fails, use **Dockerfile** deploy from the repo root.

## Option C: Render / Fly.io / EC2

Same pattern:

- Build: `npm ci && npm run build`
- Start: `cd server && npx prisma migrate deploy && node dist/server.js`
- Bind: `0.0.0.0` and `PORT` (already supported in [`server/src/config.ts`](server/src/config.ts))
- TLS: terminate at the platform load balancer or nginx

## Zoom Marketplace URLs to configure

After deploy, use:

| Field | Value |
|-------|--------|
| Home URL | `https://YOUR-PUBLIC-URL` |
| OAuth Redirect | `https://YOUR-PUBLIC-URL/api/auth/callback` |
| RTMS Webhook | `https://YOUR-PUBLIC-URL/api/rtms/webhook` |
| Domain allowlist | `https://YOUR-PUBLIC-URL` (origin only, per Zoom UI) |

## Smoke test

- `GET https://YOUR-PUBLIC-URL/` → should load the app
- `GET https://YOUR-PUBLIC-URL/api/health` → `{ "status": "ok", "database": "up", ... }` if DB is wired

### Railway HTTP 502 / “connection dial timeout”

The edge can’t connect to your container. Common causes:

1. **Process crashed on startup** — missing **`ZOOM_CLIENT_ID`**, **`ZOOM_CLIENT_SECRET`**, **`ZOOM_REDIRECT_URL`**, **`SESSION_SECRET`**, or **`DATABASE_URL`**. Open **Deploy logs** and fix Variables.
2. **Migrations failed** — fix DB URL / permissions; logs show `prisma migrate deploy` errors.
3. After fixing env, **redeploy** and wait until logs show `[server] listening on 0.0.0.0:PORT`.
