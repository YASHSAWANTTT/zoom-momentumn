import { useState } from 'react';
import { PollCreator } from '../components/pulse/PollCreator';
import { PollResults } from '../components/pulse/PollResults';
import { ArenaHost } from '../components/arena/ArenaHost';
import { Timeline } from '../components/anchor/Timeline';
import { GlossaryTab } from '../components/anchor/GlossaryTab';
import { FeatureInfo } from '../components/shared/FeatureInfo';
import type { PollDraft, PulsePhase } from '../hooks/usePulse';
import type { ArenaHostPhase } from '../hooks/useArena';
import type { Poll, Question, LeaderboardEntry, Topic, GlossaryEntry } from '../types/messages';

const TAB_INFO = {
  pulse: 'Generate AI check-in polls to gauge student understanding. You can edit the question before launching it to everyone.',
  arena: 'Run a timed trivia quiz. AI generates questions from your topic, and students compete on a live leaderboard with scoring.',
  anchor: 'AI analyzes your lecture transcript in real time, building a topic timeline and glossary visible to all students.',
} as const;

interface HostDashboardProps {
  userName: string;
  connected: boolean;
  // Pulse props
  pulsePhase: PulsePhase;
  pulseDraft: PollDraft | null;
  pulseResponseCount: number;
  pulseActivePoll: Poll | null;
  pulseError: string | null;
  onPulseGenerate: (context?: string) => void;
  onPulseUpdateDraft: (updates: Partial<PollDraft>) => void;
  onPulseLaunch: () => void;
  onPulseEndPoll: () => void;
  onPulseReset: () => void;
  // Arena props
  arenaPhase: ArenaHostPhase;
  arenaCurrentQuestion: Question | null;
  arenaCurrentIndex: number;
  arenaTotalQuestions: number;
  arenaResponseCount: number;
  arenaCountdown: number;
  arenaLeaderboard: LeaderboardEntry[];
  arenaError: string | null;
  onArenaFetchQuestions: (topic?: string) => void;
  onArenaStartGame: () => void;
  onArenaShowLeaderboard: () => void;
  onArenaNextQuestion: () => void;
  onArenaReset: () => void;
  // Anchor props
  anchorTopics: Topic[];
  anchorCurrentTopicId: string;
  anchorGlossary: GlossaryEntry[];
  anchorIsPolling: boolean;
  anchorError: string | null;
  onAnchorStartPolling: () => void;
  onAnchorStopPolling: () => void;
  onAnchorPollNow: () => void;
  smartSpotlightEnabled: boolean;
  onToggleSmartSpotlight: (enabled: boolean) => void;
}

type HostTab = 'pulse' | 'arena' | 'anchor';

export function HostDashboard({
  userName,
  connected,
  pulsePhase,
  pulseDraft,
  pulseResponseCount,
  pulseActivePoll,
  pulseError,
  onPulseGenerate,
  onPulseUpdateDraft,
  onPulseLaunch,
  onPulseEndPoll,
  onPulseReset,
  arenaPhase,
  arenaCurrentQuestion,
  arenaCurrentIndex,
  arenaTotalQuestions,
  arenaResponseCount,
  arenaCountdown,
  arenaLeaderboard,
  arenaError,
  onArenaFetchQuestions,
  onArenaStartGame,
  onArenaShowLeaderboard,
  onArenaNextQuestion,
  onArenaReset,
  anchorTopics,
  anchorCurrentTopicId,
  anchorGlossary,
  anchorIsPolling,
  anchorError,
  onAnchorStartPolling,
  onAnchorStopPolling,
  onAnchorPollNow,
  smartSpotlightEnabled,
  onToggleSmartSpotlight,
}: HostDashboardProps) {
  const [activeTab, setActiveTab] = useState<HostTab>('pulse');

  return (
    <div className="app-container">
      <div className="status-bar">
        <span style={{ fontWeight: 600 }}>Momentum — Host</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--zoom-text-secondary)' }}>Participants: --</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={() => onToggleSmartSpotlight(!smartSpotlightEnabled)}
          >
            Smart Spotlight: {smartSpotlightEnabled ? 'On' : 'Off'}
          </button>
          <div className="status-indicator">
            <div className={`status-dot ${connected ? 'connected' : ''}`} />
            <span>{connected ? 'Connected' : 'Connecting…'}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '8px 0 0' }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'pulse' ? 'active' : ''}`}
            onClick={() => setActiveTab('pulse')}
          >
            Pulse
            {pulsePhase === 'live' && (
              <span style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--zoom-error, #e53935)',
                marginLeft: 6,
                verticalAlign: 'middle',
              }} />
            )}
          </button>
          <button
            className={`tab ${activeTab === 'arena' ? 'active' : ''}`}
            onClick={() => setActiveTab('arena')}
          >
            Arena
            {(arenaPhase === 'question' || arenaPhase === 'leaderboard') && (
              <span style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--zoom-error, #e53935)',
                marginLeft: 6,
                verticalAlign: 'middle',
              }} />
            )}
          </button>
          <button
            className={`tab ${activeTab === 'anchor' ? 'active' : ''}`}
            onClick={() => setActiveTab('anchor')}
          >
            Anchor
            {anchorIsPolling && (
              <span style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--zoom-success, #43a047)',
                marginLeft: 6,
                verticalAlign: 'middle',
              }} />
            )}
          </button>
        </div>
      </div>

      <div className="card" style={{ flex: 1 }}>
        <div className="tab-info-bar">
          <FeatureInfo title={activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} description={TAB_INFO[activeTab]} />
        </div>
        {activeTab === 'pulse' && (
          <>
            {pulsePhase === 'results' && pulseActivePoll ? (
              <PollResults
                poll={pulseActivePoll}
                onDismiss={onPulseReset}
              />
            ) : (
              <PollCreator
                phase={pulsePhase}
                draft={pulseDraft}
                responseCount={pulseResponseCount}
                error={pulseError}
                onGenerate={onPulseGenerate}
                onUpdateDraft={onPulseUpdateDraft}
                onLaunch={onPulseLaunch}
                onEndPoll={onPulseEndPoll}
                onReset={onPulseReset}
              />
            )}
          </>
        )}
        {activeTab === 'arena' && (
          <ArenaHost
            phase={arenaPhase}
            currentQuestion={arenaCurrentQuestion}
            currentIndex={arenaCurrentIndex}
            totalQuestions={arenaTotalQuestions}
            responseCount={arenaResponseCount}
            countdown={arenaCountdown}
            leaderboard={arenaLeaderboard}
            error={arenaError}
            onFetchQuestions={onArenaFetchQuestions}
            onStartGame={onArenaStartGame}
            onShowLeaderboard={onArenaShowLeaderboard}
            onNextQuestion={onArenaNextQuestion}
            onReset={onArenaReset}
          />
        )}
        {activeTab === 'anchor' && (
          <div className="anchor-controls">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="card-title" style={{ margin: 0 }}>Live Anchor</h2>
              <div className="anchor-status">
                <div className={`status-dot ${anchorIsPolling ? 'active' : ''}`} />
                <span>{anchorIsPolling ? 'AI Active' : 'Paused'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {anchorIsPolling ? (
                <button className="btn btn-secondary" onClick={onAnchorStopPolling}>Pause AI</button>
              ) : (
                <button className="btn btn-primary" onClick={onAnchorStartPolling}>Start AI</button>
              )}
              <button className="btn btn-secondary" onClick={onAnchorPollNow} disabled={anchorIsPolling}>
                Analyze Now
              </button>
            </div>
            {anchorError && (
              <p style={{ color: 'var(--zoom-error)', fontSize: 12 }}>{anchorError}</p>
            )}
            <Timeline topics={anchorTopics} currentTopicId={anchorCurrentTopicId} />
            {anchorGlossary.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <GlossaryTab glossary={anchorGlossary} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--zoom-text-secondary)', textAlign: 'center' }}>
        Hosting as {userName}
      </div>
    </div>
  );
}
