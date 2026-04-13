import { useState, useCallback, useRef, useEffect } from 'react';
import type { Topic, GlossaryEntry } from '../types/messages';
import type { MessageType } from '../types/messages';
import { startRTMS, stopRTMS } from './useZoomSdk';

const STOP_WORDS = new Set(['a','an','the','and','or','of','in','on','to','for','with','is','are','was','were','by','at','from','as','how','what','why','when','where','using','about','into','through','during','its','this','that']);

function tokenize(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.min(wordsA.size, wordsB.size);
}

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
  meetingId: string;
  isInZoom: boolean;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function useAnchorHost({ broadcast, meetingId, isInZoom }: UseAnchorHostOptions) {
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

  const pollTranscript = useCallback(async () => {
    if (pollingRef.current) return;
    if (!meetingId) return; // no meeting context (browser/dev mode)
    pollingRef.current = true;

    try {
      // 1. Fetch the rolling transcript buffer (try real meetingId, fall back to mock)
      let bufferRes = await fetch(`/api/transcript/buffer?meetingId=${encodeURIComponent(meetingId)}`);
      let { buffer } = bufferRes.ok ? await bufferRes.json() : { buffer: '' };

      if (!buffer || buffer.trim().length < 20) {
        // Fall back to mock transcript for dev/testing
        bufferRes = await fetch('/api/transcript/buffer?meetingId=mock-meeting-001');
        const fallback = bufferRes.ok ? await bufferRes.json() : { buffer: '' };
        buffer = fallback.buffer;
      }

      if (!buffer || buffer.trim().length < 20) {
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
        body: JSON.stringify({ transcript: buffer, previousTopic }),
      });
      if (!segRes.ok) throw new Error('Topic segment request failed');
      const result = await segRes.json();

      const now = Date.now();

      // 4. Process topic
      if (result.topic?.title) {
        // Check if a topic with similar title already exists to avoid duplicates
        const existingByTitle = state.topics.find(t =>
          t.title.toLowerCase() === result.topic.title.toLowerCase() ||
          titleSimilarity(t.title, result.topic.title) >= 0.6
        );
        const topicId = existingByTitle
          ? existingByTitle.id
          : result.topicChanged
            ? `topic-${now}`
            : state.currentTopicId || `topic-${now}`;

        const newTopic: Topic = {
          id: topicId,
          title: result.topic.title,
          bullets: result.topic.bullets ?? [],
          startTime: existingByTitle?.startTime ?? (result.topicChanged ? now : (state.topics.find(t => t.id === topicId)?.startTime ?? now)),
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
      if (buffer && buffer.trim().length >= 20) {
        try {
          const cueRes = await fetch('/api/ai/detect-cues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: buffer }),
          });
          if (cueRes.ok) {
            const cueResult = await cueRes.json();
            if (cueResult.hasCue) {
              const currentTopicTitle = result.topic?.title ?? state.topics.find(t => t.id === state.currentTopicId)?.title ?? 'Unknown';
              broadcast('AUTO_BOOKMARK', {
                topic: currentTopicTitle,
                cues: cueResult.cues,
                timestamp: Date.now(),
              });
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
  }, [broadcast, meetingId, state.currentTopicId, state.topics]);

  const startPolling = useCallback(async () => {
    if (timerRef.current) return;
    setState(prev => ({ ...prev, isPolling: true }));

    if (isInZoom) {
      const ok = await startRTMS();
      console.log(`[anchor] RTMS start ${ok ? 'succeeded' : 'failed (will poll anyway)'}`);
    }

    // Poll immediately, then on interval
    pollTranscript();
    timerRef.current = setInterval(pollTranscript, POLL_INTERVAL_MS);
  }, [pollTranscript, isInZoom]);

  const stopPolling = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState(prev => ({ ...prev, isPolling: false }));

    if (isInZoom) {
      const ok = await stopRTMS();
      console.log(`[anchor] RTMS stop ${ok ? 'succeeded' : 'failed'}`);
    }
  }, [isInZoom]);

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
