import { Leaderboard } from './Leaderboard';
import type { ArenaStudentPhase } from '../../hooks/useArena';
import type { LeaderboardEntry } from '../../types/messages';

interface ArenaStudentProps {
  phase: ArenaStudentPhase;
  currentQuestion: {
    index: number;
    total: number;
    question: string;
    options: string[];
  } | null;
  selectedOption: number | null;
  countdown: number;
  leaderboard: LeaderboardEntry[];
  correctIndex: number | null;
  explanation: string;
  finalLeaderboard: LeaderboardEntry[];
  onSelectAndSubmit: (optionIndex: number) => void;
}

export function ArenaStudent({
  phase,
  currentQuestion,
  selectedOption,
  countdown,
  leaderboard,
  correctIndex,
  explanation,
  finalLeaderboard,
  onSelectAndSubmit,
}: ArenaStudentProps) {
  if (phase === 'waiting') {
    return (
      <div className="arena-student-overlay">
        <div className="arena-student-card">
          <div className="arena-waiting">
            <h3>Warm-Up Arena</h3>
            <p>Get ready — the trivia is about to begin.</p>
            <div className="arena-waiting-dots">
              <span className="dot-bounce" />
              <span className="dot-bounce" style={{ animationDelay: '0.2s' }} />
              <span className="dot-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if ((phase === 'question' || phase === 'answered') && currentQuestion) {
    const hasAnswered = phase === 'answered';

    return (
      <div className="arena-student-overlay">
        <div className="arena-student-card">
          <div className="arena-question-header">
            <span className="arena-q-number">Q{currentQuestion.index + 1}/{currentQuestion.total}</span>
            <span className={`arena-countdown ${countdown <= 5 ? 'urgent' : ''}`}>
              {countdown}s
            </span>
          </div>

          <h3 className="arena-student-question">{currentQuestion.question}</h3>

          <div className="arena-student-options">
            {currentQuestion.options.map((option, i) => (
              <button
                key={i}
                className={`arena-option-btn ${selectedOption === i ? 'selected' : ''} ${hasAnswered ? 'locked' : ''}`}
                onClick={() => !hasAnswered && onSelectAndSubmit(i)}
                disabled={hasAnswered}
              >
                <span className="poll-option-letter">{String.fromCharCode(65 + i)}</span>
                <span className="arena-option-text">{option}</span>
              </button>
            ))}
          </div>

          {hasAnswered && (
            <div className="arena-answered-msg">
              Locked in — waiting for results…
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'leaderboard') {
    return (
      <div className="arena-student-overlay">
        <div className="arena-student-card">
          {correctIndex !== null && (
            <div className="arena-answer-reveal">
              <span className="arena-correct-label">Correct Answer</span>
              <span className="arena-correct-answer">
                {String.fromCharCode(65 + correctIndex)}
              </span>
              {selectedOption === correctIndex ? (
                <span className="arena-result-correct">Correct</span>
              ) : (
                <span className="arena-result-wrong">Incorrect</span>
              )}
              {explanation && <p className="arena-explanation">{explanation}</p>}
            </div>
          )}
          <Leaderboard entries={leaderboard} title="Leaderboard" compact />
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="arena-student-overlay">
        <div className="arena-student-card">
          <div className="arena-finished">
            <h2 className="card-title">Game Over</h2>
          </div>
          <Leaderboard entries={finalLeaderboard} title="Final Standings" />
        </div>
      </div>
    );
  }

  return null;
}
