# Zoom Momentum - Developer Task Breakdown

This document breaks down the high-level features of Zoom Momentum into specific, actionable developer tasks. It provides context and explicit steps to help the team understand what needs to be built.

---

## Phase 0: Prerequisites & Approvals
*Goal: Unblock production deployment by getting necessary access and approvals early.*

- [x] **Task 1: Request RTMS Access (Live Transcripts)**
  - **Context:** Our "Live Anchor" feature needs to read the transcript as the professor speaks. That requires Zoom's RTMS stream.
  - **Findings (from Jen / Zoom DevRel):**
    - RTMS is the correct and only supported path today for **live, in-meeting transcripts**; there is no separate client-side transcript API.
    - 1-year RTMS trials are already enabled (through Feb 23, 2027) for `shitij`, `advikaa`, and `yash`.
  - **Action Items:**
    - [x] Confirm RTMS as the path for live transcripts (done via DevRel + RTMS docs, videos, and quickstarts).
    - [x] Enable RTMS trial for core dev accounts (done for Shitij, Advikaa, Yash).
    - [ ] Send remaining team members' Zoom account emails to Jen so she can enable RTMS trials for the whole team.
  - **Status:** RTMS enabled on the Zoom Marketplace app. Webhook URL configured at `https://agilely-gabelled-clementine.ngrok-free.dev/api/rtms/webhook`.
- [x] **Task 2: Clarify AI Companion API Status**
  - **Context:** We need to know if Zoom's native AI Companion allows custom, real-time prompt responses.
  - **Findings (from Jen / AI Companion docs):**
    - "Customizable AI Companion" currently exposes only **one** API endpoint with **no webhooks** and is not designed as a general-purpose, real-time LLM backend that we can orchestrate.
    - There is no AI Companion 3.0 API today that lets us run our own prompt loop, manage custom streaming UX, or deeply integrate Momentum’s state.
  - **Decision:**
    - We will **not** rely on AI Companion as the main engine for Momentum.
    - Core features (Live Anchor, Recovery Agent, quizzes, polls, etc.) will use a **custom LLM backend** (e.g. OpenRouter / AWS Bedrock Claude) that we control end-to-end.
- [ ] **Task 3: Confirm Next Lab AWS Access**
  - **Context:** The Next Lab might have AWS resources available. We need to check what is available before finalizing the stack.
  - **Action Items:**
    - [ ] Check if the Next Lab provides access to an AWS account.
    - [ ] Check if we have access to AWS Bedrock (specifically for Claude models).

---

## Week 1 Research Findings (Verified)
*These findings from initial SDK research inform all implementation decisions.*

- **No `waitingRoom` context:** Zoom Apps SDK does not support running apps in the waiting room. The Warm-Up Arena runs in-meeting (`inMeeting` context) at the start of class instead.
- **No `onTranscriptUpdate` event:** The client SDK cannot subscribe to live transcripts directly. RTMS is the only supported path for real-time transcript access.
- **AI Companion API not usable for custom prompts:** The "Customizable AI Companion" exposes only one endpoint with no webhooks—it's not a general-purpose LLM backend. We use an external LLM (OpenAI/Bedrock) for all AI features.
- **Shared state via messaging:** There is no dedicated "Shared State API." Synchronized state is built on `connect()` + `postMessage()` + `onMessage()`, with the host as the source of truth.
- **Host-only detection events:** `onParticipantChange`, `getMeetingParticipants`, and `onActiveSpeakerChange` are host-only for privacy reasons. All detection logic runs on the host and broadcasts results to students.

---

## Phase 1: Tech Stack Research & Decisions (Pre-Code)
*Goal: Decide on the foundational tools we will use.*

- [x] **Task 4: Evaluate Backend Language (Node.js vs. Python)**
  - **Context:** We need a server to process transcripts, call AI APIs, and handle Zoom OAuth.
  - **Decision:** We will use **JavaScript (Node.js)** for the backend.
  - **Action Items:**
    - [ ] Review Zoom's official Node.js server template to see what we get "for free."
    - [x] Backend language decided: Node.js.
- [x] **Task 5: Evaluate Database & ORM**
  - **Context:** We must store user data, generated quizzes, and private student bookmarks.
  - **Decision:** Prisma ORM with SQLite (dev) / PostgreSQL (prod). Schema implemented with User, Meeting, TranscriptSegment, Bookmark, QuizSet, RecoveryPack models.
  - **Action Items:**
    - [x] Compare SQLite (easiest for local dev) vs. PostgreSQL. → SQLite for dev, PostgreSQL for prod.
    - [x] Evaluate if we need an ORM like Prisma or SQLAlchemy, or if basic SQL queries are sufficient. → Prisma chosen.
    - [x] Draft a preliminary schema (Tables: Users, Meetings, Transcripts, Bookmarks, Quizzes). → Implemented in `server/prisma/schema.prisma`.
- [x] **Task 6: Evaluate Frontend Framework**
  - **Context:** The Zoom App UI runs inside Zoom's embedded web browser.
  - **Decision:** Vite + React 18 + TypeScript. Next.js rejected (adds WebSocket complexity with no SSR benefit inside Zoom's embedded browser).
  - **Action Items:**
    - [x] Test the vanilla React template provided by Zoom. → Used Vite + React instead.
    - [x] Evaluate if Next.js adds unnecessary complexity or required features (like SSR). → Next.js rejected.
    
---

## Phase 1.5: AWS Infrastructure Exploration
*Goal: If Next Lab provides AWS access, determine the easiest way to deploy our backend, database, and AI.*

- [ ] **Task 7: Explore AWS Hosting Options (Backend & Database)**
  - **Context:** We need to know the easiest way for our team to deploy code.
  - **Action Items:**
    - [ ] Evaluate server deployment: EC2 (virtual machine, simple) vs. App Runner/Elastic Beanstalk.
    - [ ] Evaluate database deployment: RDS (managed PostgreSQL) vs. DynamoDB. Let's pick the fastest path.
- [ ] **Task 8: Explore AWS Bedrock (LLMs)**
  - **Context:** Bedrock gives us access to Claude 3 without needing separate API keys.
  - **Action Items:**
    - [ ] Test generating a 3-bullet summary using Claude 3 on Bedrock.
    - [ ] Compare the output quality and speed against OpenAI (GPT-4o-mini).

---

## Phase 2: App Foundation (Hello World)
*Goal: Get a basic app loading in the Zoom client with working auth.*

- [x] **Task 9: Initialize the Frontend Repository**
  - **Context:** Create the actual UI shell.
  - **Action Items:**
    - [x] Bootstrap the project using the chosen framework (e.g., `npx create-react-app` or Vite). → Vite + React 18 + TypeScript in `client/`.
    - [x] Install the `@zoom/appssdk` package.
    - [x] Configure `zoomSdk.config()` with basic capabilities (`connect`). → `client/src/hooks/useZoomSdk.ts`.
    - [x] Display a "Hello World from Zoom" screen. → Role-based routing: HostDashboard + StudentView + AuthView.
- [x] **Task 10: Initialize the Backend Repository**
  - **Context:** Create the backend server to serve the frontend and handle logic.
  - **Action Items:**
    - [x] Setup the server (Node/Express) locally. → `server/src/server.ts` with Express + TypeScript.
    - [x] Deploy to EC2 with ngrok tunnel.
    - [x] Configure Zoom Marketplace App credentials (Client ID, Secret, Redirect URL). → Done, app configured on marketplace.zoom.us.
- [x] **Task 11: Implement Zoom OAuth (Login Flow)**
  - **Context:** The app needs to know who is opening it.
  - **Action Items:**
    - [x] Build the `/api/auth/login` and `/api/auth/callback` routes. → `server/src/routes/auth.ts` (PKCE flow).
    - [x] Exchange the OAuth code for an access token.
    - [x] Fetch the user's Zoom Profile to get their name and ID.
    - [x] Create a `Users` record in the database if they are new.

---

## Phase 3: The "Multiplayer" Engine (Shared State)
*Goal: Allow the Host app to send real-time UI updates to Student apps.*

- [x] **Task 12: Define the Messaging Protocol**
  - **Context:** We need a strict format for messages sent between Host and Students.
  - **Action Items:**
    - [x] Create a JSON schema for standard messages. → `client/src/types/messages.ts` with `AppMessage` interface + sequence numbers.
    - [x] Example: Decide exactly what a `{"type": "START_TRIVIA", "data": {...}}` packet looks like. → Full `MessageType` union defined.
- [x] **Task 13: Build the `useMessaging` React Hook**
  - **Context:** A reusable piece of code to make sending/receiving messages easy across the app.
  - **Action Items:**
    - [x] Wrap `zoomSdk.postMessage()` for sending. → `client/src/hooks/useMessaging.ts`.
    - [x] Wrap `zoomSdk.onMessage()` for receiving.
    - [x] Add error handling (e.g., what if the message fails to send?).
- [ ] **Task 14: Implement the "Late Joiner" Catch-Up Flow (Enhancement 1)**
  - **Context:** Students who join late automatically receive a full sync state and a personalized summary of what they missed.
  - **Action Items:**
    - [ ] Use `zoomSdk.onParticipantChange()` to detect new participants joining.
    - [ ] Student App Action: On load, send a `REQUEST_FULL_STATE` message to the Host.
    - [ ] Host App Action: Listen for `REQUEST_FULL_STATE` and reply with the entire current App State, including `topicHistory`.
    - [ ] Student App Action: Display a brief "Here's what you missed" notification based on the `topicHistory`.

---

## Phase 4: Mocking the Transcript
*Goal: Fake a live transcript so frontend devs can build the AI features without waiting for Zoom's RTMS approval.*

- [x] **Task 15: Build a Static Transcript JSON File**
  - **Action Items:**
    - [x] Find a 5-minute transcript of a real lecture (math, history, etc.). → Sample math lecture on derivatives embedded in `mock-transcript/src/index.ts`.
    - [x] Format it as an array of JSON objects. → Inline array of `{ speaker, text }` objects.
- [x] **Task 16: Build the "Mock RTMS Service"**
  - **Context:** A small script that pretends to be Zoom sending live text.
  - **Action Items:**
    - [x] Write a function that reads the transcript data. → `mock-transcript/src/index.ts`.
    - [x] Emit one line of text to the Backend every 3 seconds. → POSTs to `/api/transcript/segment` via HTTP.
- [x] **Task 17: Build the Rolling Buffer Logic (Backend)**
  - **Context:** We only want to send the *recent* context to the AI, not the entire hour-long meeting.
  - **Action Items:**
    - [x] Accept transcript chunks. → `POST /api/transcript/segment` in `server/src/routes/transcript.ts`.
    - [x] Maintain an array of the last ~300 words spoken. → `GET /api/transcript/buffer` returns trimmed buffer.

---

## Phase 5: Real RTMS Integration (The Production Transcript)
*Goal: Replace the mocked WebSocket feed from Phase 4 with the actual live transcript data from Zoom.*

- [ ] **Task 18: Build the RTMS Webhook Handler**
  - **Context:** When the Host starts RTMS, Zoom sends a webhook to our backend to say "The stream is ready."
  - **Action Items:**
    - [ ] Build a `/api/rtms/webhook` route to receive the `meeting.rtms_started` event.
    - [ ] Extract the WebSocket connection URLs and session keys from the webhook payload.
- [ ] **Task 19: Build the RTMS Ingestion Service**
  - **Context:** A background process on our backend that maintains a persistent WebSocket connection to Zoom's servers to receive live chunked audio/text data as the participants speak.
  - **Action Items:**
    - [ ] Integrate the `@zoom/rtms` JS SDK into our backend.
    - [ ] Use the session keys from the webhook to connect to the Zoom WebSocket server.
    - [ ] Process incoming transcript chunks and funnel them into the rolling buffer from Task 17 (replacing the mock data feed).

---

## Phase 6: AI Prompts & Real Features
*Goal: Connect the fake transcript to LLMs to build the actual product features.*

**Feature A: Live Anchor (The Pinned Timeline) & Running Glossary**
- [x] **Task 20: The AI Topic Endpoint (`/api/ai/topic-segment`)**
  - **Action Items:**
    - [x] Build a route that takes the 300-word buffer. → `server/src/routes/ai.ts`, subject-agnostic prompt.
    - [x] Write the prompt: "Did the topic change? Summarize previous topic in 3 bullets. Extract definitions or formulas." → Implemented with glossaryTerms extraction.
    - [x] Parse the AI response into strict JSON. → `extractJSON()` helper handles markdown-fenced responses.
- [x] **Task 21: The Host Broadcast Logic**
  - **Action Items:**
    - [x] Host App: Call the AI endpoint every 30 seconds. → `useLiveAnchor.ts` polling loop with `startPolling`/`stopPolling`.
    - [x] Host App: If the AI says the topic changed, use `postMessage` to broadcast `TOPIC_UPDATE` to all students. → Broadcasts `TOPIC_UPDATE` and `GLOSSARY_UPDATE`.
    - [ ] Pause detection via `zoomSdk.onActiveSpeakerChange()`. *(Host-only SDK event, to be integrated)*
- [x] **Task 22: The Student Timeline & Glossary UI (Enhancement 3)**
  - **Action Items:**
    - [x] Build a React component for a "Topic Card". → `TopicCard.tsx` with title, bullets, timestamp, bookmark.
    - [x] Listen for `GLOSSARY_UPDATE` messages broadcasted by the Host. → `useAnchorStudent` handles updates.
    - [x] Build a separate searchable "Glossary / Formula Sheet" tab. → `GlossaryTab.tsx` with search filter.

**Feature B: Warm-Up Arena (Pre-class Trivia)**
- [x] **Task 23: The AI Quiz Endpoint (`/api/ai/quiz-generate`)**
  - **Action Items:**
    - [x] Write a prompt that takes previous class transcripts and generates 5 multiple choice questions. → Implemented in `server/src/routes/ai.ts` with real AI + 5 fallback questions.
- [x] **Task 24: Trivia Game UI & Logic**
  - **Action Items:**
    - [x] Host UI: A "Start Game" button that fetches questions. → `ArenaHost.tsx` with topic input, generate, ready, question, leaderboard, finished phases.
    - [x] Student UI: A clean, large countdown timer. → `ArenaStudent.tsx` with 15s countdown, tap-to-answer, answer reveal.
    - [x] Logic: Host computes scores as students reply with `ARENA_ANSWER` messages, and broadcasts a Top 3 Leaderboard. → `useArena.ts` with 1000 base + speed bonus scoring, `Leaderboard.tsx` with medals.

**Feature C: Professor's Pulse (Check-in Polls)**
- [x] **Task 25: Poll Generation UI (Host)**
  - **Action Items:**
    - [x] Build a dashboard for the host to click "Generate Question", with an optional context input text box. → `PollCreator.tsx` with context input + generate button.
    - [x] Add an editable preview screen allowing the host to edit the question text and options before broadcasting. → `PollCreator.tsx` preview phase with editable fields.
- [x] **Task 26: Poll Display & Results UI (Student & Host)**
  - **Action Items:**
    - [x] Student UI: A modal overlay that appears when Host launches `POLL_START`. → `PollCard.tsx` overlay with option selection.
    - [x] Send `POLL_RESPONSE` answers back. → `usePulse.ts` student hook sends via messaging.
    - [x] Host UI: Aggregate scores and broadcast `POLL_RESULTS` bar chart to everyone. → `PollResults.tsx` bar chart + `usePulse.ts` host aggregation.

**Feature D: Recovery Agent (Post-Class) & Enhancements**
- [x] **Task 27: The Manual Bookmark Button**
  - **Action Items:**
    - [x] Add a `📌 I'm Confused` button to the Live Anchor UI saving the current timestamp to the DB. → `StudentView.tsx` + `useLiveAnchor.ts` `bookmarkCurrentTopic` POSTs to `/api/bookmarks`.
- [ ] **Task 28: Auto-Bookmark on Professor Cues (Enhancement 2)**
  - **Context:** Automatically bookmark moments when the professor indicates importance.
  - **Action Items:**
    - [x] Build `/api/ai/detect-cues` endpoint to scan transcript buffer for emphasis phrases (e.g., "This is critical"). → Implemented in `server/src/routes/ai.ts` with real AI.
    - [ ] When detected, trigger the Host app to secretly log bookmarks for all students. *(Needs Zoom SDK `sendMessage` in real meeting)*
- [ ] **Task 29: Smart Spotlight for Student Questions (Enhancement 4)**
  - **Context:** Emphasize students asking questions automatically. *(Needs Zoom SDK host-only events)*
  - **Action Items:**
    - [ ] Use `zoomSdk.onActiveSpeakerChange()` to detect when a Student unmutes and speaks.
    - [ ] Host App Action: Call `zoomSdk.addParticipantSpotlight(studentID)` automatically.
    - [ ] Host App Action: Automatically annotate the Live Anchor timeline with "Student Question at [Time]".
    - [ ] Host App Action: Auto-remove the spotlight when the Host resumes speaking using `zoomSdk.removeParticipantSpotlights()`.
- [x] **Task 30: The AI Recovery Endpoint**
  - **Action Items:**
    - [x] Prompt: "Explain this transcript segment simply and provide a practice problem." → Implemented in `server/src/routes/ai.ts` with subject-agnostic prompt.
    - [x] Endpoint runs this prompt for all bookmarks (manual + auto) after class. → `/api/ai/recovery-pack` accepts bookmarks array, generates per-item explanations.
- [x] **Task 31: Post-Class Summary Card UI (Enhancement 5)**
  - **Action Items:**
    - [ ] Detect `onRunningContextChange` transitioning from `inMeeting` to `inMainClient` (meeting ended). *(Needs Zoom SDK event)*
    - [x] Build a Summary Card UI summarizing key topics and links to the Glossary. → `PostClassSummary.tsx` with stats, topics, terms.
    - [x] Display the personalized Recovery Pack generated in Task 30 on this card. → `RecoveryPackCard.tsx` embedded in `PostClassSummary`.
