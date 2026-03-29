import { useState, useCallback, useEffect } from 'react';
import zoomSdk from '@zoom/appssdk';
import type { MessageType } from '../types/messages';

interface UseZoomEventsOptions {
  isHost: boolean;
  broadcast: (type: MessageType, payload: unknown) => void;
  onMeetingEnd: () => void;
}

export function useZoomEvents({ isHost, broadcast, onMeetingEnd }: UseZoomEventsOptions) {
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [lateJoinInfo, setLateJoinInfo] = useState<{ topicCount: number; latestTopic: string } | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [smartSpotlightEnabled, setSmartSpotlightEnabled] = useState(true);
  const [lastSpotlightParticipantId, setLastSpotlightParticipantId] = useState<string | null>(null);

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
  }, [onMeetingEnd]);

  // Active speaker tracking (host only):
  // When active speaker changes, broadcast SPEAKER_SPOTLIGHT
  useEffect(() => {
    if (!isHost) return;
    try {
      zoomSdk.onActiveSpeakerChange(async (event) => {
        const speaker = event.users?.[0];
        if (speaker) {
          setActiveSpeaker(speaker.screenName);
          broadcast('SPEAKER_SPOTLIGHT', {
            speakerName: speaker.screenName,
            participantId: speaker.participantUUID,
            timestamp: Date.now(),
          });

          // Smart Spotlight: spotlight active student speaker when enabled
          if (smartSpotlightEnabled) {
            const participantId = speaker.participantUUID;
            // Remove previous spotlight if it changed
            if (lastSpotlightParticipantId && lastSpotlightParticipantId !== participantId) {
              try {
                await zoomSdk.removeParticipantSpotlights({
                  participantUUIDs: [lastSpotlightParticipantId],
                });
              } catch {
                // ignore spotlight errors
              }
            }
            // Add spotlight for the new speaker
            try {
              await zoomSdk.addParticipantSpotlight({ participantUUID: participantId });
              setLastSpotlightParticipantId(participantId);
            } catch {
              // ignore spotlight errors
            }
          }
        }
      });
    } catch {
      // Not in Zoom context
    }
  }, [isHost, broadcast, smartSpotlightEnabled, lastSpotlightParticipantId]);

  const dismissLateJoinInfo = useCallback(() => setLateJoinInfo(null), []);

  return {
    meetingEnded,
    lateJoinInfo,
    activeSpeaker,
    smartSpotlightEnabled,
    setSmartSpotlightEnabled,
    handleFullState,
    dismissLateJoinInfo,
  };
}
