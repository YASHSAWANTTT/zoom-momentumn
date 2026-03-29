interface WelcomeViewProps {
  userName: string;
  isHost: boolean;
  onContinue: () => void;
}

const HOST_FEATURES = [
  {
    title: 'Pulse',
    description: 'Generate AI-powered check-in polls to gauge student understanding in real time. Edit questions before launching and view aggregated results.',
  },
  {
    title: 'Arena',
    description: 'Run a timed trivia game at the start of class. AI generates questions from any topic, and students compete on a live leaderboard.',
  },
  {
    title: 'Anchor',
    description: 'AI analyzes your lecture in real time, creating a topic timeline and glossary that students can follow along with.',
  },
];

const STUDENT_FEATURES = [
  {
    title: 'Live Timeline',
    description: 'Follow along as your professor lectures. Key topics and takeaways appear automatically, updated in real time.',
  },
  {
    title: 'Glossary',
    description: 'Technical terms and definitions are extracted from the lecture and organized in a searchable list.',
  },
  {
    title: 'Bookmark',
    description: 'Mark moments you find confusing. After class, you\'ll receive a personalized review pack with explanations and practice problems.',
  },
];

export function WelcomeView({ userName, isHost, onContinue }: WelcomeViewProps) {
  const features = isHost ? HOST_FEATURES : STUDENT_FEATURES;
  const firstName = userName.split(' ')[0] || userName;

  return (
    <div className="app-container">
      <div className="welcome-view">
        <div className="welcome-header">
          <h1 className="welcome-title">Zoom Momentum</h1>
          <p style={{ fontSize: 13, color: 'var(--zoom-text-secondary)', margin: '4px 0 8px' }}>
            Active learning for virtual classrooms
          </p>
          <p className="welcome-greeting">
            {firstName ? `Welcome, ${firstName}` : 'Welcome'}
          </p>
          <p className="welcome-role">
            {isHost ? 'You are the host of this session.' : 'You\'ve joined as a participant.'}
          </p>
        </div>

        <div className="welcome-features">
          <p className="welcome-section-label">
            {isHost ? 'Your tools for this session' : 'What you\'ll have access to'}
          </p>
          {features.map((feature, i) => (
            <div key={i} className="welcome-feature">
              <div className="welcome-feature-number">{i + 1}</div>
              <div>
                <h3 className="welcome-feature-title">{feature.title}</h3>
                <p className="welcome-feature-desc">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary welcome-cta"
          onClick={onContinue}
          onKeyDown={e => { if (e.key === 'Enter') onContinue(); }}
        >
          {isHost ? 'Open Dashboard' : 'Join Session'}
        </button>
      </div>
    </div>
  );
}
