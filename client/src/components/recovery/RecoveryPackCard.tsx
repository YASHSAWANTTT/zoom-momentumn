import { useState } from 'react';

interface RecoveryItem {
  topic: string;
  explanation: string;
  practice: string;
  resource: string;
}

interface RecoveryPackCardProps {
  items: RecoveryItem[];
  meetingTitle?: string;
  onDismiss?: () => void;
}

export function RecoveryPackCard({ items, meetingTitle, onDismiss }: RecoveryPackCardProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0]));

  const toggleExpanded = (index: number) => {
    setExpandedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };
  if (items.length === 0) {
    return (
      <div className="recovery-pack">
        <h2 className="recovery-title">Recovery Pack</h2>
        <p className="recovery-empty">
          No bookmarks were created during this session.
        </p>
      </div>
    );
  }

  return (
    <div className="recovery-pack">
      <div className="recovery-header">
        <h2 className="recovery-title">Recovery Pack</h2>
        {meetingTitle && (
          <span className="recovery-meeting">{meetingTitle}</span>
        )}
      </div>
      <p className="recovery-subtitle">
        Based on {items.length} moment{items.length !== 1 ? 's' : ''} you bookmarked
      </p>

      <div className="recovery-items">
        {items.map((item, i) => (
          <div key={i} className="recovery-item">
            <div
              className="recovery-item-header"
              style={{ cursor: 'pointer' }}
              onClick={() => toggleExpanded(i)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(i); } }}
              aria-expanded={expandedIndices.has(i)}
            >
              <span className="recovery-item-number">{i + 1}</span>
              <h3 className="recovery-item-topic" style={{ flex: 1, margin: 0 }}>{item.topic}</h3>
              <span style={{ fontSize: 12, color: 'var(--zoom-text-secondary)', marginLeft: 8 }}>
                {expandedIndices.has(i) ? '\u25B2' : '\u25BC'}
              </span>
            </div>

            {expandedIndices.has(i) && (
              <>
                <div className="recovery-section">
                  <span className="recovery-label">Explanation</span>
                  <p className="recovery-text">{item.explanation}</p>
                </div>

                <div className="recovery-section">
                  <span className="recovery-label">Practice</span>
                  <p className="recovery-text">{item.practice}</p>
                </div>

                <div className="recovery-section">
                  <span className="recovery-label">Resource</span>
                  <p className="recovery-resource">{item.resource}</p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {onDismiss && (
        <button className="btn btn-secondary recovery-dismiss" onClick={onDismiss}>
          Done Reviewing
        </button>
      )}
    </div>
  );
}
