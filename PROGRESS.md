# Zoom Momentum — Progress Tracker

## Phase 1: Infrastructure ✅

- [x] Switched AI from OpenAI to AWS Bedrock (Converse API, `meta.llama3-70b-instruct-v1:0`)
- [x] Installed `@aws-sdk/client-bedrock-runtime`, removed `openai` dependency
- [x] Updated `server/src/config.ts` — replaced `openai` config with `aws.region` + `zoom_secret_token`
- [x] Updated `.env` — removed `OPENAI_API_KEY`, added `AWS_REGION=us-east-1`
- [x] Ran Prisma migration — PostgreSQL schema (Neon-compatible); use `DATABASE_URL` + `DIRECT_URL` + `prisma migrate deploy`
- [x] Fixed duplicate `GET /callback` handler in `server/src/routes/auth.ts`
- [x] Build passes (`npm run build`)
- [x] All 5 AI endpoints verified with curl (poll-generate, topic-segment, quiz-generate, recovery-pack, detect-cues)

### Note on Bedrock Models
- Anthropic models on Bedrock require use case form submission for this AWS account
- Using `meta.llama3-70b-instruct-v1:0` via Converse API as fallback
- When Anthropic models become available, update `MODEL_ID` in `server/src/routes/ai.ts`

## Phase 2: Parallel Agent Work

### Teammate 1: RTMS — Server RTMS Integration
- [x] Webhook handler with HMAC signature verification (`server/src/routes/rtms.ts`)
  - `POST /api/rtms/webhook` — handles `endpoint.url_validation`, `meeting.rtms_started`, `meeting.rtms_stopped`
  - HMAC verification with `crypto.timingSafeEqual` + 5-min replay protection
- [x] RTMS ingest service using @zoom/rtms SDK (`server/src/services/rtms-ingest.ts`)
  - `startRTMSSession()` / `stopRTMSSession()` with duplicate-session prevention
  - `onTranscriptData` decodes buffer, stores segments via Prisma (resolves Meeting by zoomMeetingId)
  - `onParticipantEvent` for tracking joins/leaves with name resolution
  - `shutdownAllSessions()` for graceful process cleanup
  - `stopping` flag to suppress false leave events during teardown
- [x] Mounted in `server/src/server.ts` at `/api/rtms` with SIGTERM/SIGINT shutdown hooks
- [x] Installed `@zoom/rtms`, `ws`, `@types/ws` in server workspace
- [x] Build passes (`npm run build -w server`)

### Teammate 2: Events — Client Zoom SDK Events
- [x] Late joiner summary — `useZoomEvents.handleFullState()` detects FULL_STATE with existing topics, shows catch-up info with auto-dismiss
- [x] Smart speaker spotlight — Host broadcasts `SPEAKER_SPOTLIGHT` via `onActiveSpeakerChange`, students receive and store active speaker
- [x] Meeting end detection — `onRunningContextChange` sets `meetingEnded` state and fires callback
- [x] Auto-bookmark from cue detection — `useAnchorHost.pollTranscript` calls `/api/ai/detect-cues`, broadcasts `AUTO_BOOKMARK` on cue; students auto-create bookmark
- [x] New message types added: `LATE_JOIN_SUMMARY`, `SPEAKER_SPOTLIGHT`, `AUTO_BOOKMARK`
- [x] All new props wired to `StudentView` (meetingEnded, lateJoinInfo, activeSpeaker)
- [x] Build passes (`npm run build`)

### Teammate 3: Polish — Recovery Flow + DevPreview + E2E Testing
- [x] Test all AI endpoints — all 5 return valid JSON (poll-generate, quiz-generate, topic-segment, recovery-pack, detect-cues)
- [x] Wire meeting-end in StudentView
  - Added optional props: `meetingEnded`, `lateJoinInfo`, `onDismissLateJoin`, `activeSpeaker`
  - When `meetingEnded` is true, fetches recovery pack from `/api/ai/recovery-pack` and renders `PostClassSummary`
  - Late join info shown as dismissible banner with topic count and latest topic
  - Active speaker displayed in status bar
- [x] Enhance DevPreview for full E2E
  - Added simulation buttons: Sim Late Join, Sim Meeting End, Sim Auto-Bookmark, Sim Speaker
  - Sim Meeting End triggers recovery pack fetch and shows PostClassSummary in student view
  - Sim Late Join shows dismissible late-join banner in student view
  - Sim Auto-Bookmark shows auto-bookmark toast notification
  - Sim Speaker toggles active speaker indicator
  - Reset to Live button restores normal view from any end state
- [x] Full build passes (`npm run build`) — no TypeScript errors

## Phase 3: Integration ✅

- [x] Build passes with all changes (`npm run build` — client + server)
- [x] All 7 endpoints verified:
  - `POST /api/ai/poll-generate` — OK
  - `POST /api/ai/quiz-generate` — OK (3 questions)
  - `POST /api/ai/topic-segment` — OK (topic: Photosynthesis Overview)
  - `POST /api/ai/recovery-pack` — OK (1 item)
  - `POST /api/ai/detect-cues` — OK (hasCue: true)
  - `GET /api/health` — OK
  - `GET /api/rtms/health` — OK (0 sessions)
- [x] RTMS webhook security: rejects unsigned requests (401), accepts url_validation (200)
- [x] No cross-agent file conflicts

## Phase 4: UI/UX Improvements (Planned)
- [ ] Visual design polish
- [ ] Responsive layout improvements
- [ ] Animation and transitions
- [ ] Accessibility (a11y) audit
- [ ] Loading states and error UX
