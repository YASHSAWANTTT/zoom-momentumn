// Message types for host ↔ student communication via Zoom SDK sendMessage

export type MessageType =
  // State sync
  | 'FULL_STATE'
  | 'REQUEST_STATE'
  // Warm-Up Arena
  | 'ARENA_START'
  | 'ARENA_QUESTION'
  | 'ARENA_ANSWER'
  | 'ARENA_LEADERBOARD'
  | 'ARENA_END'
  // Live Anchor
  | 'TOPIC_UPDATE'
  | 'BULLET_UPDATE'
  | 'GLOSSARY_UPDATE'
  // Professor's Pulse
  | 'POLL_START'
  | 'POLL_RESPONSE'
  | 'POLL_RESULTS'
  // Zoom SDK Events
  | 'LATE_JOIN_SUMMARY'
  | 'SPEAKER_SPOTLIGHT'
  | 'AUTO_BOOKMARK';

export interface AppMessage {
  type: MessageType;
  payload: unknown;
  seq: number;
  timestamp: number;
  senderId: string;
  senderRole: 'host' | 'student';
}

// --- State types ---

export type AppPhase = 'waiting' | 'arena' | 'lecture' | 'ended';

export interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  rank: number;
  participantId: string;
}

export interface Topic {
  id: string;
  title: string;
  bullets: string[];
  startTime: number;
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  formula?: string;
  timestamp: number;
}

export interface Poll {
  pollId: string;
  question: string;
  options: string[];
  results?: Record<number, number>;
  totalResponses?: number;
}

export interface ArenaState {
  active: boolean;
  currentQuestion: number;
  questions: Question[];
  answers: Map<string, number[]>;
  leaderboard: LeaderboardEntry[];
}

export interface LiveAnchorState {
  topics: Topic[];
  currentTopicId: string;
  glossary: GlossaryEntry[];
}

export interface PulseState {
  activePoll: Poll | null;
  pollHistory: Poll[];
}

export interface MeetingInfo {
  id: string;
  startTime: number;
  participantCount: number;
}

export interface AppState {
  phase: AppPhase;
  arena: ArenaState;
  liveAnchor: LiveAnchorState;
  pulse: PulseState;
  meeting: MeetingInfo;
}

export function createInitialState(): AppState {
  return {
    phase: 'waiting',
    arena: {
      active: false,
      currentQuestion: 0,
      questions: [],
      answers: new Map(),
      leaderboard: [],
    },
    liveAnchor: {
      topics: [],
      currentTopicId: '',
      glossary: [],
    },
    pulse: {
      activePoll: null,
      pollHistory: [],
    },
    meeting: {
      id: '',
      startTime: 0,
      participantCount: 0,
    },
  };
}
