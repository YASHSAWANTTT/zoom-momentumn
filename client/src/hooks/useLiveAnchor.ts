import { useState, useCallback, useRef, useEffect } from 'react';
import type { Topic, GlossaryEntry } from '../types/messages';
import type { MessageType } from '../types/messages';

// --------------- Host Hook ---------------

interface AnchorHostState {
  topics: Topic[];
  currentTopicId: string;
  glossary: GlossaryEntry[];
  isPolling: boolean;
  lastPollTime: number;
  error: string | null;
}

interface UseAnchorHostOptions {
  broadcast: (type: MessageType, payload: unknown) => void;
  /** Zoom meeting UUID — must match RTMS / transcript rows (same as `useZoomSdk` meetingId). */
  meetingId: string;
  /** When set, transcript buffer is filtered to this speaker (match RTMS `userName` / host display name). */
  hostSpeakerName?: string;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds
/** Min time between AUTO_BOOKMARK broadcasts for the same cue fingerprint */
const CUE_COOLDOWN_MS = 90_000;

export function useAnchorHost({ broadcast, meetingId, hostSpeakerName }: UseAnchorHostOptions) {
  const [state, setState] = useState<AnchorHostState>({
    topics: [],
    currentTopicId: '',
    glossary: [],
    isPolling: false,
    lastPollTime: 0,
    error: null,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef(false); // guard against concurrent fetches
  const lastCueAtRef = useRef(0);
  const lastCueKeyRef = useRef('');

  const bufferUrl = useCallback(() => {
    const params = new URLSearchParams({ meetingId: meetingId ?? '' });
    const host = hostSpeakerName?.trim();
    if (host) params.set('hostSpeaker', host);
    return `/api/transcript/buffer?${params}`;
  }, [meetingId, hostSpeakerName]);

  const pollTranscript = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;

    try {
      if (!meetingId?.trim()) {
        setState(prev => ({ ...prev, error: 'Meeting ID required for transcript buffer (open inside a Zoom meeting).' }));
        pollingRef.current = false;
        return;
      }

      // 1. Rolling buffer — RTMS + mock POST to same table; optional hostSpeaker = professor only
      const bufferRes = await fetch(bufferUrl());
      if (!bufferRes.ok) throw new Error('Failed to fetch transcript buffer');
      const data = (await bufferRes.json()) as {
        buffer?: string;
        degraded?: boolean;
        reason?: string;
      };

      if (data.degraded && data.reason === 'database_unavailable') {
        setState(prev => ({
          ...prev,
          error:
            'Transcript unavailable: the API cannot reach PostgreSQL. Set DATABASE_URL on Railway (e.g. Neon pooled URL with sslmode=require).',
        }));
        return;
      }

      setState(prev => ({ ...prev, error: null }));

      const text = typeof data.buffer === 'string' ? data.buffer : '';

      if (!text || text.trim().length < 20) {
        pollingRef.current = false;
        return; // not enough transcript yet
      }

      // 2. Get current topic title for context
      const previousTopic = state.currentTopicId
        ? state.topics.find(t => t.id === state.currentTopicId)?.title ?? ''
        : '';

      // 3. Call AI topic-segment
      const segRes = await fetch('/api/ai/topic-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, previousTopic }),
      });
      if (!segRes.ok) throw new Error('Topic segment request failed');
      const result = await segRes.json();

      const now = Date.now();

      // 4. Process topic
      if (result.topic?.title) {
        const topicId = result.topicChanged
          ? `topic-${now}`
          : state.currentTopicId || `topic-${now}`;

        const newTopic: Topic = {
          id: topicId,
          title: result.topic.title,
          bullets: result.topic.bullets ?? [],
          startTime: result.topicChanged ? now : (state.topics.find(t => t.id === topicId)?.startTime ?? now),
        };

        setState(prev => {
          const existing = prev.topics.findIndex(t => t.id === topicId);
          const updatedTopics = [...prev.topics];
          if (existing >= 0) {
            updatedTopics[existing] = newTopic;
          } else {
            updatedTopics.push(newTopic);
          }
          return {
            ...prev,
            topics: updatedTopics,
            currentTopicId: topicId,
            lastPollTime: now,
            error: null,
          };
        });

        // Broadcast to students
        broadcast('TOPIC_UPDATE', {
          topic: newTopic,
          topicChanged: result.topicChanged,
        });
      }

      // 5. Detect cues for auto-bookmark
      if (text && text.trim().length >= 20) {
        try {
          const cueRes = await fetch('/api/ai/detect-cues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: text }),
          });
          if (cueRes.ok) {
            const cueResult = await cueRes.json();
            if (cueResult.hasCue) {
              const cueKey = JSON.stringify(cueResult.cues ?? []);
              const now = Date.now();
              if (
                cueKey === lastCueKeyRef.current &&
                now - lastCueAtRef.current < CUE_COOLDOWN_MS
              ) {
                // same cue still in buffer — avoid spamming students
              } else {
                lastCueKeyRef.current = cueKey;
                lastCueAtRef.current = now;
                const currentTopicTitle =
                  result.topic?.title ??
                  state.topics.find((t) => t.id === state.currentTopicId)?.title ??
                  'Unknown';
                broadcast('AUTO_BOOKMARK', {
                  topic: currentTopicTitle,
                  cues: cueResult.cues,
                  timestamp: now,
                });
              }
            }
          }
        } catch (cueErr) {
          console.error('[anchor] detect-cues error:', cueErr);
        }
      }

      // 6. Process glossary terms
      if (Array.isArray(result.glossaryTerms) && result.glossaryTerms.length > 0) {
        const newTerms: GlossaryEntry[] = result.glossaryTerms.map((t: any) => ({
          term: t.term,
          definition: t.definition,
          formula: t.formula || undefined,
          timestamp: now,
        }));

        setState(prev => {
          // Deduplicate by term name (case-insensitive)
          const existingTerms = new Set(prev.glossary.map(g => g.term.toLowerCase()));
          const uniqueNew = newTerms.filter(t => !existingTerms.has(t.term.toLowerCase()));
          if (uniqueNew.length === 0) return prev;
          return { ...prev, glossary: [...prev.glossary, ...uniqueNew] };
        });

        broadcast('GLOSSARY_UPDATE', { terms: newTerms });
      }
    } catch (err) {
      console.error('[anchor] poll error:', err);
      setState(prev => ({ ...prev, error: String(err) }));
    } finally {
      pollingRef.current = false;
    }
  }, [broadcast, meetingId, state.currentTopicId, state.topics, bufferUrl]);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    if (!meetingId?.trim()) {
      setState(prev => ({
        ...prev,
        error: 'Meeting ID unavailable — start Live Anchor from inside a Zoom meeting.',
      }));
      return;
    }
    setState(prev => ({ ...prev, isPolling: true }));
    // Poll immediately, then on interval
    pollTranscript();
    timerRef.current = setInterval(pollTranscript, POLL_INTERVAL_MS);
  }, [pollTranscript, meetingId]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const resetAnchor = useCallback(() => {
    stopPolling();
    setState({
      topics: [],
      currentTopicId: '',
      glossary: [],
      isPolling: false,
      lastPollTime: 0,
      error: null,
    });
  }, [stopPolling]);

  return {
    topics: state.topics,
    currentTopicId: state.currentTopicId,
    glossary: state.glossary,
    isPolling: state.isPolling,
    lastPollTime: state.lastPollTime,
    error: state.error,
    startPolling,
    stopPolling,
    pollTranscript, // manual trigger
    resetAnchor,
  };
}

// --------------- Student Hook ---------------

interface AnchorStudentState {
  topics: Topic[];
  currentTopicId: string;
  glossary: GlossaryEntry[];
  bookmarks: AnchorBookmark[];
}

interface UseAnchorStudentOptions {
  send: (type: MessageType, payload: unknown) => void;
}

export interface AnchorBookmark {
  topic: string;
  timestamp: number;
  isAuto: boolean;
  transcriptSnippet?: string;
}

export function useAnchorStudent({ send: _send }: UseAnchorStudentOptions) {
  const [state, setState] = useState<AnchorStudentState>({
    topics: [],
    currentTopicId: '',
    glossary: [],
    bookmarks: [],
  });

  const handleTopicUpdate = useCallback((payload: { topic: Topic; topicChanged: boolean }) => {
    setState(prev => {
      const existing = prev.topics.findIndex(t => t.id === payload.topic.id);
      const updatedTopics = [...prev.topics];
      if (existing >= 0) {
        updatedTopics[existing] = payload.topic;
      } else {
        updatedTopics.push(payload.topic);
      }
      return {
        ...prev,
        topics: updatedTopics,
        currentTopicId: payload.topic.id,
      };
    });
  }, []);

  const handleGlossaryUpdate = useCallback((payload: { terms: GlossaryEntry[] }) => {
    setState(prev => {
      const existingTerms = new Set(prev.glossary.map(g => g.term.toLowerCase()));
      const uniqueNew = payload.terms.filter(t => !existingTerms.has(t.term.toLowerCase()));
      if (uniqueNew.length === 0) return prev;
      return { ...prev, glossary: [...prev.glossary, ...uniqueNew] };
    });
  }, []);

  const bookmarkCurrentTopic = useCallback(async (
    meetingId: string,
    userId: string,
    options?: {
      topicOverride?: string;
      isAuto?: boolean;
      transcriptSnippet?: string;
      timestamp?: number;
    },
  ) => {
    if (!userId) return false;
    const topic = state.topics.find(t => t.id === state.currentTopicId);
    const topicLabel = options?.topicOverride || (topic ? topic.title : 'I\'m Confused');
    const timestamp = options?.timestamp ?? Date.now();
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          userId,
          topic: topicLabel,
          timestamp,
          transcriptSnippet: options?.transcriptSnippet,
          isAuto: options?.isAuto ?? false,
        }),
      });
      if (res.ok) {
        setState(prev => ({
          ...prev,
          bookmarks: [...prev.bookmarks, {
            topic: topicLabel,
            timestamp,
            isAuto: options?.isAuto ?? false,
            transcriptSnippet: options?.transcriptSnippet,
          }],
        }));
      }
      return res.ok;
    } catch (err) {
      console.error('[anchor] bookmark error:', err);
      return false;
    }
  }, [state.currentTopicId, state.topics]);

  return {
    topics: state.topics,
    currentTopicId: state.currentTopicId,
    glossary: state.glossary,
    bookmarks: state.bookmarks,
    handleTopicUpdate,
    handleGlossaryUpdate,
    bookmarkCurrentTopic,
  };
}
