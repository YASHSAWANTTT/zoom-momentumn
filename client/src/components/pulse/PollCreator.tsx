import { useState } from 'react';
import type { PollDraft, PulsePhase } from '../../hooks/usePulse';

interface PollCreatorProps {
  phase: PulsePhase;
  draft: PollDraft | null;
  responseCount: number;
  error: string | null;
  onGenerate: (context?: string) => void;
  onUpdateDraft: (updates: Partial<PollDraft>) => void;
  onLaunch: () => void;
  onEndPoll: () => void;
  onReset: () => void;
}

export function PollCreator({
  phase,
  draft,
  responseCount,
  error,
  onGenerate,
  onUpdateDraft,
  onLaunch,
  onEndPoll,
  onReset,
}: PollCreatorProps) {
  const [context, setContext] = useState('');

  if (phase === 'idle' || phase === 'generating') {
    return (
      <div className="poll-creator">
        <h2 className="card-title">Professor's Pulse</h2>
        <p className="poll-description">
          Generate an AI-powered check-in poll to gauge student understanding.
        </p>

        <div className="poll-context-input">
          <label htmlFor="poll-context">Context (optional)</label>
          <input
            id="poll-context"
            type="text"
            placeholder="e.g., 'We just covered the chain rule'"
            value={context}
            onChange={e => setContext(e.target.value)}
            disabled={phase === 'generating'}
          />
        </div>

        {error && <p className="poll-error">{error}</p>}

        <button
          className="btn btn-primary poll-generate-btn"
          onClick={() => onGenerate(context || undefined)}
          disabled={phase === 'generating'}
        >
          {phase === 'generating' ? (
            <>
              <span className="spinner" /> Generating…
            </>
          ) : (
            'Generate Check-In'
          )}
        </button>
      </div>
    );
  }

  if (phase === 'preview' && draft) {
    return (
      <div className="poll-creator">
        <h2 className="card-title">Preview Poll</h2>
        {draft.isFallback && (
          <p className="poll-fallback-notice">
            Using a built-in poll (AI unavailable). You can edit it below.
          </p>
        )}

        <div className="poll-preview">
          <div className="poll-edit-field">
            <label htmlFor="poll-question">Question</label>
            <input
              id="poll-question"
              type="text"
              value={draft.question}
              onChange={e => onUpdateDraft({ question: e.target.value })}
            />
          </div>

          <div className="poll-options-edit">
            <label>Options</label>
            {draft.options.map((option, i) => (
              <input
                key={i}
                type="text"
                value={option}
                placeholder={`Option ${i + 1}`}
                onChange={e => {
                  const newOptions = [...draft.options];
                  newOptions[i] = e.target.value;
                  onUpdateDraft({ options: newOptions });
                }}
              />
            ))}
          </div>
        </div>

        <div className="poll-preview-actions">
          <button className="btn btn-secondary" onClick={onReset}>
            ← Back
          </button>
          <button
            className="btn btn-primary"
            onClick={onLaunch}
            disabled={!draft.question.trim() || draft.options.some(o => !o.trim())}
          >
            Launch Poll
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'live') {
    return (
      <div className="poll-creator">
        <h2 className="card-title">Poll Active</h2>
        <div className="poll-live-status">
          <div className="poll-live-indicator">
            <span className="pulse-dot" />
            <span>Live</span>
          </div>
          <span className="poll-response-count">{responseCount} {responseCount === 1 ? 'response' : 'responses'}</span>
        </div>
        <button className="btn btn-primary" onClick={onEndPoll}>
          End Poll & Show Results
        </button>
      </div>
    );
  }

  return null;
}
