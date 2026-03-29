import type { Topic } from '../../types/messages';
import { TopicCard } from './TopicCard';

interface TimelineProps {
  topics: Topic[];
  currentTopicId: string;
  onBookmark?: (topicId: string) => void;
}

export function Timeline({ topics, currentTopicId, onBookmark }: TimelineProps) {
  // Show newest first
  const sorted = [...topics].sort((a, b) => b.startTime - a.startTime);

  if (sorted.length === 0) {
    return (
      <div>
        <h2 className="card-title">Live Anchor</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#9776;</div>
          <p className="empty-state-text">
            Topic summaries will appear here as the lecture progresses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="card-title">Live Anchor</h2>
      <div className="timeline-list">
        {sorted.map(topic => (
          <TopicCard
            key={topic.id}
            topic={topic}
            isCurrent={topic.id === currentTopicId}
            onBookmark={onBookmark ? () => onBookmark(topic.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
