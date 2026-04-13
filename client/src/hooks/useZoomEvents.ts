import { useState, useCallback, useEffect } from 'react';
import type { MessageType } from '../types/messages';

const zoomSdk = (window as any).zoomSdk as any | undefined;

interface UseZoomEventsOptions {
  isHost: boolean;
  broadcast: (type: MessageType, payload: unknown) => void;
  onMeetingEnd: () => void;
  /** Wait until zoomSdk.config() has finished — registering listeners earlier triggers SDK warnings. */
  zoomSdkReady: boolean;
}

export function useZoomEvents({ isHost, broadcast, onMeetingEnd, zoomSdkReady }: UseZoomEventsOptions) {
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [lateJoinInfo, setLateJoinInfo] = useState<{ topicCount: number; latestTopic: string } | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);

  // Late joiner detection:
  // When a student receives FULL_STATE with existing topics, show catch-up info
  const handleFullState = useCallback((payload: any) => {
    const fullStateTopics = payload?.liveAnchor?.topics;
    if (Array.isArray(fullStateTopics) && fullStateTopics.length > 0) {
      setLateJoinInfo({
        topicCount: fullStateTopics.length,
        latestTopic: fullStateTopics[fullStateTopics.length - 1]?.title ?? 'Unknown',
      });
      // Auto-dismiss after 8 seconds
      setTimeout(() => setLateJoinInfo(null), 8000);
    }
  }, []);

  // Meeting end detection:
  // Use zoomSdk.onRunningContextChange() to detect leaving the meeting
  useEffect(() => {
    if (!zoomSdk || !zoomSdkReady) return;
    try {
      zoomSdk.onRunningContextChange((event: { runningContext: string }) => {
        if (event.runningContext !== 'inMeeting' && event.runningContext !== 'inWebinar') {
          setMeetingEnded(true);
          onMeetingEnd();
        }
      });
    } catch {
      // Not in Zoom context (dev mode)
    }
  }, [onMeetingEnd, zoomSdkReady]);

  // Active speaker tracking (host only):
  // When active speaker changes, broadcast SPEAKER_SPOTLIGHT
  useEffect(() => {
    if (!isHost || !zoomSdk || !zoomSdkReady) return;
    try {
      zoomSdk.onActiveSpeakerChange((event: any) => {
        const speaker = event.users?.[0];
        if (speaker) {
          setActiveSpeaker(speaker.screenName);
          broadcast('SPEAKER_SPOTLIGHT', {
            speakerName: speaker.screenName,
            participantId: speaker.participantUUID,
            timestamp: Date.now(),
          });
        }
      });
    } catch {
      // Not in Zoom context
    }
  }, [isHost, broadcast, zoomSdkReady]);

  const dismissLateJoinInfo = useCallback(() => setLateJoinInfo(null), []);

  const simulateLateJoin = useCallback((info: { topicCount: number; latestTopic: string }) => {
    setLateJoinInfo(info);
    setTimeout(() => setLateJoinInfo(null), 8000);
  }, []);

  const simulateMeetingEnd = useCallback(() => {
    setMeetingEnded(true);
    onMeetingEnd();
  }, [onMeetingEnd]);

  return {
    meetingEnded,
    lateJoinInfo,
    activeSpeaker,
    handleFullState,
    dismissLateJoinInfo,
    simulateLateJoin,
    simulateMeetingEnd,
  };
}
