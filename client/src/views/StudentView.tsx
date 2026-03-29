import { useState, useCallback, useEffect } from 'react';
import { PollCard } from '../components/pulse/PollCard';
import { PollResults } from '../components/pulse/PollResults';
import { ArenaStudent } from '../components/arena/ArenaStudent';
import { Timeline } from '../components/anchor/Timeline';
import { GlossaryTab } from '../components/anchor/GlossaryTab';
import { PostClassSummary } from '../components/recovery/PostClassSummary';
import { FeatureInfo } from '../components/shared/FeatureInfo';
import type { Poll, Topic, GlossaryEntry } from '../types/messages';
import type { AnchorBookmark } from '../hooks/useLiveAnchor';

const TAB_INFO = {
  timeline: 'Topics and key takeaways appear here as your professor lectures. Tap "I\'m Confused" to bookmark moments for review after class.',
  glossary: 'Technical terms and definitions extracted from the lecture. Use the search bar to find specific terms.',
} as const;
import type { LeaderboardEntry } from '../types/messages';
import type { ArenaStudentPhase } from '../hooks/useArena';

interface StudentViewProps {
  userName: string;
  connected: boolean;
  isSignedIn?: boolean;
  onSignIn?: () => void;
  signInLoading?: boolean;
  authUserId?: string | null;
  meetingId: string;
  // Pulse props
  activePoll: Poll | null;
  selectedOption: number | null;
  hasAnswered: boolean;
  pollResults: Poll | null;
  onSelectOption: (index: number) => void;
  onSubmitAnswer: () => void;
  // Arena props
  arenaPhase: ArenaStudentPhase;
  arenaCurrentQuestion: {
    index: number;
    total: number;
    question: string;
    options: string[];
  } | null;
  arenaSelectedOption: number | null;
  arenaCountdown: number;
  arenaLeaderboard: LeaderboardEntry[];
  arenaCorrectIndex: number | null;
  arenaExplanation: string;
  arenaFinalLeaderboard: LeaderboardEntry[];
  onArenaSelectAndSubmit: (optionIndex: number) => void;
  // Anchor props
  anchorTopics: Topic[];
  anchorCurrentTopicId: string;
  anchorGlossary: GlossaryEntry[];
  anchorBookmarks: AnchorBookmark[];
  onBookmark: (meetingId: string, userId: string) => Promise<boolean>;
  // Events props (wired by Events teammate)
  meetingEnded?: boolean;
  lateJoinInfo?: { topicCount: number; latestTopic: string } | null;
  onDismissLateJoin?: () => void;
  activeSpeaker?: string | null;
}

const BOOKMARK_SAVED = 'Bookmarked';
const BOOKMARK_SIGN_IN = 'Sign in to save bookmarks';

type StudentTab = 'timeline' | 'glossary';

export function StudentView({
  userName,
  connected,
  isSignedIn = false,
  onSignIn,
  signInLoading = false,
  authUserId = null,
  meetingId,
  activePoll,
  selectedOption,
  hasAnswered,
  pollResults,
  onSelectOption,
  onSubmitAnswer,
  arenaPhase,
  arenaCurrentQuestion,
  arenaSelectedOption,
  arenaCountdown,
  arenaLeaderboard,
  arenaCorrectIndex,
  arenaExplanation,
  arenaFinalLeaderboard,
  onArenaSelectAndSubmit,
  anchorTopics,
  anchorCurrentTopicId,
  anchorGlossary,
  anchorBookmarks,
  onBookmark,
  meetingEnded = false,
  lateJoinInfo,
  onDismissLateJoin,
  activeSpeaker,
}: StudentViewProps) {
  const [activeTab, setActiveTab] = useState<StudentTab>('timeline');
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);

  // --- Recovery state for meeting end ---
  const [recoveryItems, setRecoveryItems] = useState<{ topic: string; explanation: string; practice: string; resource: string }[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  useEffect(() => {
    if (!meetingEnded || !authUserId || !meetingId) return;
    let cancelled = false;
    setRecoveryLoading(true);
    const bookmarks = anchorBookmarks.map((bookmark) => ({
      topic: bookmark.topic,
      timestamp: bookmark.timestamp,
      transcriptSnippet: bookmark.transcriptSnippet,
      isAuto: bookmark.isAuto,
    }));

    if (bookmarks.length === 0) {
      setRecoveryItems([]);
      setRecoveryLoading(false);
      return;
    }

    fetch('/api/ai/recovery-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookmarks,
        topics: anchorTopics.map(t => ({ title: t.title, bullets: t.bullets })),
      }),
    })
      .then(res => res.json())
      .then(data => { if (!cancelled) setRecoveryItems(data.items ?? []); })
      .catch(() => { if (!cancelled) setRecoveryItems([]); })
      .finally(() => { if (!cancelled) setRecoveryLoading(false); });
    return () => { cancelled = true; };
  }, [meetingEnded, authUserId, meetingId, anchorBookmarks, anchorTopics]);

  const showArena = arenaPhase !== 'waiting' || arenaCurrentQuestion !== null;

  const handleBookmark = useCallback(async () => {
    if (!authUserId) {
      setBookmarkToast(BOOKMARK_SIGN_IN);
      setTimeout(() => setBookmarkToast(null), 2800);
      return;
    }
    if (!meetingId) {
      setBookmarkToast('Meeting not detected');
      setTimeout(() => setBookmarkToast(null), 2200);
      return;
    }
    const ok = await onBookmark(meetingId, authUserId);
    if (ok) {
      setBookmarkToast(BOOKMARK_SAVED);
      setTimeout(() => setBookmarkToast(null), 2200);
    }
  }, [onBookmark, authUserId, meetingId]);

  // Show PostClassSummary when meeting has ended
  if (meetingEnded) {
    return (
      <div className="app-container">
        <div className="card" style={{ flex: 1 }}>
          <PostClassSummary
            meetingTitle="Lecture Session"
            topics={anchorTopics}
            glossary={anchorGlossary}
            recoveryItems={recoveryItems}
            isLoading={recoveryLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="status-bar">
        <span style={{ fontWeight: 600 }}>Momentum</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeSpeaker && (
            <span style={{ fontSize: 11, color: 'var(--zoom-brand)', fontWeight: 500 }}>
              Speaking: {activeSpeaker}
            </span>
          )}
          {!isSignedIn && onSignIn && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={onSignIn}
              disabled={signInLoading}
            >
              {signInLoading ? 'Connecting…' : 'Sign in to save bookmarks'}
            </button>
          )}
          <div className="status-indicator">
            <div className={`status-dot ${connected ? 'connected' : ''}`} />
            <span>{connected ? 'Connected' : 'Connecting…'}</span>
          </div>
        </div>
      </div>

      {lateJoinInfo && (
        <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--zoom-brand-light, #e8f0fe)', borderLeft: '3px solid var(--zoom-brand, #0E71EB)' }}>
          <div style={{ fontSize: 13 }}>
            <strong>You joined late.</strong> {lateJoinInfo.topicCount} topic{lateJoinInfo.topicCount !== 1 ? 's' : ''} covered so far. Latest: <em>{lateJoinInfo.latestTopic}</em>
          </div>
          {onDismissLateJoin && (
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: 11, marginLeft: 8, flexShrink: 0 }}
              onClick={onDismissLateJoin}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ padding: '8px 0 0' }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </button>
          <button
            className={`tab ${activeTab === 'glossary' ? 'active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            Glossary
          </button>
        </div>
      </div>

      <div className="card" style={{ flex: 1 }}>
        <div className="tab-info-bar">
          <FeatureInfo title={activeTab === 'timeline' ? 'Timeline' : 'Glossary'} description={TAB_INFO[activeTab]} />
        </div>
        {activeTab === 'timeline' && (
          <div>
            <Timeline
              topics={anchorTopics}
              currentTopicId={anchorCurrentTopicId}
              onBookmark={handleBookmark ? () => handleBookmark() : undefined}
            />
            <button
              className="btn btn-secondary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={handleBookmark}
            >
              I'm Confused
            </button>
          </div>
        )}
        {activeTab === 'glossary' && (
          <GlossaryTab glossary={anchorGlossary} />
        )}
      </div>

      {bookmarkToast && (
        <div className="bookmark-toast">{bookmarkToast}</div>
      )}

      {pollResults && (
        <div className="card">
          <PollResults poll={pollResults} />
        </div>
      )}

      {activePoll && (
        <PollCard
          poll={activePoll}
          selectedOption={selectedOption}
          hasAnswered={hasAnswered}
          onSelect={onSelectOption}
          onSubmit={onSubmitAnswer}
        />
      )}

      {showArena && (
        <ArenaStudent
          phase={arenaPhase}
          currentQuestion={arenaCurrentQuestion}
          selectedOption={arenaSelectedOption}
          countdown={arenaCountdown}
          leaderboard={arenaLeaderboard}
          correctIndex={arenaCorrectIndex}
          explanation={arenaExplanation}
          finalLeaderboard={arenaFinalLeaderboard}
          onSelectAndSubmit={onArenaSelectAndSubmit}
        />
      )}

      <div style={{ fontSize: 11, color: 'var(--zoom-text-secondary)', textAlign: 'center' }}>
        Joined as {userName}
      </div>
    </div>
  );
}
