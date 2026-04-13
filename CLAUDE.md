# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zoom Momentum is a Zoom Apps SDK in-meeting side panel app that transforms passive virtual classrooms into active learning environments. It's a monorepo with three npm workspaces: `client` (React + Vite), `server` (Express + Prisma), and `mock-transcript` (dev utility).

## Commands

```bash
npm run dev              # Run client (port 5173) + server (port 3001) concurrently
npm run dev:mock         # Same as above + mock-transcript service (CS50 lecture chunks)
npm run build            # Build both client and server
npm run db:migrate       # Run Prisma migrations (server workspace)
npm run db:studio        # Open Prisma Studio GUI

npm run dev -w client    # Client dev server only
npm run dev -w server    # Server dev server only (tsx watch mode)
npm run build -w server  # Compile server TypeScript to dist/
```

No test framework or linter is currently configured.

## Running in Zoom (Production Build)

The app must be served as a production build through Express for Zoom to work:
```bash
# 1. Build client
npm run build -w client

# 2. Start ngrok pointing to Express (port 3001, NOT 5173)
ngrok http 3001 --url=agilely-gabelled-clementine.ngrok-free.dev

# 3. Start server (serves both API + static client build)
npm run dev -w server

# 4. Optionally start mock transcript
npm run dev -w mock-transcript
```

## Architecture

### Client (`client/src/`)
- **App.tsx** — Entry point with role-based routing (host vs student via Zoom SDK role detection)
- **Hooks** — Core logic lives in hooks:
  - `useZoomSdk` — SDK init, role detection, meeting context (uses `getMeetingUUID()` for consistent ID across host/attendee), RTMS start/stop, participant count
  - `useZoomAuth` — OAuth PKCE flow
  - `useMessaging` — WebSocket relay client with auto-reconnect, sequence-numbered state sync
  - `usePulse` / `useArena` / `useLiveAnchor` — Feature-specific state management
  - `useZoomEvents` — Active speaker, meeting end, late joiner detection
  - `useDemoMode` — Auto-detects demo mode (outside Zoom), provides mock meetingId
- **Views** — `HostDashboard` (Pulse/Arena/Anchor tabs + TranscriptTab), `StudentView` (Timeline/Glossary/Transcript tabs), `WelcomeView`, `AuthView`
- **Components** — `pulse/` (polls), `arena/` (trivia/leaderboard), `anchor/` (timeline, glossary, transcript, bookmarks), `recovery/` (post-class summary), `shared/` (feature info)
- **DevPreview.tsx** — REMOVED. Replaced by demo mode in App.tsx
- **Demo Mode** — Auto-enabled when running outside Zoom. Role switcher + simulation buttons (late join, meeting end, speaker). Transcript source toggle (Live/Mock) available inside Zoom only.
- **Types** — `messages.ts` defines the full message protocol and state types

### Server (`server/src/`)
- **server.ts** — Express app with CORS, sessions, OWASP headers, route mounting, serves production client build
- **config.ts** — Env var validation (fails fast on missing vars)
- **Routes:**
  - `auth.ts` — OAuth PKCE (`/authorize`, `/callback`, `/me`)
  - `ai.ts` — AI endpoints (`/poll-generate`, `/quiz-generate`, `/topic-segment`, `/recovery-pack`, `/detect-cues`)
  - `transcript.ts` — Transcript storage with meeting-resolver (`POST /segment`, `GET /buffer`)
  - `bookmarks.ts` — Bookmark CRUD with meeting-resolver
  - `rtms.ts` — RTMS webhook receiver + stream client
- **Services:**
  - `meeting-resolver.ts` — Auto-creates Meeting records from Zoom UUIDs or mock IDs
  - `rtms-ingest.ts` — RTMS WebSocket client, transcript storage, session lifecycle
  - `websocket.ts` — WebSocket relay server for host↔student messaging (rooms by meetingId)
  - `ai-client.ts` — Tiered AI client with failover (CREATE AI gemini-pro → claude-3-opus → Bedrock)
- **Database** — Prisma ORM with SQLite (dev) / PostgreSQL (prod). Schema in `server/prisma/schema.prisma`

### Mock Transcript (`mock-transcript/`)
- Fetches real CS50 Lecture 0 SRT from Harvard CDN, parses into ~700 chunks, POSTs to `/api/transcript/segment` every 3 seconds
- Falls back to hardcoded chunks if CDN fetch fails

### Product Page (`product-page/`)
- Static landing page (`index.html`), no build step
- Serve locally: `cd product-page && python3 -m http.server 8080`

### Message Protocol
All host↔student communication uses WebSocket relay through Express (`/ws` endpoint). The server manages rooms by meetingId and relays messages between all connected clients. Message envelope contains `type`, `payload`, `seq` (sequence number), `timestamp`, `senderId`, and `senderRole`.

- Server: `server/src/services/websocket.ts` — room management, message relay, heartbeat
- Client: `client/src/hooks/useMessaging.ts` — WebSocket client with auto-reconnect
- Vite proxy: `client/vite.config.ts` proxies `/ws` to `ws://localhost:3001`

## Key Config

- `client/vite.config.ts` — Proxies `/api/*` requests to `localhost:3001` (dev mode only)
- `client/index.html` — Must include `<script src="https://appssdk.zoom.us/sdk.js"></script>` before app bundle
- `.env` — Requires `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URL`, `ZOOM_SECRET_TOKEN`, `SESSION_SECRET`, `DATABASE_URL`, `AWS_REGION`, `PORT`, `CLIENT_URL` (see `.env.example`)

## AI Backend

- **Primary:** ASU CREATE AI platform (`https://api-main.aiml.asu.edu/query`)
  - Model 1: `gemini-pro` (primary — 100% quality, ~2.1s avg latency)
  - Model 2: `claude-3-opus` (backup — 100% quality, ~2.2s avg latency)
- **Fallback:** AWS Bedrock, region `us-east-1`
  - Model: `meta.llama3-70b-instruct-v1:0` (Llama 3 70B via Converse API)
  - IAM role: `zoom-momentum-ec2-role`
- Failover chain: gemini-pro → claude-3-opus → Bedrock (automatic, per-request)
- Tiered logic lives in `server/src/ai-client.ts`
- CREATE AI config is optional — if env vars are missing, falls back to Bedrock
- Env vars: `CREATE_AI_API_URL`, `CREATE_AI_TOKEN`, `CREATE_AI_PRIMARY_MODEL`, `CREATE_AI_BACKUP_MODEL`
- Benchmark scripts in `poc/` (benchmark.mjs, benchmark-quality.mjs)
- Migration plan: `poc/AI_MIGRATION_PLAN.md`

## Zoom SDK Integration (CRITICAL)

- **Do NOT use `import zoomSdk from '@zoom/appssdk'`** — the npm package creates a separate SDK instance that lacks the native bridge in ZoomWebKit. This causes `config()` to timeout.
- **Use `(window as any).zoomSdk`** — the CDN script tag (`sdk.js`) in `index.html` creates the global `window.zoomSdk` which has the native bridge connected to the Zoom client.
- All four hooks (`useZoomSdk`, `useMessaging`, `useZoomAuth`, `useZoomEvents`) use `window.zoomSdk` with a guard for when running outside Zoom (demo mode).
- `useMessaging` uses WebSocket relay (not SDK messaging) — works both inside and outside Zoom.
- Server must serve production build via Express (port 3001) with ngrok tunneling to 3001 — Vite dev server does NOT work inside Zoom.
- OWASP headers (Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Content-Security-Policy) are REQUIRED — Zoom blocks rendering without all four.

## Known Issues (Priority Order)

### Resolved
- ~~**P0: Host↔Student Messaging**~~ — FIXED. Replaced Zoom SDK `postMessage`/`onMessage` with WebSocket relay through Express.
- ~~**RTMS secret fallback**~~ — FIXED. Proper empty-string check before falling back to clientSecret.
- ~~**"Analyze Now" button**~~ — FIXED. Removed from Anchor tab.

### Open Bugs
1. **Multiple PrismaClient instances** — transcript.ts, bookmarks.ts, auth.ts, rtms-ingest.ts, meeting-resolver.ts each create their own. Should be singleton.
2. **AI topic-segment silent failure** — Returns fake success on AI error instead of surfacing the failure.
3. **AI topic dedup** — Similar titles sometimes create duplicate topics across polling cycles.
4. **BigInt serialization** — transcript.ts returns segments without converting BigInt to string.
5. **Participant count** — Hardcoded "Participants: --" in HostDashboard, never wired to `getMeetingParticipants()`.
6. **Sign-in button** — Does nothing on participant side in Zoom context (OAuth flow needs work).

## Git Config
- user.name: `shitijkarsolia`
- user.email: `shitijkarsolia@gmail.com`
- Do NOT add `Co-Authored-By` lines to commits
