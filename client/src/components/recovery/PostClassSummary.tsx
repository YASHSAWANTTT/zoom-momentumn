import { RecoveryPackCard } from './RecoveryPackCard';
import type { Topic, GlossaryEntry } from '../../types/messages';

interface RecoveryItem {
  topic: string;
  explanation: string;
  practice: string;
  resource: string;
}

interface PostClassSummaryProps {
  meetingTitle?: string;
  topics: Topic[];
  glossary: GlossaryEntry[];
  recoveryItems: RecoveryItem[];
  isLoading: boolean;
  onDismiss?: () => void;
}

export function PostClassSummary({
  meetingTitle,
  topics,
  glossary,
  recoveryItems,
  isLoading,
  onDismiss,
}: PostClassSummaryProps) {
  return (
    <div className="post-class-summary">
      <div className="post-class-header">
        <h1 className="post-class-title">Class Complete</h1>
        {meetingTitle && <p className="post-class-meeting">{meetingTitle}</p>}
      </div>

      <div className="post-class-stats">
        <div className="stat-card">
          <span className="stat-number">{topics.length}</span>
          <span className="stat-label">Topics Covered</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{glossary.length}</span>
          <span className="stat-label">Terms Learned</span>
        </div>
        {recoveryItems.length > 0 && (
          <div className="stat-card">
            <span className="stat-number">{recoveryItems.length}</span>
            <span className="stat-label">Bookmarks</span>
          </div>
        )}
        {topics.length >= 2 && (
          <div className="stat-card">
            <span className="stat-number">
              {Math.round(((topics[topics.length - 1]?.startTime ?? 0) - (topics[0]?.startTime ?? 0)) / 60_000)}m
            </span>
            <span className="stat-label">Duration</span>
          </div>
        )}
      </div>

      {topics.length > 0 && (
        <div className="post-class-section" style={{ borderTop: '1px solid var(--zoom-border)', paddingTop: 16 }}>
          <h3 className="post-class-section-title">Topics Covered</h3>
          <div className="post-class-topics">
            {topics.map(topic => (
              <div key={topic.id} className="post-class-topic">
                <span className="post-class-topic-title">{topic.title}</span>
                <ul className="post-class-topic-bullets">
                  {topic.bullets.slice(0, 2).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {glossary.length > 0 && (
        <div className="post-class-section" style={{ borderTop: '1px solid var(--zoom-border)', paddingTop: 16 }}>
          <h3 className="post-class-section-title">Key Terms</h3>
          <div className="post-class-terms">
            {glossary.slice(0, 6).map((entry, i) => (
              <div key={i} className="post-class-term">
                <strong>{entry.term}</strong>
                {entry.formula && <code>{entry.formula}</code>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="post-class-section" style={{ borderTop: '1px solid var(--zoom-border)', paddingTop: 16 }}>
          <h3 className="post-class-section-title">Your Recovery Pack</h3>
        {isLoading ? (
          <div className="recovery-loading">
            <span className="spinner" /> Generating your personalized review…
          </div>
        ) : (
          <RecoveryPackCard
            items={recoveryItems}
            onDismiss={onDismiss}
          />
        )}
      </div>
    </div>
  );
}
