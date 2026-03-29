import { useState } from 'react';
import type { GlossaryEntry } from '../../types/messages';

interface GlossaryTabProps {
  glossary: GlossaryEntry[];
}

export function GlossaryTab({ glossary }: GlossaryTabProps) {
  const [filter, setFilter] = useState('');

  const filtered = filter.trim()
    ? glossary.filter(g =>
        g.term.toLowerCase().includes(filter.toLowerCase()) ||
        g.definition.toLowerCase().includes(filter.toLowerCase())
      )
    : glossary;

  // Show newest first
  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div>
      <h2 className="card-title">Glossary &amp; Formulas ({glossary.length})</h2>
      <input
        type="text"
        className="glossary-search"
        placeholder="Search terms…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid var(--zoom-border)',
          background: 'var(--zoom-bg)',
          color: 'var(--zoom-text)',
          fontSize: 13,
          marginBottom: 12,
          boxSizing: 'border-box',
        }}
      />
      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128218;</div>
          <p className="empty-state-text">
            {glossary.length === 0
              ? 'Key terms and formulas will accumulate here during the lecture.'
              : 'No matching terms found.'}
          </p>
        </div>
      ) : (
        <div className="glossary-list">
          {sorted.map((entry, i) => (
            <div key={`${entry.term}-${i}`} className="glossary-entry">
              <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.term}</div>
              <div style={{ fontSize: 12, color: 'var(--zoom-text-secondary)', marginTop: 2 }}>
                {entry.definition}
              </div>
              {entry.formula && (
                <code style={{
                  display: 'block',
                  marginTop: 4,
                  fontSize: 12,
                  padding: '4px 8px',
                  background: 'var(--zoom-surface)',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                }}>
                  {entry.formula}
                </code>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
