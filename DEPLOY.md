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
| `DATABASE_URL` / `DIRECT_URL` | Neon pooled + direct URLs |
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

1. New project → **Deploy from GitHub** (or CLI) with this repo.
2. **Root directory:** repository root (where `package.json` lives).
3. **Build command:** `npm ci && npm run build`
4. **Start command:** `cd server && npx prisma migrate deploy && node dist/server.js`
5. **Variables:** add all env vars above; set **Railway public URL** as `CLIENT_URL` (e.g. `https://your-app.up.railway.app`).
6. Generate a **public domain** in Railway (HTTPS) and use that base URL in Zoom Marketplace.

**Note:** `@zoom/rtms` includes a native addon. If the build fails on Railway’s build image, use the **Dockerfile** deploy instead (Railway can build from `Dockerfile`).

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
