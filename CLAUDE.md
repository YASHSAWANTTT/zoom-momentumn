# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zoom Momentum is a Zoom Apps SDK in-meeting side panel app that transforms passive virtual classrooms into active learning environments. It's a monorepo with three npm workspaces: `client` (React + Vite), `server` (Express + Prisma), and `mock-transcript` (dev utility).

## Commands

```bash
npm run dev              # Run client (port 5173) + server (port 3001) concurrently
npm run dev:mock         # Same as above + mock-transcript service (fake lecture chunks)
npm run build            # Build both client and server
npm run db:migrate       # Run Prisma migrations (server workspace)
npm run db:studio        # Open Prisma Studio GUI

npm run dev -w client    # Client dev server only
npm run dev -w server    # Server dev server only (tsx watch mode)
npm run build -w server  # Compile server TypeScript to dist/
```

No test framework or linter is currently configured.

## Architecture

### Client (`client/src/`)
- **App.tsx** — Entry point with role-based routing (host vs student via Zoom SDK role detection)
- **Hooks** — Core logic lives in hooks:
  - `useZoomSdk` — SDK init, role detection
  - `useZoomAuth` — OAuth PKCE flow
  - `useMessaging` — `connect()`/`postMessage()`/`onMessage()` with sequence-numbered state sync
  - `usePulse` / `useArena` — Feature-specific state management
- **Views** — `HostDashboard` (Pulse/Arena/Anchor tabs), `StudentView` (Timeline/Glossary tabs), `AuthView`
- **Components** — `pulse/` (polls), `arena/` (trivia/leaderboard)
- **Types** — `messages.ts` defines the full message protocol and state types

### Server (`server/src/`)
- **server.ts** — Express app with CORS, sessions, route mounting
- **config.ts** — Env var validation (fails fast on missing vars)
- **Routes:**
  - `auth.ts` — OAuth PKCE (`/authorize`, `/callback`, `/me`)
  - `ai.ts` — AI endpoints (`/poll-generate`, `/quiz-generate`, `/topic-segment`, `/recovery-pack`, `/detect-cues`)
  - `transcript.ts` — Transcript storage (`POST /segment`, `GET /buffer`)
  - `bookmarks.ts` — Bookmark CRUD
- **Database** — Prisma ORM with PostgreSQL (e.g. Neon). Set `DATABASE_URL` in `server/.env` (used for migrations and runtime). Schema in `server/prisma/schema.prisma` with models: User, Meeting, TranscriptSegment, Bookmark, QuizSet, RecoveryPack

### Mock Transcript (`mock-transcript/`)
- Simulates Zoom RTMS by POSTing fake lecture chunks to `/api/transcript/segment` every 3 seconds

### Message Protocol
All host↔student communication uses Zoom SDK `sendMessage()`/`onMessage()` with a standardized envelope containing `type`, `payload`, `seq` (sequence number), `timestamp`, `senderId`, and `senderRole`.

## Key Config

- `client/vite.config.ts` — Proxies `/api/*` requests to `localhost:3001`
- `.env` — Requires `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `OPENAI_API_KEY` (see `.env.example`)
