import { useState } from 'react';
import type { AnchorBookmark } from '../../hooks/useLiveAnchor';

interface BookmarkListProps {
  bookmarks: AnchorBookmark[];
}

export function BookmarkList({ bookmarks }: BookmarkListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (bookmarks.length === 0) return null;

  return (
    <div className="bookmark-list">
      <h4 style={{ fontSize: 12, color: 'var(--zoom-text-secondary)', margin: '12px 0 6px', fontWeight: 600 }}>
        Bookmarks ({bookmarks.length})
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bookmarks.map((b, i) => {
          const ago = Math.round((Date.now() - b.timestamp) / 60000);
          const timeLabel = ago < 1 ? 'just now' : `${ago}m ago`;
          const isExpanded = expandedIndex === i;
          const time = new Date(b.timestamp);
          const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;

          return (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--zoom-bg)',
                fontSize: 12,
                cursor: 'pointer',
                border: isExpanded ? '1px solid var(--zoom-brand, #0E71EB)' : '1px solid transparent',
                transition: 'border-color 0.2s',
              }}
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{b.isAuto ? '\u2728' : '\uD83D\uDD16'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.topic}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--zoom-text-secondary)' }}>{timeLabel}</span>
                  <span style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: b.isAuto ? 'var(--zoom-brand-light, #e8f0fe)' : 'var(--zoom-bg)',
                    color: b.isAuto ? 'var(--zoom-brand, #0E71EB)' : 'var(--zoom-text-secondary)',
                  }}>
                    {b.isAuto ? 'auto' : 'manual'}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--zoom-border, #e0e0e0)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                    <div>
                      <span style={{ color: 'var(--zoom-text-secondary)' }}>Time: </span>
                      <span>{timeStr}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--zoom-text-secondary)' }}>Topic: </span>
                      <span style={{ fontWeight: 500 }}>{b.topic}</span>
                    </div>
                    {b.transcriptSnippet && (
                      <div>
                        <span style={{ color: 'var(--zoom-text-secondary)' }}>Context: </span>
                        <span style={{ fontStyle: 'italic' }}>"{b.transcriptSnippet}"</span>
                      </div>
                    )}
                    <div>
                      <span style={{ color: 'var(--zoom-text-secondary)' }}>Type: </span>
                      <span>{b.isAuto ? 'Auto-detected by AI (instructor cue)' : 'Manually bookmarked'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
