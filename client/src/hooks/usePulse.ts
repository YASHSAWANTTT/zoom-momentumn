import { useState, useCallback, useRef } from 'react';
import type { Poll, MessageType } from '../types/messages';

export interface PollDraft {
  question: string;
  options: string[];
  isFallback: boolean;
}

export type PulsePhase = 'idle' | 'generating' | 'preview' | 'live' | 'results';

interface PulseHostState {
  phase: PulsePhase;
  draft: PollDraft | null;
  activePoll: Poll | null;
  responses: Map<string, number>;
  error: string | null;
}

interface PulseStudentState {
  activePoll: Poll | null;
  selectedOption: number | null;
  hasAnswered: boolean;
  results: Poll | null;
}

interface UsePulseHostOptions {
  broadcast: (type: MessageType, payload: unknown) => void;
}

interface UsePulseStudentOptions {
  send: (type: MessageType, payload: unknown) => void;
}

export function usePulseHost({ broadcast }: UsePulseHostOptions) {
  const [state, setState] = useState<PulseHostState>({
    phase: 'idle',
    draft: null,
    activePoll: null,
    responses: new Map(),
    error: null,
  });
  const pollIdRef = useRef(0);

  const generatePoll = useCallback(async (context?: string, currentTopic?: string) => {
    setState(prev => ({ ...prev, phase: 'generating', error: null }));

    try {
      const res = await fetch('/api/ai/poll-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, currentTopic }),
      });

      if (!res.ok) throw new Error('Failed to generate poll');
      const data = await res.json();

      setState(prev => ({
        ...prev,
        phase: 'preview',
        draft: {
          question: data.question,
          options: data.options,
          isFallback: !!data.fallback,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate poll';
      setState(prev => ({ ...prev, phase: 'idle', error: message }));
    }
  }, []);

  const updateDraft = useCallback((updates: Partial<PollDraft>) => {
    setState(prev => {
      if (!prev.draft) return prev;
      return { ...prev, draft: { ...prev.draft, ...updates } };
    });
  }, []);

  const launchPoll = useCallback(() => {
    setState(prev => {
      if (!prev.draft) return prev;

      pollIdRef.current += 1;
      const poll: Poll = {
        pollId: `poll-${pollIdRef.current}-${Date.now()}`,
        question: prev.draft.question,
        options: prev.draft.options,
      };

      broadcast('POLL_START', poll);

      return {
        ...prev,
        phase: 'live',
        activePoll: poll,
        responses: new Map(),
        draft: null,
      };
    });
  }, [broadcast]);

  const handleResponse = useCallback((senderId: string, pollId: string, optionIndex: number) => {
    setState(prev => {
      if (prev.phase !== 'live' || !prev.activePoll || prev.activePoll.pollId !== pollId) {
        return prev;
      }
      const newResponses = new Map(prev.responses);
      newResponses.set(senderId, optionIndex);
      return { ...prev, responses: newResponses };
    });
  }, []);

  const endPoll = useCallback(() => {
    setState(prev => {
      if (!prev.activePoll) return prev;

      const results: Record<number, number> = {};
      for (const optionIndex of prev.responses.values()) {
        results[optionIndex] = (results[optionIndex] ?? 0) + 1;
      }

      const pollWithResults: Poll = {
        ...prev.activePoll,
        results,
        totalResponses: prev.responses.size,
      };

      broadcast('POLL_RESULTS', pollWithResults);

      return {
        ...prev,
        phase: 'results',
        activePoll: pollWithResults,
      };
    });
  }, [broadcast]);

  const resetPoll = useCallback(() => {
    setState({
      phase: 'idle',
      draft: null,
      activePoll: null,
      responses: new Map(),
      error: null,
    });
  }, []);

  return {
    ...state,
    responseCount: state.responses.size,
    generatePoll,
    updateDraft,
    launchPoll,
    handleResponse,
    endPoll,
    resetPoll,
  };
}

export function usePulseStudent({ send }: UsePulseStudentOptions) {
  const [state, setState] = useState<PulseStudentState>({
    activePoll: null,
    selectedOption: null,
    hasAnswered: false,
    results: null,
  });

  const handlePollStart = useCallback((poll: Poll) => {
    setState({
      activePoll: poll,
      selectedOption: null,
      hasAnswered: false,
      results: null,
    });
  }, []);

  const selectOption = useCallback((index: number) => {
    setState(prev => {
      if (prev.hasAnswered) return prev;
      return { ...prev, selectedOption: index };
    });
  }, []);

  const submitAnswer = useCallback(() => {
    setState(prev => {
      if (prev.selectedOption === null || !prev.activePoll) return prev;

      send('POLL_RESPONSE', {
        pollId: prev.activePoll.pollId,
        optionIndex: prev.selectedOption,
      });

      return { ...prev, hasAnswered: true };
    });
  }, [send]);

  const handlePollResults = useCallback((poll: Poll) => {
    setState(prev => ({
      ...prev,
      results: poll,
      activePoll: null,
    }));
  }, []);

  return {
    ...state,
    handlePollStart,
    selectOption,
    submitAnswer,
    handlePollResults,
  };
}
