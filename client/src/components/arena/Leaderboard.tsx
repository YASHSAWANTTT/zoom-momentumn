import type { LeaderboardEntry } from '../../types/messages';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  title: string;
  compact?: boolean;
}

export function Leaderboard({ entries, title, compact }: LeaderboardProps) {
  const displayed = compact ? entries.slice(0, 5) : entries.slice(0, 10);

  return (
    <div className={`leaderboard ${compact ? 'compact' : ''}`}>
      <h3 className="leaderboard-title">{title}</h3>
      {displayed.length === 0 ? (
        <p className="leaderboard-empty">No scores yet</p>
      ) : (
        <div className="leaderboard-list">
          {displayed.map((entry) => (
            <div key={entry.participantId} className={`leaderboard-row ${entry.rank <= 3 ? 'top-three' : ''}`}>
              <span className="leaderboard-rank">#{entry.rank}</span>
              <span className="leaderboard-name">{entry.name}</span>
              <span className="leaderboard-score">{entry.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
