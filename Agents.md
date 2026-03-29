# Project Memory: Zoom Momentum

Use `zoom-momentum-tasks.md` as the source of truth for tasks and context.

---

## What Is This Project?

Zoom Momentum is a **Zoom Apps SDK** in-meeting side panel app for live college lectures. It gives professors real-time engagement tools (polls, quizzes, live summaries) and gives students a dynamic timeline, glossary, and bookmarks — all powered by live transcript AI.

**Key docs:**
- [`feature-specification.md`](feature-specification.md) — Full feature specs and architecture diagrams
- [`zoom-momentum-implementation.md`](zoom-momentum-implementation.md) — Architectural decisions, message protocol, build order
- [`api-verification.md`](api-verification.md) — Zoom SDK API verification report
- [`zoom-momentum-tasks.md`](zoom-momentum-tasks.md) — Task breakdown with completion status

---

## What Has Been Done

### Completed (Phases 1–6 partial)

**Monorepo scaffolding** — npm workspaces with `client`, `server`, `mock-transcript` packages.

**Frontend (Vite + React 18 + TypeScript):**
- Zoom SDK initialization ([`useZoomSdk.ts`](client/src/hooks/useZoomSdk.ts)) — calls `zoomSdk.config()` with SDK script tag + `version: '0.16.0'`, detects host vs participant role
- OAuth PKCE flow ([`useZoomAuth.ts`](client/src/hooks/useZoomAuth.ts)) — full authorize → onAuthorized → callback → session flow
- Messaging layer ([`useMessaging.ts`](client/src/hooks/useMessaging.ts)) — `connect()` + `sendMessage()` + `onMessage()` with sequence-numbered state sync, late joiner catch-up via `onParticipantChange` auto-broadcast of `FULL_STATE`
- Message types ([`messages.ts`](client/src/types/messages.ts)) — full type system for all message types (FULL_STATE, REQUEST_STATE, ARENA_*, TOPIC_*, GLOSSARY_*, POLL_*)
- Role-based routing ([`App.tsx`](client/src/App.tsx)) — SDK init → auth check → HostDashboard or StudentView, with full message routing for all Pulse and Arena message types
- Zoom detection ([`main.tsx`](client/src/main.tsx)) — uses `window.zoomSdk` to detect Zoom client; renders `DevPreview` outside Zoom, `App` inside
- Zoom-branded CSS ([`index.css`](client/src/index.css))

**Professor's Pulse (Feature C) — COMPLETE:**
- [`usePulse.ts`](client/src/hooks/usePulse.ts) — Full host + student hooks: generate → preview/edit → launch → collect responses → end → show results
- [`PollCreator.tsx`](client/src/components/pulse/PollCreator.tsx) — Host UI: idle → generating → editable preview → live (response counter) → results
- [`PollCard.tsx`](client/src/components/pulse/PollCard.tsx) — Student overlay: option selection + submit, disabled after answering
- [`PollResults.tsx`](client/src/components/pulse/PollResults.tsx) — Bar chart results with percentages and counts
- Wired into [`HostDashboard.tsx`](client/src/views/HostDashboard.tsx) Pulse tab and [`StudentView.tsx`](client/src/views/StudentView.tsx) overlay
- Message routing in [`App.tsx`](client/src/App.tsx): POLL_START, POLL_RESPONSE, POLL_RESULTS

**Warm-Up Arena (Feature B) — COMPLETE:**
- [`useArena.ts`](client/src/hooks/useArena.ts) — Full host + student hooks: fetch AI questions → start game → countdown timer → scoring (1000 base + speed bonus) → leaderboard → next question → finish
- [`ArenaHost.tsx`](client/src/components/arena/ArenaHost.tsx) — Host UI: topic input → generate → ready → question view (countdown, response count, correct answer highlight) → leaderboard → finished
- [`ArenaStudent.tsx`](client/src/components/arena/ArenaStudent.tsx) — Student overlay: waiting → question (countdown, tap-to-answer) → answered → leaderboard (correct/wrong reveal + explanation) → final standings
- [`Leaderboard.tsx`](client/src/components/arena/Leaderboard.tsx) — Medal display (🥇🥈🥉), top 10, compact mode
- Wired into [`HostDashboard.tsx`](client/src/views/HostDashboard.tsx) Arena tab and [`StudentView.tsx`](client/src/views/StudentView.tsx) overlay
- Message routing in [`App.tsx`](client/src/App.tsx): ARENA_START, ARENA_QUESTION, ARENA_ANSWER, ARENA_LEADERBOARD, ARENA_END

**Live Anchor (Feature A) — COMPLETE:**
- [`useLiveAnchor.ts`](client/src/hooks/useLiveAnchor.ts) — Host hook: 30s polling loop fetches transcript buffer → calls AI topic-segment → broadcasts TOPIC_UPDATE/GLOSSARY_UPDATE. Student hook: accumulates topics + glossary from messages, bookmark support.
- [`TopicCard.tsx`](client/src/components/anchor/TopicCard.tsx) — Single topic card with title, bullets, timestamp, bookmark button
- [`Timeline.tsx`](client/src/components/anchor/Timeline.tsx) — Scrolling list of topic cards, newest first, current topic highlighted
- [`GlossaryTab.tsx`](client/src/components/anchor/GlossaryTab.tsx) — Searchable glossary with terms, definitions, formulas
- Wired into [`HostDashboard.tsx`](client/src/views/HostDashboard.tsx) Anchor tab (AI controls: start/stop/poll now + topic view + glossary)
- Wired into [`StudentView.tsx`](client/src/views/StudentView.tsx) Timeline + Glossary tabs with "📌 I'm Confused" bookmark button + toast
- Message routing in [`App.tsx`](client/src/App.tsx): TOPIC_UPDATE, GLOSSARY_UPDATE

**DevPreview** ([`DevPreview.tsx`](client/src/DevPreview.tsx)) — Full standalone dev testing environment for Pulse, Arena, and Live Anchor features with simulated host/student modes, mock data, and all UI states.

**Backend (Express + TypeScript + Prisma/PostgreSQL):**
- OAuth routes ([`auth.ts`](server/src/routes/auth.ts)) — `/authorize`, `/callback` (GET redirect + POST token exchange), `/me`
- AI routes ([`ai.ts`](server/src/routes/ai.ts)):
  - `/poll-generate` — **WORKING** — real OpenAI/compatible LLM integration with JSON extraction + 3 fallback polls
  - `/quiz-generate` — **WORKING** — real AI quiz generation with JSON extraction + 5 fallback questions
  - `/topic-segment` — **WORKING** — AI transcript analysis for topic changes, bullets, glossary terms + keyword fallback
  - `/recovery-pack` — **STUB** — returns `{ items: [] }`
  - `/detect-cues` — **STUB** — returns `{ hasCue: false }`
- Transcript routes ([`transcript.ts`](server/src/routes/transcript.ts)) — POST `/segment`, GET `/buffer` (rolling ~300 word window)
- Bookmark routes ([`bookmarks.ts`](server/src/routes/bookmarks.ts)) — POST `/`, GET `/`
- Prisma schema ([`schema.prisma`](server/prisma/schema.prisma)) — User, Meeting, TranscriptSegment, Bookmark, QuizSet, RecoveryPack
- Config validation ([`config.ts`](server/src/config.ts)) — fails fast on missing env vars

**Mock transcript** ([`mock-transcript/src/index.ts`](mock-transcript/src/index.ts)) — 16 sample math lecture chunks, POSTs to `/api/transcript/segment` every 3 seconds, loops.

**Database** — Prisma migrations target PostgreSQL (e.g. Neon); run `npx prisma migrate deploy` from `server/` with `DATABASE_URL` and `DIRECT_URL` set.

---

## What Needs To Be Done Next

### Immediate Next Task: Recovery Agent (Feature D)

Professor's Pulse, Warm-Up Arena, and Live Anchor are all complete. The next feature is **Recovery Agent** — post-class summary and bookmark-based review.

**What to build:**
1. Implement `/api/ai/recovery-pack` — takes bookmarks + transcript segments, generates a study pack
2. Implement `/api/ai/detect-cues` — detects professor importance cues ("this will be on the exam")
3. Post-class summary view — shows bookmarked moments with context
4. Auto-bookmark on professor cues (uses detect-cues endpoint)

**Files to create/modify:**
- `server/src/routes/ai.ts` — implement `/recovery-pack` and `/detect-cues` stubs
- `client/src/hooks/useRecovery.ts` — new hook for recovery pack generation
- `client/src/components/recovery/` — RecoveryCard, SummaryView components
- New student view tab or post-meeting page

### Full Build Order

1. ~~**Professor's Pulse**~~ ✅ DONE
2. ~~**Warm-Up Arena**~~ ✅ DONE
3. ~~**Live Anchor**~~ ✅ DONE
4. **Recovery Agent** ← START HERE
5. **Enhancements** (auto-bookmark, smart spotlight, post-class summary)

### RTMS Integration
- **RTMS access has been granted** to all core developer accounts (1-year trials through Feb 2027).
- Not yet implemented. See [`zoom-momentum-tasks.md`](zoom-momentum-tasks.md) tasks 18–19.
- Can be built in parallel with Live Anchor (mock transcript works for dev, RTMS for production).

---

## How To Run

### Prerequisites
- Node.js 18+
- npm 9+

### Setup
```bash
# Install all workspace dependencies
npm install

# Copy env template and fill in values
cp .env.example .env

# Apply Prisma migrations (requires Neon or Postgres URLs in server/.env)
cd server && npx prisma migrate deploy && cd ..
```

### Environment Variables (`.env` at root)
```
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
ZOOM_REDIRECT_URL=https://your-server-domain/api/auth/callback
SESSION_SECRET=any-random-string
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://kiro.shitijmathur.tech/v1
PORT=3001
CLIENT_URL=http://localhost:5173
```

Note: `server/.env` also needs all the same variables. Copy with `cp .env server/.env`.

### Dev Commands
```bash
# Start client (port 5173) + server (port 3001) concurrently
npm run dev

# Start with mock transcript feed included
npm run dev:mock
```

### Testing in Zoom
1. Ensure your server is reachable (tunnel or deployed URL) and set `ZOOM_REDIRECT_URL` in `.env` accordingly
2. Configure Zoom App on marketplace.zoom.us with your server URL
3. Open a Zoom meeting → Apps → find your app

---

## Architecture Quick Reference

### Host-as-Source-of-Truth Pattern
- Host maintains the canonical `AppState` object
- Students request state via `REQUEST_STATE` message
- Host responds with `FULL_STATE` containing the entire state
- All state mutations happen on host, then broadcast to students
- Sequence numbers prevent race conditions

### Message Flow
```
Student joins → connect() → sends REQUEST_STATE
Host receives → responds with FULL_STATE (seq N)
Host action → broadcasts delta message (seq N+1)
Students apply delta to local state
```

### Key Architectural Decisions
1. **`connect()` + `sendMessage()`** over Collaborate Mode (Collaborate is deprecated)
2. **All detection events are host-only** (`onParticipantChange`, `onActiveSpeakerChange`)
3. **Sequence-numbered messages** to prevent race conditions
4. **Build non-RTMS features first** for velocity
5. **Mock transcript pipeline** uses same HTTP endpoint as real RTMS will
6. **`sendMessage` payload budget** — keep under 1KB per message

### Tech Stack
- **Client:** Vite + React 18 + TypeScript + @zoom/appssdk
- **Server:** Express + TypeScript + Prisma + PostgreSQL (e.g. Neon)
- **AI:** OpenAI-compatible API (Kiro/Claude via `OPENAI_BASE_URL`)
- **Monorepo:** npm workspaces

---

## Project Structure
```
zoom-momentum/
├── client/                  # Vite + React frontend
│   └── src/
│       ├── App.tsx          # Entry: SDK init → auth → role routing
│       ├── hooks/           # useZoomSdk, useZoomAuth, useMessaging
│       ├── types/           # Message types and AppState
│       └── views/           # HostDashboard, StudentView, AuthView
├── server/                  # Express backend
│   ├── prisma/              # Schema + migrations + PostgreSQL
│   └── src/
│       ├── server.ts        # Express app setup
│       ├── config.ts        # Env validation
│       └── routes/          # auth, ai, transcript, bookmarks
├── mock-transcript/         # Fake transcript feed for dev
├── package.json             # Root monorepo config
├── .env.example             # Env template
└── *.md                     # Planning & spec docs
```

## Cursor Cloud specific instructions

### Services overview
- **Client** (Vite + React): `npm run dev -w client` → port 5173. Proxies `/api/*` to backend.
- **Server** (Express + TypeScript): `npm run dev -w server` → port 3001. Requires env vars in `server/.env`.
- **Mock Transcript** (optional): `npm run dev -w mock-transcript`. Simulates RTMS transcript chunks.
- Combined: `npm run dev` (client + server) or `npm run dev:mock` (all three).

### Environment variables
The server uses `dotenv/config` which loads `.env` from `process.cwd()`. When using npm workspaces (`npm run dev -w server`), the cwd is the **server directory**, so the `.env` with all variables (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URL, SESSION_SECRET, OPENAI_API_KEY) must be in `server/.env`, not just the root `.env`. The root `.env` is only used if you run commands from the root directory directly. Prisma needs `DATABASE_URL` and `DIRECT_URL` (Neon pooled + direct, or the same string twice) in `server/.env`.

### Database
PostgreSQL via Prisma (Neon supported). After install, run `cd server && npx prisma migrate deploy` against your database. See [README.md](README.md) **Database (Neon / PostgreSQL)**.

### Build and type-check
- No dedicated lint or test scripts are configured in this repo.
- `tsc --noEmit` in `server/` passes cleanly; in `client/` there are 2 pre-existing TS errors from Zoom SDK type incompatibilities — these do not block Vite dev or build.
- `npx vite build` in `client/` and `npx tsc` in `server/` both succeed.

### Running outside Zoom
The frontend is a Zoom Apps SDK side-panel app. `main.tsx` checks `navigator.userAgent` for `ZoomApps` or the URL for `zoomapp` to detect if we're inside Zoom. Outside Zoom, `DevPreview` renders automatically. To force the real `App` (even outside Zoom), add `?app=1`. The Zoom SDK script (`sdk.js`) is loaded globally via `index.html` so `window.zoomSdk` exists even outside Zoom — do NOT use `window.zoomSdk` for detection.

### AI integration
The server uses an OpenAI-compatible API (configured via `OPENAI_BASE_URL` and `OPENAI_API_KEY`). All AI endpoints return 500 on failure instead of hardcoded fallbacks — there is no subject-specific fallback content. Prompts are fully subject-agnostic and work for any academic discipline.

### Deployment
The app runs on EC2 at `zoom.shitijmathur.tech` with HTTPS. The Zoom Marketplace app is fully configured with OAuth redirect URL and RTMS webhook URL pointing to this domain. AI is served by Kiro API at `kiro.shitijmathur.tech`.

### Transcript foreign key caveat
The mock transcript service POSTs to `/api/transcript/segment` with `meetingId: "mock-meeting-001"`. This requires a matching `Meeting` record in the DB, or it will 500 due to a Prisma foreign key constraint. A meeting must be created first (e.g., via the auth/OAuth flow which creates user and meeting records).

### What's pending
- **RTMS integration** (Tasks 18-19): Build `/api/rtms/webhook` and `@zoom/rtms` WebSocket ingestion. RTMS is enabled on the Zoom app; the webhook URL is configured. Need to implement the handler and transcript ingestion service.
- **Auto-bookmark broadcast** (Task 28): The detect-cues AI endpoint works. Need host-side logic to call it periodically and broadcast auto-bookmarks.
- **Smart Spotlight** (Task 29): Needs `onActiveSpeakerChange` (host-only event).
- **Late Joiner** (Task 14): Needs `onParticipantChange` (host-only event). The `REQUEST_STATE`/`FULL_STATE` protocol is already in `useMessaging.ts`.
- **Post-meeting detection** (Task 31): Needs `onRunningContextChange` to detect `inMeeting` -> `inMainClient` transition.

---

## Changelog

### 2026-03-07 — Fix "Something went wrong" error inside Zoom meeting (Error EF7F5831)

**Root cause:** Three issues prevented the app from initializing correctly inside the Zoom client:

1. **Missing SDK script tag** — The Zoom client requires `<script src="https://appssdk.zoom.us/sdk.js">` in the HTML to bootstrap the global `window.zoomSdk` object. The app only had the npm `@zoom/appssdk` package, which is not sufficient on its own inside the Zoom WebView.
2. **Broken Zoom detection** — `main.tsx` checked for `zoomapp` in the URL query string or `ZoomApps` in the user agent. Neither is reliable inside the Zoom client. When detection failed, `DevPreview` rendered instead of `App`, so `zoomSdk.config()` was never called — causing the Zoom client to show the generic error screen.
3. **Missing `version` in SDK config** — `zoomSdk.config()` was called without a `version` field. The working arlo project passes `version: '0.16.0'`.

**Files changed:**
- `client/index.html` — Added `<script src="https://appssdk.zoom.us/sdk.js">`
- `client/src/main.tsx` — Changed Zoom detection to `!!(window as any).zoomSdk`
- `client/src/hooks/useZoomSdk.ts` — Added `version: '0.16.0'` to `zoomSdk.config()`, fixed `meetingUUID` type error

### 2026-03-07 — Implement Live Anchor (Feature A)

**What was built:** Full real-time topic timeline and glossary system — the third core feature.

**Files created:**
- `client/src/hooks/useLiveAnchor.ts` — Host polling loop (30s interval) + student state accumulation
- `client/src/components/anchor/TopicCard.tsx` — Topic card with title, bullets, timestamp, bookmark
- `client/src/components/anchor/Timeline.tsx` — Scrolling topic list, newest first
- `client/src/components/anchor/GlossaryTab.tsx` — Searchable glossary/formula sheet
- `client/src/components/anchor/index.ts` — Barrel export

**Files modified:**
- `server/src/routes/ai.ts` — Implemented `/topic-segment` endpoint (AI + fallback)
- `client/src/App.tsx` — Added anchor hooks + TOPIC_UPDATE/GLOSSARY_UPDATE message routing
- `client/src/views/HostDashboard.tsx` — Anchor tab with AI controls (start/stop/poll now)
- `client/src/views/StudentView.tsx` — Timeline + Glossary tabs + bookmark button + toast
- `client/src/DevPreview.tsx` — Added anchor simulation with mock topics/glossary
- `client/src/hooks/useMessaging.ts` — Fixed TS error: `onMessage` payload type (`JSONObject` → runtime check)
- `client/src/index.css` — Added anchor CSS (topic cards, glossary, bookmark toast)

### 2026-03-07 — Recovery Agent + Subject-Agnostic AI + Bug Fixes

**Recovery Agent (Feature D — Tasks 30-31):**
- Implemented `/api/ai/recovery-pack` endpoint — generates personalized review items per bookmarked moment
- Created `RecoveryPackCard` component — numbered items with explanation, practice, resource
- Created `PostClassSummary` component — post-class stats, topics, terms, recovery pack
- Added "End Class" flow in DevPreview — bookmark during lecture → end class → summary

**Subject-Agnostic AI overhaul:**
- Removed ALL hardcoded math/calculus fallbacks from every AI endpoint
- Rewrote all prompts to work for any academic subject (history, biology, economics, etc.)
- AI endpoints now return 500 on failure instead of subject-specific fallback data
- Implemented `/api/ai/detect-cues` endpoint — detects professor importance signals in transcript
- Consistent model (`claude-sonnet-4.5`) across all endpoints

**Bug fixes:**
- Fixed DevPreview not loading (Zoom SDK detection broken by `sdk.js` global)
- Fixed duplicate topics/glossary in Anchor DevPreview simulation
- Fixed "1 responses" / "1 answers" grammar
- Validated POLL_RESPONSE against active poll ID
- Blocked ARENA_ANSWER after countdown expires
- Added question index to ARENA_ANSWER for correct scoring under latency

**What's pending (needs Zoom meeting):**
- Real RTMS integration (Tasks 18-19) — webhook handler + WebSocket transcript ingestion
- Auto-Bookmark on professor cues (Task 28) — uses detect-cues endpoint + host broadcast
- Smart Spotlight (Task 29) — needs `onActiveSpeakerChange` (host-only Zoom SDK event)
- Late Joiner catch-up (Task 14) — needs `onParticipantChange` (host-only)
- In-meeting testing of all features with real Zoom SDK messaging
