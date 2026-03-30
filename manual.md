# Zoom Momentum -- Manual Setup Guide

Follow these steps to get the app running and testable inside a Zoom meeting.

---

## 1. Install Dependencies

```bash
npm install
```

This installs all three workspaces: `client`, `server`, and `mock-transcript`.

---

## 2. Run Prisma migrations

Set `DATABASE_URL` in `server/.env` to your [Neon](https://neon.tech) (or other PostgreSQL) connection string (see `.env.example`), then:

```bash
cd server && npx prisma migrate deploy && cd ..
```

This applies all migrations to your PostgreSQL database.

---

## 3. Fill In Environment Variables

Copy the template and fill in real values:

```bash
cp .env.example .env
cp .env server/.env
```

Required values in `.env`:

| Variable | Where to get it |
|---|---|
| `ZOOM_CLIENT_ID` | Zoom Marketplace → your app → App Credentials |
| `ZOOM_CLIENT_SECRET` | Zoom Marketplace → your app → App Credentials |
| `ZOOM_REDIRECT_URL` | `https://<your-server-domain>/api/auth/callback` |
| `SESSION_SECRET` | Any random string. Generate one: `openssl rand -hex 32` |
| `OPENAI_API_KEY` | Your AI provider API key |
| `OPENAI_BASE_URL` | `https://kiro.shitijmathur.tech/v1` (or omit for OpenAI default) |
| `DATABASE_URL` | PostgreSQL URL from Neon (or elsewhere); used for Prisma migrations and the running app |
| `PORT` | `3001` (already set) |
| `CLIENT_URL` | `http://localhost:5173` (already set) |

---

## 4. Expose your server (for local dev)

Zoom must be able to reach your server for OAuth and webhooks. Use a tunnel (e.g. Cloudflare Tunnel, localtunnel, or a similar tool) pointing at port 3001, then set `ZOOM_REDIRECT_URL` in `.env` to your public URL (e.g. `https://your-tunnel-domain.example.com/api/auth/callback`).

---

## 5. Configure Zoom Marketplace App

Go to [marketplace.zoom.us](https://marketplace.zoom.us) and configure your app:

### OAuth Settings
- **Redirect URL:** `https://<your-server-domain>/api/auth/callback`
- **Allow List:** Add your server domain

### Scopes
- `zoomapp:inmeeting` -- required for in-meeting side panel

### Surface (required for in-meeting and to fix 80004)
- **Domain Whitelist URL:** Add your app’s origin (e.g. `https://<your-server-domain>` for dev, or your production URL). Add `http://localhost:5173` if you test locally.
- **Select WHERE to use your app:** Turn **In-Meeting** ON and select **Meetings**.
- **In-Client App Features → Zoom App SDK:** The SDK toggle must be ON **and** you must add APIs:
  - If it says **“You have 0 APIs added for this app”**, click **Add API**.
  - Add the Zoom App SDK APIs your app needs (e.g. user context, in-meeting messaging/postMessage, authorize/OAuth, notifications). Without at least one API added, you get **“No Permission for this API (80004, app_not_support)”**.
- **Help URL** / **Privacy Policy URL:** Optional but recommended for publish.

### RTMS (Real-Time Media Streams)
RTMS access has been granted (1-year trial through Feb 2027). Configure:
- **Webhook subscriptions:** Add `meeting.rtms_started` and `meeting.rtms_stopped` events
- **Webhook URL:** `https://<your-server-domain>/api/rtms/webhook`
- Ensure transcript streaming scope is enabled on the account

### Zoom Client Requirement
- Host and app users must be on Zoom client **v6.5.5+** for RTMS to work

---

## 6. Start the Dev Server

```bash
# Client (port 5173) + Server (port 3001)
npm run dev

# With mock transcript feed (adds fake lecture data every 3s)
npm run dev:mock
```

---

## 7. Test in Zoom

1. Make sure your server is reachable from the internet (tunnel or deployed URL) and dev server is running (`npm run dev`)
2. Open a Zoom meeting
3. Go to **Apps** → find your app → open it
4. The app loads in the side panel
5. As the meeting host, you'll see the **Host Dashboard**
6. Other participants see the **Student View**

**Sign-in is optional.** You can use the app (polls, Arena, timeline, glossary) without signing in. Sign in with Zoom only if you want to **save bookmarks** (“I’m Confused”) to your account; students see a “Sign in to save bookmarks” button when not signed in.

### Testing with Mock Transcript
Run `npm run dev:mock` instead of `npm run dev`. This starts a mock transcript service that sends fake lecture chunks to the server every 3 seconds, simulating a live lecture without needing real RTMS.

---

## Troubleshooting

- **"Cannot find module" errors after clone:** Run `npm install` from the root.
- **Prisma errors:** Ensure `server/.env` has a valid `DATABASE_URL`, then run `cd server && npx prisma migrate deploy`.
- **OAuth redirect fails:** Check that `ZOOM_REDIRECT_URL` in `.env` matches exactly what's configured in Zoom Marketplace.
- **App doesn't load in Zoom:** Verify the Home URL in Marketplace matches your server domain. Check browser console for SDK errors.
- **CORS errors:** The Vite dev server proxies `/api/*` to `localhost:3001`. Make sure the server is running.
- **"No Permission for this API" (code 80004, reason: app_not_support):** Usually caused by **0 APIs added** for Zoom App SDK. In Marketplace → your app → **Surface** → **In-Client App Features** → **Zoom App SDK**, click **Add API** and add the APIs the app uses (e.g. user context, in-meeting messaging, authorize). Also ensure: app type is **Zoom App**, **In-Meeting** is ON under “Select WHERE to use your app”, scope `zoomapp:inmeeting` is added, and Domain Whitelist includes your app URL.
