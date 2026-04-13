import { useEffect, useState } from 'react';
import type { Poll } from '../../types/messages';

interface PollCardProps {
  poll: Poll;
  selectedOption: number | null;
  hasAnswered: boolean;
  onSelect: (index: number) => void;
  onSubmit: () => void;
}

export function PollCard({ poll, selectedOption, hasAnswered, onSelect, onSubmit }: PollCardProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (hasAnswered) {
      const timer = setTimeout(() => setDismissed(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [hasAnswered]);

  if (dismissed) return null;

  return (
    <div className="poll-card-overlay">
      <div className={`poll-card ${hasAnswered ? 'poll-card-fade' : ''}`}>
        <div className="poll-card-header">
          <span className="pulse-dot" />
          <span>Live Poll</span>
        </div>

        <h3 className="poll-card-question">{poll.question}</h3>

        <div className="poll-card-options">
          {poll.options.map((option, i) => (
            <button
              key={i}
              className={`poll-option ${selectedOption === i ? 'selected' : ''} ${hasAnswered ? 'disabled' : ''}`}
              onClick={() => !hasAnswered && onSelect(i)}
              disabled={hasAnswered}
            >
              <span className="poll-option-letter">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="poll-option-text">{option}</span>
            </button>
          ))}
        </div>

        {!hasAnswered ? (
          <button
            className="btn btn-primary poll-submit-btn"
            onClick={onSubmit}
            disabled={selectedOption === null}
          >
            Submit Answer
          </button>
        ) : (
          <div className="poll-submitted">
            Answer submitted
          </div>
        )}
      </div>
    </div>
  );
}
