import { useState } from 'react';
import { Leaderboard } from './Leaderboard';
import type { ArenaHostPhase } from '../../hooks/useArena';
import type { Question, LeaderboardEntry } from '../../types/messages';

interface ArenaHostProps {
  phase: ArenaHostPhase;
  currentQuestion: Question | null;
  currentIndex: number;
  totalQuestions: number;
  responseCount: number;
  countdown: number;
  leaderboard: LeaderboardEntry[];
  error: string | null;
  onFetchQuestions: (topic?: string) => void;
  onStartGame: () => void;
  onShowLeaderboard: () => void;
  onNextQuestion: () => void;
  onReset: () => void;
}

export function ArenaHost({
  phase,
  currentQuestion,
  currentIndex,
  totalQuestions,
  responseCount,
  countdown,
  leaderboard,
  error,
  onFetchQuestions,
  onStartGame,
  onShowLeaderboard,
  onNextQuestion,
  onReset,
}: ArenaHostProps) {
  const [topic, setTopic] = useState('');

  if (phase === 'idle' || phase === 'loading') {
    return (
      <div className="arena-host">
        <h2 className="card-title">Warm-Up Arena</h2>
        <p className="arena-description">
          Launch a trivia game to review last lecture's material before class begins.
        </p>

        <div className="arena-topic-input">
          <label htmlFor="arena-topic">Topic (optional)</label>
          <input
            id="arena-topic"
            type="text"
            placeholder="e.g., 'Cell Biology — mitosis and meiosis'"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            disabled={phase === 'loading'}
          />
        </div>

        {error && <p className="poll-error">{error}</p>}

        <button
          className="btn btn-primary"
          onClick={() => onFetchQuestions(topic || undefined)}
          disabled={phase === 'loading'}
        >
          {phase === 'loading' ? (
            <>
              <span className="spinner" /> Generating Questions…
            </>
          ) : (
            'Generate Quiz'
          )}
        </button>
      </div>
    );
  }

  if (phase === 'ready') {
    return (
      <div className="arena-host">
        <h2 className="card-title">Quiz Ready</h2>
        <p className="arena-description">
          {totalQuestions} questions loaded. Students will see questions one at a time with a {15}s timer.
        </p>
        <div className="arena-ready-actions">
          <button className="btn btn-secondary" onClick={onReset}>
            Back
          </button>
          <button className="btn btn-primary" onClick={onStartGame}>
            Start Trivia
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'question' && currentQuestion) {
    return (
      <div className="arena-host">
        <div className="arena-question-header">
          <span className="arena-q-number">Q{currentIndex + 1}/{totalQuestions}</span>
          <span className={`arena-countdown ${countdown <= 5 ? 'urgent' : ''}`}>
            {countdown}s
          </span>
        </div>

        <h3 className="arena-host-question">{currentQuestion.question}</h3>

        <div className="arena-host-options">
          {currentQuestion.options.map((opt, i) => (
            <div key={i} className={`arena-host-option ${i === currentQuestion.correctIndex ? 'correct' : ''}`}>
              <span className="poll-option-letter">{String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
            </div>
          ))}
        </div>

        <div className="arena-live-stats">
          <span>{responseCount} {responseCount === 1 ? 'answer' : 'answers'} received</span>
          <button className="btn btn-primary" onClick={onShowLeaderboard}>
            Show Results
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'leaderboard') {
    const isLast = currentIndex >= totalQuestions - 1;
    return (
      <div className="arena-host">
        <Leaderboard
          entries={leaderboard}
          title={`After Q${currentIndex + 1}`}
        />
        <button className="btn btn-primary arena-next-btn" onClick={onNextQuestion}>
          {isLast ? 'Final Results' : `Next Question (Q${currentIndex + 2})`}
        </button>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="arena-host">
        <div className="arena-finished">
          <h2 className="card-title">Game Over</h2>
        </div>
        <Leaderboard entries={leaderboard} title="Final Standings" />
        <button className="btn btn-secondary arena-next-btn" onClick={onReset}>
          New Game
        </button>
      </div>
    );
  }

  return null;
}
