import type { Poll } from '../../types/messages';

interface PollResultsProps {
  poll: Poll;
  onDismiss?: () => void;
}

export function PollResults({ poll, onDismiss }: PollResultsProps) {
  const results = poll.results ?? {};
  const total = poll.totalResponses ?? 0;

  const maxCount = Math.max(...Object.values(results), 1);

  return (
    <div className="poll-results">
      <div className="poll-results-header">
        <h3 className="poll-results-title">Poll Results</h3>
        {total > 0 && (
          <span className="poll-results-total">{total} response{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      <p className="poll-results-question">{poll.question}</p>

      <div className="poll-results-bars">
        {poll.options.map((option, i) => {
          const count = results[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barWidth = total > 0 ? (count / maxCount) * 100 : 0;

          return (
            <div key={i} className="poll-result-row">
              <div className="poll-result-label">
                <span className="poll-option-letter">{String.fromCharCode(65 + i)}</span>
                <span className="poll-result-text">{option}</span>
                <span className="poll-result-pct">{pct}%</span>
              </div>
              <div className="poll-result-bar-bg">
                <div
                  className="poll-result-bar-fill"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="poll-result-count">{count}</span>
            </div>
          );
        })}
      </div>

      {onDismiss && (
        <button className="btn btn-secondary poll-dismiss-btn" onClick={onDismiss}>
          New Poll
        </button>
      )}
    </div>
  );
}
