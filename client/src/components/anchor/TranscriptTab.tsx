import { useState, useEffect, useRef } from 'react';
import type { Topic, GlossaryEntry } from '../../types/messages';

interface TranscriptTabProps {
  meetingId: string;
  glossary: GlossaryEntry[];
  topics: Topic[];
  currentTopicId: string;
  /** When host has Anchor AI running, parent pushes the same buffer the AI uses (faster than polling here). */
  hostLiveFeed?: { buffer: string; segmentCount: number };
}

export function TranscriptTab({ meetingId, glossary, topics, currentTopicId, hostLiveFeed }: TranscriptTabProps) {
  const [transcript, setTranscript] = useState('');
  const [segmentCount, setSegmentCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const controlled = hostLiveFeed !== undefined;

  useEffect(() => {
    if (!meetingId || controlled) return;

    const fetchBuffer = async () => {
      try {
        const res = await fetch(`/api/transcript/buffer?meetingId=${encodeURIComponent(meetingId)}`);
        if (!res.ok) return;
        const data = await res.json();
        setTranscript(typeof data.buffer === 'string' ? data.buffer : '');
        setSegmentCount(typeof data.segmentCount === 'number' ? data.segmentCount : 0);
      } catch {
        // silent
      }
    };

    fetchBuffer();
    const interval = setInterval(fetchBuffer, 5_000);
    return () => clearInterval(interval);
  }, [meetingId, controlled]);

  const displayText = controlled ? hostLiveFeed!.buffer : transcript;
  const displayCount = controlled ? hostLiveFeed!.segmentCount : segmentCount;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, displayText]);

  if (!meetingId) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--zoom-text-secondary)', fontSize: 13 }}>
        Live transcript will appear here during a meeting.
      </div>
    );
  }

  if (!displayText?.trim()) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--zoom-text-secondary)', fontSize: 13 }}>
        <div style={{ marginBottom: 8 }}>Waiting for transcript data…</div>
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          After you start AI, text appears here as RTMS captures speech (usually a few seconds after people talk).
        </div>
      </div>
    );
  }

  const glossaryTerms = glossary.map(g => g.term).filter(t => t.length > 2);
  const currentTopic = topics.find(t => t.id === currentTopicId);

  return (
    <div>
      {/* Current topic header */}
      {currentTopic && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 10,
          borderRadius: 6,
          background: 'var(--zoom-brand-light, #e8f0fe)',
          borderLeft: '3px solid var(--zoom-brand, #0E71EB)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--zoom-brand, #0E71EB)' }}>
            Current Topic
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{currentTopic.title}</div>
          {currentTopic.bullets.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--zoom-text-secondary)' }}>
              {currentTopic.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Topic history */}
      {topics.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--zoom-text-secondary)', marginBottom: 4 }}>
            Topics Covered
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto' }}>
            {topics.map(t => {
              const time = new Date(t.startTime);
              const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}`;
              return (
                <span key={t.id} style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: t.id === currentTopicId ? 'var(--zoom-brand, #0E71EB)' : 'var(--zoom-bg)',
                  color: t.id === currentTopicId ? '#fff' : 'var(--zoom-text)',
                }}>
                  {timeStr} — {t.title}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Glossary terms legend */}
      {glossaryTerms.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--zoom-text-secondary)', marginBottom: 6 }}>
          Key terms highlighted: {glossaryTerms.slice(0, 5).join(', ')}{glossaryTerms.length > 5 ? ` +${glossaryTerms.length - 5} more` : ''}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--zoom-text-secondary)' }}>
          {displayCount} segments — {controlled ? 'live while AI is on' : 'updates every 5s'}
        </span>
      </div>

      {/* Transcript body */}
      <div
        ref={scrollRef}
        style={{
          maxHeight: 350,
          overflowY: 'auto',
          fontSize: 13,
          lineHeight: 1.8,
          color: 'var(--zoom-text)',
          padding: '8px 12px',
          background: 'var(--zoom-bg)',
          borderRadius: 6,
          border: '1px solid var(--zoom-border, #e0e0e0)',
        }}
        dangerouslySetInnerHTML={{ __html: highlightTerms(displayText, glossaryTerms) }}
      />
    </div>
  );
}

function highlightTerms(text: string, terms: string[]): string {
  if (terms.length === 0) return escapeHtml(text);

  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escapeHtml(text).replace(
    new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi'),
    '<strong style="color: var(--zoom-brand, #0E71EB)">$1</strong>',
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
