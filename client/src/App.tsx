import { useCallback, useRef, useEffect, useState } from 'react';
import zoomSdk from '@zoom/appssdk';
import { useZoomSdk } from './hooks/useZoomSdk';
import { useZoomAuth } from './hooks/useZoomAuth';
import { useMessaging } from './hooks/useMessaging';
import { usePulseHost, usePulseStudent } from './hooks/usePulse';
import { useArenaHost, useArenaStudent } from './hooks/useArena';
import { useAnchorHost, useAnchorStudent } from './hooks/useLiveAnchor';
import { useZoomEvents } from './hooks/useZoomEvents';
import { WelcomeView } from './views/WelcomeView';
import { HostDashboard } from './views/HostDashboard';
import { StudentView } from './views/StudentView';
import type { AppMessage, Poll, LeaderboardEntry, Topic, GlossaryEntry, AppState } from './types/messages';

const ARENA_TIME_LIMIT_SEC = 15;

export default function App() {
  const zoom = useZoomSdk();
  const auth = useZoomAuth();
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [studentActiveSpeaker, setStudentActiveSpeaker] = useState<string | null>(null);

  const messageRouterRef = useRef<(msg: AppMessage) => void>(() => {});

  const handleMessage = useCallback((message: AppMessage) => {
    messageRouterRef.current(message);
  }, []);

  const messaging = useMessaging({
    isHost: zoom.isHost,
    participantId: zoom.participantId,
    onMessage: handleMessage,
  });

  const pulseHost = usePulseHost({ broadcast: messaging.broadcast });
  const pulseStudent = usePulseStudent({ send: messaging.send });
  const arenaHost = useArenaHost({ broadcast: messaging.broadcast });
  const arenaStudent = useArenaStudent({ send: messaging.send, participantName: zoom.userName });
  const anchorHost = useAnchorHost({ broadcast: messaging.broadcast, meetingId: zoom.meetingId });

  const handleAnchorStartPolling = useCallback(async () => {
    try {
      await zoomSdk.startRTMS();
    } catch (e) {
      console.error('[App] startRTMS failed:', e);
    }
    anchorHost.startPolling();
  }, [anchorHost.startPolling]);

  const handleAnchorStopPolling = useCallback(async () => {
    anchorHost.stopPolling();
    try {
      await zoomSdk.stopRTMS();
    } catch (e) {
      console.error('[App] stopRTMS failed:', e);
    }
  }, [anchorHost.stopPolling]);
  const anchorStudent = useAnchorStudent({ send: messaging.send });

  const handleMeetingEnd = useCallback(() => {
    console.log('[App] Meeting ended');
  }, []);

  const zoomEvents = useZoomEvents({
    isHost: zoom.isHost,
    broadcast: messaging.broadcast,
    onMeetingEnd: handleMeetingEnd,
  });

  useEffect(() => {
    messageRouterRef.current = (message: AppMessage) => {
      if (zoom.isHost) {
        if (message.type === 'POLL_RESPONSE') {
          const payload = message.payload as { pollId: string; optionIndex: number };
          pulseHost.handleResponse(message.senderId, payload.pollId, payload.optionIndex);
        } else if (message.type === 'ARENA_ANSWER') {
          const payload = message.payload as { optionIndex: number; questionIndex: number; name: string };
          arenaHost.handleAnswer(message.senderId, payload.name, payload.optionIndex, payload.questionIndex);
        }
      } else {
        if (message.type === 'FULL_STATE') {
          const payload = message.payload as AppState | null;
          zoomEvents.handleFullState(payload);

          if (!payload) return;

          const fullStatePoll = payload.pulse?.activePoll;
          if (fullStatePoll) {
            if (fullStatePoll.results || typeof fullStatePoll.totalResponses === 'number') {
              pulseStudent.handlePollResults(fullStatePoll as Poll);
            } else {
              pulseStudent.handlePollStart(fullStatePoll as Poll);
            }
          }

          const arenaQuestions = payload.arena?.questions ?? [];
          const arenaIndex = payload.arena?.currentQuestion ?? 0;
          const arenaQuestion = arenaQuestions[arenaIndex];
          if (arenaQuestion) {
            arenaStudent.handleArenaStart();
            arenaStudent.handleQuestion({
              index: arenaIndex,
              total: arenaQuestions.length,
              question: arenaQuestion.question,
              options: arenaQuestion.options,
              timeLimitSec: ARENA_TIME_LIMIT_SEC,
            });
          } else if (payload.arena?.leaderboard?.length) {
            arenaStudent.handleArenaEnd({ leaderboard: payload.arena.leaderboard });
          }

          if (Array.isArray(payload.liveAnchor?.topics)) {
            for (const topic of payload.liveAnchor.topics) {
              anchorStudent.handleTopicUpdate({ topic, topicChanged: true });
            }
          }
          if (Array.isArray(payload.liveAnchor?.glossary) && payload.liveAnchor.glossary.length > 0) {
            anchorStudent.handleGlossaryUpdate({ terms: payload.liveAnchor.glossary });
          }
        } else if (message.type === 'POLL_START') {
          pulseStudent.handlePollStart(message.payload as Poll);
        } else if (message.type === 'POLL_RESULTS') {
          pulseStudent.handlePollResults(message.payload as Poll);
        } else if (message.type === 'ARENA_START') {
          arenaStudent.handleArenaStart();
        } else if (message.type === 'ARENA_QUESTION') {
          arenaStudent.handleQuestion(message.payload as {
            index: number; total: number; question: string; options: string[]; timeLimitSec: number;
          });
        } else if (message.type === 'ARENA_LEADERBOARD') {
          arenaStudent.handleLeaderboard(message.payload as {
            leaderboard: LeaderboardEntry[]; correctIndex: number; explanation: string;
          });
        } else if (message.type === 'ARENA_END') {
          arenaStudent.handleArenaEnd(message.payload as { leaderboard: LeaderboardEntry[] });
        } else if (message.type === 'TOPIC_UPDATE') {
          anchorStudent.handleTopicUpdate(message.payload as { topic: Topic; topicChanged: boolean });
        } else if (message.type === 'GLOSSARY_UPDATE') {
          anchorStudent.handleGlossaryUpdate(message.payload as { terms: GlossaryEntry[] });
        } else if (message.type === 'AUTO_BOOKMARK') {
          // Auto-create bookmark when host detects important cues
          const abPayload = message.payload as {
            topic: string;
            cues: Array<{ phrase?: string; reason?: string }>;
            timestamp?: number;
          };
          console.log('[App] Auto-bookmark triggered:', abPayload.topic, abPayload.cues);
          const authUserId = auth.user?.id;
          if (zoom.meetingId && authUserId) {
            const bookmarkTimestamp = abPayload.timestamp ?? Date.now();
            const cueSnippet = Array.isArray(abPayload.cues)
              ? abPayload.cues.map((cue) => cue?.phrase ?? cue?.reason ?? '').filter(Boolean).join(' | ')
              : undefined;
            anchorStudent.bookmarkCurrentTopic(zoom.meetingId, authUserId, {
              isAuto: true,
              topicOverride: abPayload.topic,
              transcriptSnippet: cueSnippet || undefined,
              timestamp: bookmarkTimestamp,
            });
          } else {
            console.log('[App] Auto-bookmark skipped: user is not signed in');
          }
        } else if (message.type === 'SPEAKER_SPOTLIGHT') {
          const spPayload = message.payload as { speakerName: string; participantId: string; timestamp: number };
          setStudentActiveSpeaker(spPayload.speakerName);
          console.log('[App] Speaker spotlight:', spPayload.speakerName);
        }
      }
      console.log('[App] received message:', message.type, message);
    };
  }, [
    zoom.isHost,
    zoom.meetingId,
    zoom.participantId,
    pulseHost.handleResponse,
    pulseStudent.handlePollStart,
    pulseStudent.handlePollResults,
    arenaHost.handleAnswer,
    arenaStudent.handleArenaStart,
    arenaStudent.handleQuestion,
    arenaStudent.handleLeaderboard,
    arenaStudent.handleArenaEnd,
    anchorStudent.handleTopicUpdate,
    anchorStudent.handleGlossaryUpdate,
    anchorStudent.bookmarkCurrentTopic,
    auth.user?.id,
    zoomEvents.handleFullState,
  ]);

  useEffect(() => {
    if (!zoom.isHost) return;

    const isArenaActive = arenaHost.phase === 'question' || arenaHost.phase === 'leaderboard';
    const appPhase: AppState['phase'] = isArenaActive ? 'arena' : 'lecture';

    const stateSnapshot: AppState = {
      phase: appPhase,
      arena: {
        active: isArenaActive,
        currentQuestion: arenaHost.currentIndex,
        questions: arenaHost.questions,
        answers: new Map(),
        leaderboard: arenaHost.leaderboard,
      },
      liveAnchor: {
        topics: anchorHost.topics,
        currentTopicId: anchorHost.currentTopicId,
        glossary: anchorHost.glossary,
      },
      pulse: {
        activePoll: pulseHost.activePoll,
        pollHistory: pulseHost.activePoll ? [pulseHost.activePoll] : [],
      },
      meeting: {
        id: zoom.meetingId,
        startTime: 0,
        participantCount: 0,
      },
    };

    messaging.setState(stateSnapshot);
  }, [
    zoom.isHost,
    zoom.meetingId,
    messaging.setState,
    arenaHost.phase,
    arenaHost.currentIndex,
    arenaHost.questions,
    arenaHost.leaderboard,
    anchorHost.topics,
    anchorHost.currentTopicId,
    anchorHost.glossary,
    pulseHost.activePoll,
  ]);

  if (!zoom.isConfigured && !zoom.error) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading">Initializing Zoom SDK…</div>
      </div>
    );
  }

  if (zoom.error) {
    const isAppNotSupport = zoom.error.startsWith('APP_NOT_SUPPORT:');
    const displayMessage = isAppNotSupport ? zoom.error.replace(/^APP_NOT_SUPPORT:\s*/, '') : zoom.error;
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="card" style={{ textAlign: 'left', maxWidth: 420 }}>
          <p style={{ color: 'var(--zoom-error)', fontWeight: 600 }}>SDK Error</p>
          <p style={{ color: 'var(--zoom-text)', fontSize: 14, marginTop: 8 }}>{displayMessage}</p>
          {isAppNotSupport ? (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--zoom-border)', fontSize: 13, color: 'var(--zoom-text-secondary)' }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Fix in Zoom Marketplace:</p>
              <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
                <li>Open your app → <strong>Build</strong> → <strong>Surface</strong>.</li>
                <li>Under <strong>In-Client App Features</strong>, find <strong>Zoom App SDK</strong>. If it says “You have 0 APIs added for this app”, click <strong>Add API</strong> and add the APIs your app needs (e.g. user context, in-meeting messaging, authorize).</li>
                <li>Under “Select WHERE to use your app”, ensure <strong>In-Meeting</strong> is ON.</li>
                <li>Add your app URL to <strong>Domain Whitelist URL</strong>. Add OAuth redirect URL and scope <code>zoomapp:inmeeting</code> as in the manual.</li>
              </ol>
            </div>
          ) : (
            <p style={{ color: 'var(--zoom-text-secondary)', fontSize: 12, marginTop: 12 }}>
              Make sure you're running this inside a Zoom meeting.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Sign-in is optional: app works with Zoom meeting context only. Sign-in enables saving bookmarks to your account.
  if (!hasSeenWelcome) {
    return (
      <WelcomeView
        userName={zoom.userName}
        isHost={zoom.isHost}
        onContinue={() => setHasSeenWelcome(true)}
      />
    );
  }

  if (zoom.isHost) {
    return (
      <HostDashboard
        userName={zoom.userName}
        connected={messaging.connected}
        pulsePhase={pulseHost.phase}
        pulseDraft={pulseHost.draft}
        pulseResponseCount={pulseHost.responseCount}
        pulseActivePoll={pulseHost.activePoll}
        pulseError={pulseHost.error}
        onPulseGenerate={pulseHost.generatePoll}
        onPulseUpdateDraft={pulseHost.updateDraft}
        onPulseLaunch={pulseHost.launchPoll}
        onPulseEndPoll={pulseHost.endPoll}
        onPulseReset={pulseHost.resetPoll}
        arenaPhase={arenaHost.phase}
        arenaCurrentQuestion={arenaHost.currentQuestion}
        arenaCurrentIndex={arenaHost.currentIndex}
        arenaTotalQuestions={arenaHost.totalQuestions}
        arenaResponseCount={arenaHost.responseCount}
        arenaCountdown={arenaHost.countdown}
        arenaLeaderboard={arenaHost.leaderboard}
        arenaError={arenaHost.error}
        onArenaFetchQuestions={arenaHost.fetchQuestions}
        onArenaStartGame={arenaHost.startGame}
        onArenaShowLeaderboard={arenaHost.showLeaderboard}
        onArenaNextQuestion={arenaHost.nextQuestion}
        onArenaReset={arenaHost.resetArena}
        anchorTopics={anchorHost.topics}
        anchorCurrentTopicId={anchorHost.currentTopicId}
        anchorGlossary={anchorHost.glossary}
        anchorIsPolling={anchorHost.isPolling}
        anchorError={anchorHost.error}
        onAnchorStartPolling={handleAnchorStartPolling}
        onAnchorStopPolling={handleAnchorStopPolling}
        onAnchorPollNow={anchorHost.pollTranscript}
        smartSpotlightEnabled={zoomEvents.smartSpotlightEnabled}
        onToggleSmartSpotlight={zoomEvents.setSmartSpotlightEnabled}
      />
    );
  }

  return (
    <StudentView
      userName={zoom.userName}
      connected={messaging.connected}
      isSignedIn={auth.isAuthenticated}
      onSignIn={auth.login}
      signInLoading={auth.isLoading}
      activePoll={pulseStudent.activePoll}
      selectedOption={pulseStudent.selectedOption}
      hasAnswered={pulseStudent.hasAnswered}
      pollResults={pulseStudent.results}
      onSelectOption={pulseStudent.selectOption}
      onSubmitAnswer={pulseStudent.submitAnswer}
      arenaPhase={arenaStudent.phase}
      arenaCurrentQuestion={arenaStudent.currentQuestion}
      arenaSelectedOption={arenaStudent.selectedOption}
      arenaCountdown={arenaStudent.countdown}
      arenaLeaderboard={arenaStudent.leaderboard}
      arenaCorrectIndex={arenaStudent.correctIndex}
      arenaExplanation={arenaStudent.explanation}
      arenaFinalLeaderboard={arenaStudent.finalLeaderboard}
      onArenaSelectAndSubmit={arenaStudent.selectAndSubmit}
      anchorTopics={anchorStudent.topics}
      anchorCurrentTopicId={anchorStudent.currentTopicId}
      anchorGlossary={anchorStudent.glossary}
      anchorBookmarks={anchorStudent.bookmarks}
      onBookmark={anchorStudent.bookmarkCurrentTopic}
      authUserId={auth.user?.id ?? null}
      meetingId={zoom.meetingId}
      meetingEnded={zoomEvents.meetingEnded}
      lateJoinInfo={zoomEvents.lateJoinInfo}
      onDismissLateJoin={zoomEvents.dismissLateJoinInfo}
      activeSpeaker={studentActiveSpeaker}
    />
  );
}
