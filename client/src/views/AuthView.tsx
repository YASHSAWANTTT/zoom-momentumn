interface AuthViewProps {
  onLogin: () => void;
  isLoading: boolean;
  error: string | null;
}

export function AuthView({ onLogin, isLoading, error }: AuthViewProps) {
  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="card" style={{ textAlign: 'center', maxWidth: 320 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Zoom Momentum</h1>
        <p style={{ color: 'var(--zoom-text-secondary)', marginBottom: 16 }}>
          Transform your virtual classroom into an active learning space.
        </p>
        {error && (
          <p style={{ color: 'var(--zoom-error)', fontSize: 12, marginBottom: 12 }}>{error}</p>
        )}
        <button className="btn btn-primary" onClick={onLogin} disabled={isLoading}>
          {isLoading ? 'Connecting…' : 'Sign in with Zoom'}
        </button>
      </div>
    </div>
  );
}
