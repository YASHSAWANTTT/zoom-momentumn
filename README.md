# Zoom Momentum

A Zoom Apps SDK application that transforms passive virtual classrooms into active learning environments. Momentum runs as an in-meeting side panel, giving professors real-time engagement tools and giving students a dynamic topic timeline, glossary, and post-class review.

**Live deployment:** `https://zoom.shitijmathur.tech`

---

## How It Works

Zoom Momentum is a **single app** installed once on the Zoom Marketplace. When a participant opens it from the Apps panel during a meeting, the app detects their role automatically:

- **Host / Co-host** sees the **Host Dashboard** with controls to launch polls, start trivia games, and monitor the AI-powered live anchor.
- **Participants** see the **Student View** with a topic timeline, glossary, bookmark button, and receive polls/trivia from the host in real time.

Both views are served from the same URL. The Zoom SDK provides the user's role via `getUserContext()`, and the app renders the appropriate interface. There is no separate installation for students vs. professors — it is one app, one URL, role-aware.

### User Flow

```
Meeting starts
  -> Professor opens Momentum from the Zoom Apps panel
  -> OAuth login (first time only)
  -> Welcome screen (role-specific feature overview)
  -> Host Dashboard appears

Students open Momentum from the Zoom Apps panel
  -> OAuth login (first time only)
  -> Welcome screen (student feature overview)
  -> Student View appears
  -> Students automatically receive polls, trivia, and topic updates from the host
```

---

## Features

### Professor's Pulse (Host only)

Check-in polls that let the professor gauge student understanding at any point during the lecture.

- Enter optional context (e.g., "We just covered supply and demand")
- AI generates a relevant multiple-choice question
- Professor previews and can edit before launching
- Students see a modal overlay, select an answer, and submit
- Professor ends the poll and results are shown to everyone as a bar chart

### Warm-Up Arena (Host launches, students participate)

A timed trivia game for reviewing material at the start of class.

- Professor enters a topic and AI generates 5 quiz questions
- Each question has a 15-second countdown timer
- Students answer in real time and are scored (base points + speed bonus)
- Leaderboard updates after each question
- Final standings shown at the end

### Live Anchor (Automatic for all participants)

AI-powered real-time topic timeline and glossary built from the live lecture transcript.

- Host activates the AI analysis, which polls the transcript buffer every 30 seconds
- When the AI detects a topic change, a new topic card appears with bullet-point takeaways
- Technical terms and definitions are extracted into a searchable glossary
- Students see the same timeline and can switch between Timeline and Glossary tabs

### Recovery Agent (Post-class, student-facing)

Personalized post-class review based on moments the student bookmarked during the lecture.

- During the lecture, students can tap "I'm Confused" to bookmark the current topic
- When the class ends, the app generates a Recovery Pack with:
  - Plain-language explanation of each confusing topic
  - A practice problem
  - A suggested external resource
- A summary screen shows topics covered, key terms, and the recovery pack

---

## Host vs. Student View

| Capability | Host | Student |
|---|---|---|
| Launch polls | Yes | No (receives and answers) |
| Start trivia game | Yes | No (receives and plays) |
| Control AI anchor | Yes (start/stop/analyze now) | No (receives updates) |
| Topic timeline | Yes (read-only) | Yes (read-only) |
| Glossary | Yes (read-only) | Yes (searchable) |
| Bookmark confused moments | No | Yes |
| Post-class recovery pack | No | Yes |
| View poll/trivia results | Yes (aggregate) | Yes (own results) |

The host acts as the **source of truth** for all shared state. The host's app maintains the canonical state and broadcasts updates to all students via the Zoom SDK's `sendMessage` / `onMessage` API. Students never send data to each other directly.

---

## Architecture

```
Zoom Desktop Client
  +-- Side Panel (Embedded Browser)
        +-- React App
              +-- Host? -> HostDashboard
              +-- Student? -> StudentView

Both connect to:
  Express Backend (EC2 at zoom.shitijmathur.tech:3001)
    +-- /api/auth       -> Zoom OAuth PKCE
    +-- /api/ai         -> AI endpoints (poll, quiz, topic, recovery, cues)
    +-- /api/transcript  -> Transcript storage + rolling buffer
    +-- /api/bookmarks   -> Bookmark CRUD
    +-- /api/rtms        -> RTMS webhook handler (pending)

  AI Provider (Kiro API at kiro.shitijmathur.tech, OpenAI-compatible)
  PostgreSQL Database (Neon or any Postgres host, via Prisma ORM)
```

### Message Protocol

All real-time communication uses the Zoom SDK's `sendMessage` / `onMessage`:

| Message | Sender | Receiver | Purpose |
|---|---|---|---|
| `POLL_START` | Host | Students | Launch a poll |
| `POLL_RESPONSE` | Student | Host | Submit poll answer |
| `POLL_RESULTS` | Host | Students | Broadcast results |
| `ARENA_START` | Host | Students | Begin trivia |
| `ARENA_QUESTION` | Host | Students | Send next question |
| `ARENA_ANSWER` | Student | Host | Submit trivia answer |
| `ARENA_LEADERBOARD` | Host | Students | Show scores |
| `ARENA_END` | Host | Students | Final standings |
| `TOPIC_UPDATE` | Host | Students | New/updated topic |
| `GLOSSARY_UPDATE` | Host | Students | New terms |
| `FULL_STATE` | Host | Students | Late-joiner sync |
| `REQUEST_STATE` | Student | Host | Request full state |

---

## Deployment

**Single public HTTPS URL:** In production, the Express server serves the built Vite app from `client/dist` and all `/api` routes, so Zoom Marketplace can use one **Home URL** and `fetch('/api/...')` works without a separate API domain.

See **[DEPLOY.md](DEPLOY.md)** for Docker, Railway, env vars, and Zoom URL checklist.

The team also runs the app on an **EC2 instance** at `zoom.shitijmathur.tech` with HTTPS.

### Zoom Marketplace Configuration

The Zoom App is registered and configured on [marketplace.zoom.us](https://marketplace.zoom.us):

- **Home URL:** `https://zoom.shitijmathur.tech`
- **Redirect URL:** `https://zoom.shitijmathur.tech/api/auth/callback`
- **Webhook URL:** `https://zoom.shitijmathur.tech/api/rtms/webhook`
- **RTMS:** Enabled (1-year trial through Feb 2027)
- **OAuth Scopes:** `zoomapp:inmeeting`, `meeting:read:meeting`, `user:read`

### Environment Variables

| Variable | Description |
|---|---|
| `ZOOM_CLIENT_ID` | From Zoom Marketplace app |
| `ZOOM_CLIENT_SECRET` | From Zoom Marketplace app |
| `ZOOM_REDIRECT_URL` | `https://zoom.shitijmathur.tech/api/auth/callback` |
| `SESSION_SECRET` | Random secret for express-session |
| `DATABASE_URL` | PostgreSQL connection string (Neon **pooled** URL recommended for the app) |
| `DIRECT_URL` | PostgreSQL **direct** (non-pooled) URL for Prisma migrations; use the same value as `DATABASE_URL` if Neon only provides one connection string |
| `ZOOM_SECRET_TOKEN` | Zoom app **Secret Token** for webhook verification (RTMS and other events); should match Marketplace |
| `ZM_RTMS_CLIENT` | Same as `ZOOM_CLIENT_ID` for `@zoom/rtms` server join (unless Zoom specifies otherwise) |
| `ZM_RTMS_SECRET` | Same as `ZOOM_CLIENT_SECRET` for `@zoom/rtms` |
| `OPENAI_API_KEY` | API key for the AI provider |
| `OPENAI_BASE_URL` | `https://kiro.shitijmathur.tech/v1` (or OpenAI default) |
| `PORT` | Server port (default: 3001) |
| `CLIENT_URL` | Frontend URL (default: `http://localhost:5173`) |

---

## Local Development

### Prerequisites

- Node.js 18+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in credentials (see Environment Variables above)

# 3. Copy env to server directory (server reads from its own cwd)
cp .env server/.env

# 4. Apply database migrations (requires valid Neon `DATABASE_URL` + `DIRECT_URL` in server/.env)
cd server && npx prisma migrate deploy && cd ..

# 5. Start development servers
npm run dev
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start client (5173) + server (3001) |
| `npm run dev:mock` | Same + mock transcript service |
| `npm run build` | Production build |
| `npm run db:migrate -w server` | Create/apply migrations in dev (`prisma migrate dev`) |
| `npm run db:deploy -w server` | Apply pending migrations in prod/CI (`prisma migrate deploy`) |
| `npm run db:studio -w server` | Open Prisma Studio |

### DevPreview (Browser Testing)

When accessed outside of Zoom, the app renders a **DevPreview** that simulates both Host and Student views. This lets you test UI flows without a Zoom meeting:

- Host/Student view toggle
- All feature tabs (Pulse, Arena, Anchor)
- Real AI integration for poll/quiz/recovery generation
- End Class flow with Recovery Pack
- Simulation controls for:
  - Late joiner banner (`FULL_STATE` catch-up)
  - Meeting end (`onRunningContextChange` → post-class summary)
  - Auto-bookmark cues (detect-cues → bookmark toast)
  - Active speaker / Smart Spotlight label

---

## Project Structure

```
zoom-momentum/
  client/                          # React frontend (Zoom App)
    src/
      App.tsx                      # SDK init, auth, welcome, role routing
      DevPreview.tsx               # Browser-only testing UI
      views/
        WelcomeView.tsx            # Post-auth onboarding screen
        HostDashboard.tsx          # Host: Pulse + Arena + Anchor
        StudentView.tsx            # Student: Timeline + Glossary
        AuthView.tsx               # OAuth login
      components/
        pulse/                     # Poll creator, card, results
        arena/                     # Quiz host, student, leaderboard
        anchor/                    # Topic card, timeline, glossary
        recovery/                  # Recovery pack, post-class summary
        shared/                    # FeatureInfo tooltip
      hooks/
        useZoomSdk.ts              # SDK config + role detection
        useZoomAuth.ts             # OAuth PKCE flow
        useMessaging.ts            # sendMessage / onMessage abstraction
        usePulse.ts                # Poll state (host + student)
        useArena.ts                # Trivia state (host + student)
        useLiveAnchor.ts           # Topic timeline state (host + student)
      types/
        messages.ts                # Message types + app state

  server/                          # Express backend
    src/
      server.ts                    # Express app + middleware + security headers
      config.ts                    # Environment variable validation
      routes/
        auth.ts                    # Zoom OAuth PKCE
        ai.ts                      # AI endpoints (subject-agnostic)
        transcript.ts              # Transcript storage + rolling buffer
        bookmarks.ts               # Bookmark CRUD
    prisma/
      schema.prisma                # Database schema

  mock-transcript/                 # Dev-only mock RTMS service
  product-page/                    # Marketing landing page
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript + @zoom/appssdk |
| Backend | Express + TypeScript + Prisma |
| Database | PostgreSQL (e.g. [Neon](https://neon.tech)) via Prisma |
| AI | Kiro API (OpenAI-compatible, configurable via `OPENAI_BASE_URL`) |
| Hosting | EC2 with HTTPS (`zoom.shitijmathur.tech`) |
| Transcript | Zoom RTMS (real-time media streams) |

---

## Status

### Done

- [x] Zoom OAuth PKCE authentication
- [x] Host/student role detection and routing
- [x] Welcome/onboarding screen with role-specific feature descriptions
- [x] Feature info tooltips (?) on every tab
- [x] Professor's Pulse — AI poll generation, preview/edit, launch, results bar chart
- [x] Warm-Up Arena — AI quiz generation, 15s countdown, scoring, leaderboard
- [x] Live Anchor — AI transcript analysis, topic timeline, searchable glossary
- [x] Recovery Agent — bookmarks, post-class summary, AI recovery pack
- [x] Detect Cues endpoint — AI detection of professor emphasis phrases
- [x] Messaging layer with sequence numbers and late-joiner sync protocol
- [x] DevPreview for browser-based testing without Zoom
- [x] Subject-agnostic AI prompts (tested with history, biology, economics)
- [x] Mock transcript service for development
- [x] Clean emoji-free UI with Zoom brand colors
- [x] EC2 deployment with HTTPS
- [x] Zoom Marketplace app configured with RTMS enabled

### Pending

- [ ] **RTMS hardening in production** — validate webhook payloads on first live traffic, `@zoom/rtms` native addon on Linux, TLS (`ZM_RTMS_CA`) if needed
- [x] **Production database** — PostgreSQL via Prisma ([Neon](https://neon.tech) supported; see below)

---

## RTMS (Realtime Media Streams)

Live lecture **transcript** for Live Anchor comes from [Zoom RTMS](https://developers.zoom.us/docs/rtms/meetings/). Polls, Arena, and SDK messaging do **not** use RTMS.

### Account and Marketplace (manual checklist)

1. **Enable RTMS** on your Zoom account — [request access](https://www.zoom.com/en/realtime-media-streams/#form) or contact your account team ([Getting started](https://developers.zoom.us/docs/rtms/)).
2. **Add RTMS scopes** to your Zoom Marketplace app — [Add RTMS features to your app](https://developers.zoom.us/docs/rtms/meetings/add-features/).
3. **Event subscription**: point Zoom webhooks to `https://<your-domain>/api/rtms/webhook` and subscribe to RTMS events (`meeting.rtms_started`, `meeting.rtms_stopped`, etc.).
4. **Secret Token** in the Zoom app must match `ZOOM_SECRET_TOKEN` in `.env` (used for HMAC verification in [`server/src/routes/rtms.ts`](server/src/routes/rtms.ts)).

### App behavior

- The **host** starts RTMS via **`startRTMS()`** when they start **Live Anchor** (Zoom Apps SDK); **`stopRTMS()`** runs when they stop Anchor.
- Zoom sends **`meeting.rtms_started`** to your server; the backend connects with `@zoom/rtms` and stores transcript chunks in Postgres (`TranscriptSegment`).
- The host client polls **`GET /api/transcript/buffer?meetingId=<Zoom meeting UUID>`** — same id as `meetingUUID` from the SDK (aligned with RTMS).

### Server environment (`server/.env`)

| Variable | Purpose |
|----------|---------|
| `ZOOM_SECRET_TOKEN` | Webhook HMAC (preferred over client secret fallback) |
| `ZM_RTMS_CLIENT` | Same value as `ZOOM_CLIENT_ID` unless Zoom gives separate RTMS credentials |
| `ZM_RTMS_SECRET` | Same value as `ZOOM_CLIENT_SECRET` |
| `ZM_RTMS_CA` | Optional path to CA bundle for the native RTMS client TLS |

### Local dev without Zoom

Use **`npm run dev:mock`** so [`mock-transcript`](mock-transcript/) posts chunks to `/api/transcript/segment`. Default `MOCK_MEETING_ID` is `mock-meeting-001`; the in-meeting app uses the real meeting UUID from the SDK.

---

## Database (Neon / PostgreSQL)

The app uses **PostgreSQL** only. [Neon](https://neon.tech) is a good fit (serverless Postgres, pooled + direct connection strings).

1. Create a project in the Neon console and copy the **pooled** connection string into `DATABASE_URL` and the **direct** (non-pooled) string into `DIRECT_URL` in `server/.env` (and root `.env` if you keep them in sync). If Neon only shows one URL, set **both** variables to the same value.
2. **Apply migrations** (from `server/` so Prisma loads `server/.env`):

   ```bash
   cd server && npx prisma migrate deploy && cd ..
   ```

   For local schema iteration (creates a new migration file), use `npx prisma migrate dev` instead.

3. **Production deploy**: run `prisma migrate deploy` on the server or in CI before starting the Node process, using the same env vars as runtime.

4. **Smoke tests** after wiring Neon:
   - **OAuth / app**: complete a login flow and confirm `User` and `Meeting` rows appear (see `server/prisma/schema.prisma`).
   - **Transcript**: `POST /api/transcript/segment` with a valid `meetingId` (existing FK) or rely on RTMS `resolveMeetingId` to create a meeting.
   - **RTMS**: when the webhook and `@zoom/rtms` ingest run, transcript rows should appear in `TranscriptSegment` (same table as the mock HTTP path).

**Env file locations**: `npm run dev -w server` uses the **server** working directory, so Prisma and the app read `server/.env`. The README `cp .env server/.env` step keeps root and server copies aligned; `server/.env.example` lists the required variables.

**If `npx neonctl@latest init` shows “connection strings found but could not be matched” or “.envEndpoint not found”:** that command mainly wires Neon’s **AI tooling** (MCP, Cursor/VS Code extension, agent skills). Its automatic `.env` injection does not always match Prisma layouts or placeholder URLs. You can **ignore that warning** for app connectivity: open the [Neon Console](https://console.neon.tech) → your project → **Connect**, copy the **pooled** URL into `DATABASE_URL` and the **direct** URL into `DIRECT_URL` in `server/.env`, then run `npx prisma migrate deploy` from `server/`. Alternatively use `neonctl connection-string` and paste the values manually.
