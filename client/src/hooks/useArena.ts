import { useState, useCallback, useRef, useEffect } from 'react';
import type { Question, LeaderboardEntry, MessageType } from '../types/messages';

export type ArenaHostPhase = 'idle' | 'loading' | 'ready' | 'question' | 'leaderboard' | 'finished';
export type ArenaStudentPhase = 'waiting' | 'question' | 'answered' | 'leaderboard' | 'finished';

const QUESTION_TIME_SEC = 10;
const LEADERBOARD_DISPLAY_SEC = 5;

// --- Host Hook ---

interface ArenaHostState {
  phase: ArenaHostPhase;
  questions: Question[];
  currentIndex: number;
  responses: Map<string, { optionIndex: number; timeMs: number }>;
  scores: Map<string, { name: string; score: number }>;
  leaderboard: LeaderboardEntry[];
  error: string | null;
  countdown: number;
}

interface UseArenaHostOptions {
  broadcast: (type: MessageType, payload: unknown) => void;
}

export function useArenaHost({ broadcast }: UseArenaHostOptions) {
  const [state, setState] = useState<ArenaHostState>({
    phase: 'idle',
    questions: [],
    currentIndex: 0,
    responses: new Map(),
    scores: new Map(),
    leaderboard: [],
    error: null,
    countdown: 0,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionStartRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // Refs for auto-advance (avoid stale closures in timers)
  const showLeaderboardRef = useRef<() => void>(() => {});
  const nextQuestionRef = useRef<() => void>(() => {});

  const fetchQuestions = useCallback(async (topic?: string, transcript?: string) => {
    setState(prev => ({ ...prev, phase: 'loading', error: null }));
    try {
      const res = await fetch('/api/ai/quiz-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, transcript, questionCount: 5 }),
      });
      if (!res.ok) throw new Error('Failed to generate quiz');
      const data = await res.json();
      if (!data.questions?.length) throw new Error('No questions received');

      setState(prev => ({
        ...prev,
        phase: 'ready',
        questions: data.questions,
        currentIndex: 0,
        scores: new Map(),
        leaderboard: [],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load quiz';
      setState(prev => ({ ...prev, phase: 'idle', error: message }));
    }
  }, []);

  const updateQuestion = useCallback((index: number, updates: Partial<Question>) => {
    setState(prev => {
      const questions = [...prev.questions];
      const existing = questions[index];
      if (!existing) return prev;
      questions[index] = {
        question: updates.question ?? existing.question,
        options: updates.options ?? existing.options,
        correctIndex: updates.correctIndex ?? existing.correctIndex,
        explanation: updates.explanation ?? existing.explanation,
      };
      return { ...prev, questions };
    });
  }, []);

  const startCountdown = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      setState(prev => {
        const newCountdown = prev.countdown - 1;
        if (newCountdown <= 0) {
          clearTimer();
          // Auto-show leaderboard when time runs out
          setTimeout(() => showLeaderboardRef.current(), 100);
          return { ...prev, countdown: 0 };
        }
        return { ...prev, countdown: newCountdown };
      });
    }, 1000);
  }, [clearTimer]);

  const startGame = useCallback(() => {
    setState(prev => {
      if (prev.questions.length === 0) return prev;
      broadcast('ARENA_START', { questionCount: prev.questions.length });
      return { ...prev, phase: 'question', currentIndex: 0, responses: new Map(), countdown: QUESTION_TIME_SEC };
    });

    setTimeout(() => {
      setState(prev => {
        const q = prev.questions[0];
        if (!q) return prev;
        broadcast('ARENA_QUESTION', {
          index: 0,
          total: prev.questions.length,
          question: q.question,
          options: q.options,
          timeLimitSec: QUESTION_TIME_SEC,
        });
        questionStartRef.current = Date.now();
        return { ...prev, countdown: QUESTION_TIME_SEC };
      });
    }, 500);

    startCountdown();
  }, [broadcast, startCountdown]);

  const handleAnswer = useCallback((senderId: string, senderName: string, optionIndex: number, questionIndex: number) => {
    const timeMs = Date.now() - questionStartRef.current;
    setState(prev => {
      if (prev.phase !== 'question') return prev;
      if (prev.responses.has(senderId)) return prev;
      if (questionIndex !== prev.currentIndex) return prev;

      const newResponses = new Map(prev.responses);
      newResponses.set(senderId, { optionIndex, timeMs });

      const newScores = new Map(prev.scores);
      const current = newScores.get(senderId) ?? { name: senderName || 'Student', score: 0 };

      const question = prev.questions[prev.currentIndex];
      if (question && optionIndex === question.correctIndex) {
        const speedBonus = Math.max(0, Math.floor((1 - timeMs / (QUESTION_TIME_SEC * 1000)) * 500));
        current.score += 1000 + speedBonus;
      }
      newScores.set(senderId, current);

      return { ...prev, responses: newResponses, scores: newScores };
    });
  }, []);

  const showLeaderboard = useCallback(() => {
    clearTimer();
    setState(prev => {
      if (prev.phase !== 'question') return prev;
      const question = prev.questions[prev.currentIndex];
      const entries: LeaderboardEntry[] = Array.from(prev.scores.entries())
        .map(([participantId, { name, score }]) => ({ participantId, name, score, rank: 0 }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));

      broadcast('ARENA_LEADERBOARD', {
        leaderboard: entries.slice(0, 10),
        questionIndex: prev.currentIndex,
        correctIndex: question?.correctIndex ?? 0,
        explanation: question?.explanation ?? '',
        responseCount: prev.responses.size,
      });

      // Auto-advance to next question after leaderboard display
      autoAdvanceRef.current = setTimeout(() => nextQuestionRef.current(), LEADERBOARD_DISPLAY_SEC * 1000);

      return { ...prev, phase: 'leaderboard', leaderboard: entries, countdown: 0 };
    });
  }, [broadcast, clearTimer]);

  const nextQuestion = useCallback(() => {
    if (autoAdvanceRef.current) { clearTimeout(autoAdvanceRef.current); autoAdvanceRef.current = null; }
    setState(prev => {
      const nextIndex = prev.currentIndex + 1;
      if (nextIndex >= prev.questions.length) {
        broadcast('ARENA_END', { leaderboard: prev.leaderboard.slice(0, 10) });
        return { ...prev, phase: 'finished' };
      }

      const q = prev.questions[nextIndex];
      if (!q) return prev;

      broadcast('ARENA_QUESTION', {
        index: nextIndex,
        total: prev.questions.length,
        question: q.question,
        options: q.options,
        timeLimitSec: QUESTION_TIME_SEC,
      });
      questionStartRef.current = Date.now();

      return {
        ...prev,
        phase: 'question',
        currentIndex: nextIndex,
        responses: new Map(),
        countdown: QUESTION_TIME_SEC,
      };
    });
    startCountdown();
  }, [broadcast, startCountdown]);

  // Keep refs in sync for timer callbacks
  useEffect(() => { showLeaderboardRef.current = showLeaderboard; }, [showLeaderboard]);
  useEffect(() => { nextQuestionRef.current = nextQuestion; }, [nextQuestion]);

  const resetArena = useCallback(() => {
    clearTimer();
    setState({
      phase: 'idle',
      questions: [],
      currentIndex: 0,
      responses: new Map(),
      scores: new Map(),
      leaderboard: [],
      error: null,
      countdown: 0,
    });
  }, [clearTimer]);

  return {
    ...state,
    responseCount: state.responses.size,
    currentQuestion: state.questions[state.currentIndex] ?? null,
    totalQuestions: state.questions.length,
    fetchQuestions,
    updateQuestion,
    startGame,
    handleAnswer,
    showLeaderboard,
    nextQuestion,
    resetArena,
  };
}

// --- Student Hook ---

interface ArenaStudentState {
  phase: ArenaStudentPhase;
  currentQuestion: {
    index: number;
    total: number;
    question: string;
    options: string[];
    timeLimitSec: number;
  } | null;
  selectedOption: number | null;
  countdown: number;
  leaderboard: LeaderboardEntry[];
  correctIndex: number | null;
  explanation: string;
  finalLeaderboard: LeaderboardEntry[];
}

interface UseArenaStudentOptions {
  send: (type: MessageType, payload: unknown) => void;
  participantName: string;
}

export function useArenaStudent({ send, participantName }: UseArenaStudentOptions) {
  const [state, setState] = useState<ArenaStudentState>({
    phase: 'waiting',
    currentQuestion: null,
    selectedOption: null,
    countdown: 0,
    leaderboard: [],
    correctIndex: null,
    explanation: '',
    finalLeaderboard: [],
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleArenaStart = useCallback(() => {
    setState(prev => ({
      ...prev,
      phase: 'waiting',
      finalLeaderboard: [],
    }));
  }, []);

  const handleQuestion = useCallback((payload: ArenaStudentState['currentQuestion']) => {
    clearTimer();
    setState(prev => ({
      ...prev,
      phase: 'question',
      currentQuestion: payload,
      selectedOption: null,
      countdown: payload?.timeLimitSec ?? QUESTION_TIME_SEC,
      correctIndex: null,
      explanation: '',
    }));

    // Start countdown
    timerRef.current = setInterval(() => {
      setState(prev => {
        const newCountdown = prev.countdown - 1;
        if (newCountdown <= 0) {
          clearTimer();
          return { ...prev, countdown: 0 };
        }
        return { ...prev, countdown: newCountdown };
      });
    }, 1000);
  }, [clearTimer]);

  const selectAndSubmit = useCallback((optionIndex: number) => {
    setState(prev => {
      if (prev.phase !== 'question' || prev.selectedOption !== null || prev.countdown <= 0) return prev;

      send('ARENA_ANSWER', {
        optionIndex,
        questionIndex: prev.currentQuestion?.index ?? 0,
        name: participantName,
      });

      return { ...prev, phase: 'answered', selectedOption: optionIndex };
    });
  }, [send, participantName]);

  const handleLeaderboard = useCallback((payload: {
    leaderboard: LeaderboardEntry[];
    correctIndex: number;
    explanation: string;
  }) => {
    clearTimer();
    setState(prev => ({
      ...prev,
      phase: 'leaderboard',
      leaderboard: payload.leaderboard,
      correctIndex: payload.correctIndex,
      explanation: payload.explanation,
      countdown: 0,
    }));
  }, [clearTimer]);

  const handleArenaEnd = useCallback((payload: { leaderboard: LeaderboardEntry[] }) => {
    clearTimer();
    setState(prev => ({
      ...prev,
      phase: 'finished',
      finalLeaderboard: payload.leaderboard,
      countdown: 0,
    }));
  }, [clearTimer]);

  return {
    ...state,
    handleArenaStart,
    handleQuestion,
    selectAndSubmit,
    handleLeaderboard,
    handleArenaEnd,
  };
}
