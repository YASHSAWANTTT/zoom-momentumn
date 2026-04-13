# Zoom Momentum - Feature Specification & Architecture

**Project:** Zoom Momentum  
**Platform:** Zoom Apps SDK + RTMS + External LLM  
**Last Updated:** April 6, 2026

---

## Overview

Zoom Momentum transforms passive virtual classrooms into active learning environments through four core features and several zero-friction enhancements. All features run as a **Zoom App** (in-meeting app) that integrates seamlessly into Zoom's side panel.

**Key Design Principles:**
- **Proactive & Shared** (not reactive & private like Zoom AI Companion)
- **Host-as-Source-of-Truth** for synchronized state
- **Zero friction** for students, minimal effort for professors
- **Privacy-first** (bookmarks and recovery packs are private to each student)

---

## Core Features

### Feature A: Warm-Up Arena (Pre-Lecture Trivia)

**What it is:** A synchronized multiplayer trivia game that runs at the start of class in the side panel. Students compete in real-time, answering AI-generated recall questions from previous lectures.

**User Flow:**
1. Host clicks "Start Trivia" at the beginning of class
2. Host app generates 5 questions from last lecture's transcript (pre-generated via AI)
3. Questions appear simultaneously for all students with countdown timer
4. Students answer → scores calculated → leaderboard updates in real-time
5. After 5 questions, top 3 displayed → transition to Live Anchor

**APIs & Implementation:**

**Zoom Apps SDK:**
- `zoomSdk.config({ capabilities: ['connect', 'postMessage', 'onConnect', 'onMessage', 'getUserContext', 'getMeetingParticipants'] })`
- `zoomSdk.connect()` - Establish messaging channel
- `zoomSdk.postMessage({ type: 'ARENA_START', payload: {...} })` - Broadcast game state
- `zoomSdk.onMessage()` - Receive answers from students
- `zoomSdk.getUserContext()` - Get participant name for leaderboard
- `zoomSdk.getMeetingParticipants()` - Get participant count

**Backend APIs:**
- `POST /api/ai/quiz-generate` - Generate quiz questions from transcript
  - Input: `{ transcript: string, questionCount: number, difficulty: string }`
  - Output: `{ questions: [{ question, options, correctIndex, explanation }] }`

**Message Protocol:**
```typescript
// Host broadcasts question
{ type: 'ARENA_QUESTION', payload: { questionNumber: 1, question: {...}, startTime: timestamp } }

// Student submits answer
{ type: 'ARENA_ANSWER', payload: { questionNumber: 1, answerIndex: 2, timestamp: number } }

// Host broadcasts leaderboard
{ type: 'ARENA_LEADERBOARD', payload: { leaderboard: [{ name, score, rank }] } }

// Game complete
{ type: 'ARENA_END', payload: { finalLeaderboard: [...], topThree: [...] } }
```

**State Management:**
- Host maintains game state (current question, answers, scores, leaderboard)
- Host broadcasts state updates via `postMessage`
- Students render UI from received messages
- Late joiners request `FULL_STATE` to sync to current question

---

### Feature B: Live Anchor (Shared Dynamic Summary)

**What it is:** A pinned, auto-updating timeline in the side panel showing the current topic and key takeaways. As the professor moves to new topics, old summaries collapse into history and new topic cards appear.

**User Flow:**
1. Host starts meeting → RTMS begins streaming transcript
2. Every 2-3 minutes (or on pause detection), host app sends transcript buffer to AI
3. AI detects topic changes and extracts key bullets
4. Host broadcasts topic updates to all students via `postMessage`
5. Students see synchronized timeline with current topic highlighted
6. Students can bookmark individual bullets (saved to localStorage)

**APIs & Implementation:**

**Zoom Apps SDK:**
- `zoomSdk.startRTMS()` - Host triggers RTMS stream (direct method)
- `zoomSdk.onRTMSStatusChange()` - Monitor RTMS connection status
- `zoomSdk.postMessage({ type: 'TOPIC_UPDATE', payload: {...} })` - Broadcast topic cards
- `zoomSdk.onMessage()` - Students receive topic updates
- `zoomSdk.onActiveSpeakerChange()` - Detect pauses (no speaker for 10+ sec)

**RTMS Pipeline:**
1. Host app calls `zoomSdk.startRTMS()` → Zoom sends `meeting.rtms_started` webhook
2. RTMS service connects to Zoom WebSocket → receives live transcript chunks
3. RTMS service → Backend: `POST /api/transcript/segment`
4. Backend stores segments, maintains rolling 300-word buffer
5. Backend → Host app: WebSocket push transcript buffer
6. Host app → Backend: `POST /api/ai/topic-segment` with buffer
7. Backend → OpenAI: Topic segmentation prompt
8. Host broadcasts results via `postMessage`

**Backend APIs:**
- `POST /api/transcript/segment` - Store transcript chunk from RTMS
  - Input: `{ meetingId, speaker, text, timestamp, seqNo }`
- `POST /api/ai/topic-segment` - Analyze transcript for topic changes
  - Input: `{ transcriptBuffer: string, previousTopic: string }`
  - Output: `{ topicChanged: boolean, previousSummary: {...}, currentTopic: string, bullets: [...] }`
- `GET /api/transcript/buffer?meetingId=xxx` - Get rolling buffer (WebSocket push)

**Message Protocol:**
```typescript
// Topic changed - archive old, start new
{ type: 'TOPIC_UPDATE', payload: { 
  topics: [{ id, title, bullets, startTime }],
  currentTopicId: string 
}}

// Same topic - add bullets
{ type: 'BULLET_UPDATE', payload: { 
  topicId: string, 
  newBullets: string[] 
}}

// Glossary entry added
{ type: 'GLOSSARY_UPDATE', payload: { 
  term: string, 
  definition: string, 
  formula?: string 
}}
```

**AI Prompt (Topic Segmentation):**
```
You are monitoring a live lecture. The current topic is [X]. 
Based on the new transcript, determine if the professor has moved to a 
fundamentally new concept (not just an example or tangent). 
If yes, summarize the previous topic in exactly 3 bullet points and name the new topic. 
If no, extract any new key definitions, formulas, or examples mentioned.
```

---

### Feature C: Professor's Pulse (Manual Check-In Polls)

**What it is:** A simple tool that allows professors to launch AI-generated check-in polls at any time during the lecture. The professor clicks a button, and an AI-generated poll question appears in all student side panels based on the current topic being discussed.

**User Flow:**
1. **During lecture:** Professor wants to check student understanding
2. Professor clicks "Generate Check-In" button in the host dashboard
3. **Optional:** Professor can add one line of context (e.g., "Focus on the matrix multiplication step")
4. Host app sends current topic + transcript context + optional context to AI
5. AI generates an appropriate poll question (e.g., "How clear was the explanation of [current topic]?")
6. **Preview & Edit:** Professor sees the generated poll question and options
   - Can edit the question text
   - Can edit/add/remove options
   - Can regenerate if needed
7. Professor clicks "Launch Poll" to send to students
8. Poll appears in all student side panels via `postMessage`
9. Students answer → results aggregated → displayed to all
10. Professor sees results and can adjust teaching accordingly

**APIs & Implementation:**

**Zoom Apps SDK:**
- `zoomSdk.postMessage({ type: 'POLL_START', payload: {...} })` - Broadcast poll to all students
- `zoomSdk.onMessage()` - Receive poll responses from students
- `zoomSdk.getMeetingParticipants()` - Get participant count for response tracking

**Implementation Details:**
- **Preview State:** Host app maintains `draftPoll` state (question + options) before launching
- **Edit Functionality:** Professor can modify question text and options in the preview UI
  - Question text is editable in a text input field
  - Options are editable (add/remove/edit individual options)
- **Regenerate:** Clicking "Regenerate" calls the AI API again with same context (optional context + current topic)
- **Launch:** Only when professor clicks "Launch Poll" does it:
  1. Move `draftPoll` to `activePoll`
  2. Broadcast via `postMessage` to all students
  3. Clear `draftPoll` state

**Backend APIs:**
- `POST /api/ai/poll-generate` - Generate check-in poll question
  - Input: `{ currentTopic: string, transcriptContext: string, optionalContext?: string }`
  - Output: `{ question: string, options: string[] }`

**Message Protocol:**
```typescript
// Host launches poll
{ type: 'POLL_START', payload: { 
  pollId: string, 
  question: string, 
  options: string[] 
}}

// Student submits answer
{ type: 'POLL_RESPONSE', payload: { 
  pollId: string, 
  answerIndex: number 
}}

// Host broadcasts results
{ type: 'POLL_RESULTS', payload: { 
  pollId: string, 
  results: { [optionIndex]: count },
  totalResponses: number
}}
```

**Host Dashboard UI:**

**Step 1: Generate Poll**
```
┌─────────────────────────────────────┐
│  Professor's Pulse                   │
│                                     │
│  Generate a check-in poll to gauge │
│  student understanding.            │
│                                     │
│  Optional context:                  │
│  [________________________]        │
│                                     │
│  [Generate Poll]                    │
└─────────────────────────────────────┘
```

**Step 2: Preview & Edit**
```
┌─────────────────────────────────────┐
│  Preview Poll                        │
│                                     │
│  Question:                          │
│  [How clear was the explanation of  │
│   matrix multiplication?        ]   │
│                                     │
│  Options:                           │
│  ○ A) Crystal clear                 │
│  ○ B) Mostly got it                │
│  ○ C) Lost me                      │
│  ○ D) Need a recap                 │
│                                     │
│  [Edit] [Regenerate] [Launch Poll] │
└─────────────────────────────────────┘
```

**Why Manual Polls with Preview:**
- **Simple:** No complex monitoring or threshold calculations
- **Flexible:** Professor decides when to check in and can provide context
- **Reliable:** Works consistently without depending on engagement signals
- **Controlled:** Professor reviews and edits AI-generated polls before launching
- **Context-aware:** Optional context field helps AI generate more relevant questions

---

### Feature D: Recovery Agent (Post-Class Bookmarks)

**What it is:** A post-class system that turns in-lecture "Bookmark" moments into personalized remediation plans delivered immediately after class ends.

**User Flow:**
1. **During class:** Student hits 📌 Bookmark button when confused
2. App records timestamp + current topic from Live Anchor state
3. **Meeting ends:** Recovery Agent activates automatically
4. App collects all bookmarks, retrieves transcript segments
5. Sends to AI → generates recovery pack (explanations + practice problems)
6. Recovery pack displayed in app (accessible in `inMainClient` context)

**APIs & Implementation:**

**Zoom Apps SDK:**
- `zoomSdk.onMeeting()` - Detect meeting end
- `zoomSdk.onRunningContextChange()` - Detect transition from `inMeeting` → `inMainClient`
- `zoomSdk.postMessage()` - Bookmark button (optional: broadcast to host for analytics, but host never sees which student bookmarked)

**Backend APIs:**
- `POST /api/bookmarks` - Store bookmark
  - Input: `{ userId, meetingId, timestamp, topic, transcriptSnippet }`
- `POST /api/ai/recovery-pack` - Generate recovery pack from bookmarks
  - Input: `{ bookmarks: [{ timestamp, topic, transcriptSegment }] }`
  - Output: `{ items: [{ topic, explanation, practiceProblem, resourceHint }] }`
- `GET /api/bookmarks?meetingId=xxx&userId=xxx` - Retrieve bookmarks for meeting
- `GET /api/recovery-packs?meetingId=xxx&userId=xxx` - Retrieve recovery pack

**Privacy:**
- Bookmarks stored in database tied to user's Zoom OAuth ID
- Recovery packs generated and stored per-user
- Professor has zero visibility into who bookmarked what
- All data scoped by `userId` + `meetingId`

**AI Prompt (Recovery Pack):**
```
A student was confused during these moments in today's lecture. 
For each moment, provide:
1. A clear 2-3 sentence explanation of the concept
2. One practice problem to test understanding
3. A suggested study approach
Keep it encouraging and concise.
```

---

## Zero-Friction Enhancements

### Enhancement 1: Late Joiner Auto-Catch-Up

**What it is:** When a student joins late, they automatically receive a personalized summary of what they missed.

**Implementation:**
- `zoomSdk.onParticipantChange()` detects new participant
- Student app requests `FULL_STATE` via `postMessage`
- Host broadcasts `FULL_STATE` with `topicHistory` (all topics covered so far)
- Student app shows notification: "You joined late. Here's what you missed: [summary]"

**APIs:**
- `zoomSdk.onParticipantChange()` - Detect late joiners
- `postMessage({ type: 'REQUEST_STATE' })` - Student requests state
- `postMessage({ type: 'FULL_STATE', payload: { topicHistory, currentTopic, ... } })` - Host broadcasts

---

### Enhancement 2: Auto-Bookmark on Professor Cues

**What it is:** AI detects when professor says "This is important" or "Make sure you understand this" → automatically creates bookmarks for all students.

**Implementation:**
- Host app monitors transcript buffer for professor cues
- AI detects importance signals → creates auto-bookmarks
- Auto-bookmarks included in recovery pack generation

**Backend APIs:**
- `POST /api/ai/detect-cues` - Detect importance signals in transcript
  - Input: `{ transcriptBuffer: string }`
  - Output: `{ hasCue: boolean, timestamp: number, reason: string }`

---

### Enhancement 3: Running Glossary / Formula Sheet

**What it is:** Accumulates key terms, definitions, and formulas mentioned during lecture in a separate tab.

**Implementation:**
- Part of Live Anchor AI analysis
- When AI extracts definitions/formulas → broadcast `GLOSSARY_UPDATE`
- Students see glossary tab with searchable terms

**Message Protocol:**
```typescript
{ type: 'GLOSSARY_UPDATE', payload: { 
  term: string, 
  definition: string, 
  formula?: string, 
  timestamp: number 
}}
```

---

### Enhancement 4: Smart Spotlight for Student Questions

**What it is:** When a student unmutes to ask a question, automatically spotlight them and mark the timestamp in Live Anchor.

**Implementation:**
- `zoomSdk.onActiveSpeakerChange()` detects student speaking
- Host app calls `zoomSdk.addParticipantSpotlight(participantUUID)`
- Mark timestamp in Live Anchor: "Student question at [time]"
- Auto-remove spotlight when host resumes speaking

**APIs:**
- `zoomSdk.onActiveSpeakerChange()` - Detect speaker changes
- `zoomSdk.addParticipantSpotlight(participantUUID)` - Spotlight student (direct method)
- `zoomSdk.removeParticipantSpotlights()` - Remove all spotlights (plural method)

---

### Enhancement 5: Post-Class Summary Card

**What it is:** After meeting ends, students see a summary card with key topics covered, glossary entries, and link to recovery pack.

**Implementation:**
- Triggered on `onRunningContextChange` → `inMainClient`
- Display summary card with topics, glossary, recovery pack link
- Accessible in main Zoom client (not just side panel)

---

## Architecture Diagram

```mermaid
graph TB
    subgraph ZoomClient[Zoom Desktop Client]
        subgraph SidePanel[Side Panel - Embedded Browser]
            ReactApp[React App<br/>- Host View<br/>- Student View]
        end
    end

    subgraph Backend[Express Backend - EC2/Cloud]
        AuthRoutes[OAuth Routes<br/>/api/auth/*]
        AIService[AI Service<br/>/api/ai/*]
        WSServer[WebSocket Server<br/>Live transcript push]
        TranscriptStore[Transcript Store<br/>/api/transcript/*]
        BookmarkAPI[Bookmark API<br/>/api/bookmarks]
    end

    subgraph RTMSService[RTMS Service - Separate Process]
        RTMSClient[RTMS Client<br/>WebSocket to Zoom]
        WebhookHandler[Webhook Handler<br/>/api/rtms/webhook]
    end

    subgraph External[External Services]
        ZoomAPI[Zoom REST API<br/>OAuth, Meeting Info]
        OpenAI[OpenAI API<br/>GPT-4o-mini]
        ZoomRTMS[Zoom RTMS Servers<br/>WebSocket transcript stream]
    end

    subgraph Database[(Database - SQLite/PostgreSQL)]
        Transcripts[Transcript Segments]
        Bookmarks[Bookmarks]
        RecoveryPacks[Recovery Packs]
        Users[Users]
    end

    ReactApp -->|"zoomSdk.config()<br/>zoomSdk.connect()<br/>zoomSdk.postMessage()<br/>zoomSdk.onMessage()"| ZoomClient
    ReactApp -->|"HTTPS REST<br/>POST /api/ai/*<br/>GET /api/bookmarks"| Backend
    ReactApp -->|"WebSocket<br/>Live transcript buffer"| WSServer
    ReactApp -->|"zoomSdk.startRTMS()"| ZoomRTMS

    ZoomRTMS -->|"Webhook: meeting.rtms_started"| WebhookHandler
    WebhookHandler -->|"WebSocket connect"| ZoomRTMS
    ZoomRTMS -->|"Live transcript chunks"| RTMSClient
    RTMSClient -->|"HTTP POST /api/transcript/segment"| TranscriptStore
    TranscriptStore -->|"Store segments"| Database
    TranscriptStore -->|"Push buffer via WebSocket"| WSServer

    AIService -->|"Prompt + transcript"| OpenAI
    AuthRoutes -->|"OAuth PKCE flow"| ZoomAPI
    BookmarkAPI -->|"CRUD operations"| Database
    AIService -->|"Store recovery packs"| Database

    style ReactApp fill:#e1f5ff
    style Backend fill:#fff4e1
    style RTMSService fill:#ffe1f5
    style Database fill:#e1ffe1
```

---

## Data Flow Summary

### Shared State (Collaborate Mode)
- **Host app** maintains canonical state
- **Host broadcasts** state updates via `postMessage`
- **Students receive** updates via `onMessage`
- **Late joiners** request `FULL_STATE` to sync

### Transcript Pipeline
1. Host starts RTMS → Zoom webhook → RTMS service connects
2. RTMS receives chunks → Backend stores → Maintains 300-word buffer
3. Backend pushes buffer to host via WebSocket
4. Host sends buffer to AI → Host broadcasts results

### Poll Pipeline (Professor's Pulse)
1. Professor clicks "Launch Check-In" button
2. Host app sends current topic + transcript context to backend
3. Backend AI generates poll question
4. Host broadcasts poll via `postMessage` to all students
5. Students answer → host aggregates → broadcasts results

### AI Integration
- All AI calls go through backend (`/api/ai/*`)
- Backend calls OpenAI (GPT-4o-mini)
- Responses validated and formatted as JSON
- Fallback strategies for timeouts/errors

### Privacy & Storage
- **Bookmarks:** Stored in database, scoped by `userId` + `meetingId`
- **Recovery packs:** Generated per-user, stored in database
- **Saved bullets:** Stored in localStorage (client-side only)
- **Poll responses:** Aggregated counts only (not tied to individual students)
- **Professor visibility:** Zero (bookmarks are private, reactions are anonymous aggregates)

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Zoom Apps SDK (`@zoom/appssdk`) | UI in Zoom's embedded browser |
| **Backend** | Node.js + Express | OAuth, AI proxy, WebSocket server, REST API |
| **RTMS Service** | `@zoom/rtms` SDK (separate Node.js process) | Real-time transcript ingestion |
| **Database** | SQLite (dev) / PostgreSQL (prod) via Prisma | Transcripts, bookmarks, recovery packs |
| **AI** | AWS Bedrock (Llama 3 70B via Converse API) | Topic segmentation, quiz gen, recovery packs |
| **Tunnel / URL** | ngrok (static domain) or EC2 | Expose server for webhooks/OAuth |

---

## Zoom App Marketplace Configuration

**OAuth Scopes:**
- `zoomapp:inmeeting` (required)
- `meeting:read:meeting`
- `user:read`

**SDK Capabilities:**
- `connect`, `postMessage`, `onConnect`, `onMessage`, `endSyncData`
- `getMeetingContext`, `getMeetingUUID`, `getMeetingParticipants`
- `getUserContext`, `getRunningContext`, `onRunningContextChange`
- `onActiveSpeakerChange`, `onShareScreen`, `onMeeting`
- `postMessage`, `onMessage` ⭐ **Key for Professor's Pulse polls**
- `showNotification`, `sendMessageToChat`
- `authorize`, `onAuthorized`, `promptAuthorize`
- `startRTMS`, `stopRTMS`, `getRTMSStatus`, `onRTMSStatusChange` (direct methods)
- `addParticipantSpotlight`, `removeParticipantSpotlight`

**RTMS:**
- Enable Transcripts under RTMS features (requires RTMS access approval)
- Event subscriptions: `meeting.rtms_started`, `meeting.rtms_stopped`
- Webhook URL: `https://your-domain.com/api/rtms/webhook`

**Surfaces:**
- Home URL: `https://your-domain.com`
- Domain allow list: your domain + `appssdk.zoom.us`

---

## Critical Dependencies

1. **RTMS Access** - Required for live transcript features (Live Anchor, Recovery Agent, Auto-Bookmarks)
2. **Zoom OAuth** - Required for user identification and data scoping
3. **AWS Bedrock Access** - Required for all AI features (IAM role on EC2)
4. **Zoom SDK Messaging** - `connect` + `sendMessage` for all host↔student communication

---

## Architectural Decisions (Feb 2026)

### Decision 1: Use `connect` + `sendMessage` — Skip Collaborate Mode
Use only `connect()` + `sendMessage()`. Simpler, well-documented, sufficient for host-broadcasts-state pattern. Students must manually open the app from the Apps panel.

### Decision 2: All Detection Events Are Host-Only
`onParticipantChange`, `getMeetingParticipants`, and `onActiveSpeakerChange` are host-only. All detection logic runs on the host and results are broadcast to students.

### Decision 3: Sequence-Numbered Messages
Every message carries a monotonically increasing `seq` number to handle delivery order. Prevents answer-before-question race conditions in Arena.

### Decision 4: Build Non-RTMS Features First
Build order: Pulse → Arena → Live Anchor (mock transcript) → Recovery → Wire up real RTMS. This avoids needing a live Zoom meeting for every dev iteration.

### Decision 5: `sendMessage` Payload Budget
Payload limit is <512KB per message. A `FULL_STATE` with 20 topics, 100 glossary entries, and leaderboard fits under 50KB. No chunking needed.

---

## Build Order

```
1. App Skeleton + OAuth
2. Messaging Layer (connect/sendMessage/seq)
3. Professor's Pulse (no RTMS needed)
4. Warm-Up Arena (no RTMS needed)
5. Mock Transcript Pipeline
6. Live Anchor + Glossary (requires transcript)
7. Auto-Bookmarks (requires transcript)
8. Recovery Agent (requires bookmarks + transcript)
9. Smart Spotlight (requires active speaker events)
10. Late Joiner Catch-Up (requires participant events)
11. Post-Class Summary (requires meeting end detection)
```

Steps 1-7 are complete. Steps 8-11 are code-complete but untested in a live meeting.

---

## Authentication Flow

1. Frontend calls `GET /api/auth/authorize` → gets `codeChallenge` + `state`
2. Frontend registers `zoomSdk.onAuthorized()` listener BEFORE calling `zoomSdk.authorize()`
3. Zoom shows native OAuth consent UI
4. `onAuthorized` fires with `{ code }` → frontend sends to `POST /api/auth/callback`
5. Backend exchanges code for tokens, creates/updates user, returns session cookie
6. Frontend stores auth state, renders host or student view based on role

---

*This document serves as the definitive specification for Zoom Momentum's features, APIs, and architecture.*
