import { useState, useCallback, useEffect, useRef } from 'react';
import zoomSdk from '@zoom/appssdk';
import type { MessageType } from '../types/messages';

interface UseZoomEventsOptions {
  isHost: boolean;
  broadcast: (type: MessageType, payload: unknown) => void;
  onMeetingEnd: () => void;
  /** Host's participant UUID — used to skip spotlighting the professor */
  hostParticipantId?: string;
}

export function useZoomEvents({
  isHost,
  broadcast,
  onMeetingEnd,
  hostParticipantId = '',
}: UseZoomEventsOptions) {
  const [meetingEnded, setMeetingEnded] = useState(false);
  const [lateJoinInfo, setLateJoinInfo] = useState<{ topicCount: number; latestTopic: string } | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [smartSpotlightEnabled, setSmartSpotlightEnabled] = useState(true);

  const hasShownLateJoinRef = useRef(false);
  const smartSpotlightRef = useRef(smartSpotlightEnabled);
  const lastSpotlightParticipantIdRef = useRef<string | null>(null);
  const hostParticipantIdRef = useRef(hostParticipantId);

  useEffect(() => {
    smartSpotlightRef.current = smartSpotlightEnabled;
  }, [smartSpotlightEnabled]);

  useEffect(() => {
    hostParticipantIdRef.current = hostParticipantId;
  }, [hostParticipantId]);

  // Late joiner: show once when we first see topics in FULL_STATE (not on every host rebroadcast)
  const handleFullState = useCallback((payload: unknown) => {
    if (hasShownLateJoinRef.current) return;
    const p = payload as { liveAnchor?: { topics?: unknown[] } } | null;
    const fullStateTopics = p?.liveAnchor?.topics;
    if (Array.isArray(fullStateTopics) && fullStateTopics.length > 0) {
      hasShownLateJoinRef.current = true;
      setLateJoinInfo({
        topicCount: fullStateTopics.length,
        latestTopic: (fullStateTopics[fullStateTopics.length - 1] as { title?: string })?.title ?? 'Unknown',
      });
      setTimeout(() => setLateJoinInfo(null), 8000);
    }
  }, []);

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

  useEffect(() => {
    if (!isHost) return;
    try {
      zoomSdk.onActiveSpeakerChange(async (event) => {
        const speaker = event.users?.[0];
        if (!speaker) return;

        setActiveSpeaker(speaker.screenName);
        broadcast('SPEAKER_SPOTLIGHT', {
          speakerName: speaker.screenName,
          participantId: speaker.participantUUID,
          timestamp: Date.now(),
        });

        const hostId = hostParticipantIdRef.current;
        if (!hostId) {
          // Wait until we have the host UUID; avoids spotlighting the professor when id is still empty
          return;
        }
        const isProfessor = speaker.participantUUID === hostId;

        // Do not spotlight the host — spotlight is for student questions / discussion
        if (isProfessor) {
          if (lastSpotlightParticipantIdRef.current) {
            try {
              await zoomSdk.removeParticipantSpotlights({
                participantUUIDs: [lastSpotlightParticipantIdRef.current],
              });
            } catch {
              /* ignore */
            }
            lastSpotlightParticipantIdRef.current = null;
          }
          return;
        }

        if (!smartSpotlightRef.current) return;

        const participantId = speaker.participantUUID;
        if (lastSpotlightParticipantIdRef.current && lastSpotlightParticipantIdRef.current !== participantId) {
          try {
            await zoomSdk.removeParticipantSpotlights({
              participantUUIDs: [lastSpotlightParticipantIdRef.current],
            });
          } catch {
            /* ignore */
          }
        }
        try {
          await zoomSdk.addParticipantSpotlight({ participantUUID: participantId });
          lastSpotlightParticipantIdRef.current = participantId;
        } catch {
          /* ignore */
        }
      });
    } catch {
      // Not in Zoom context
    }
  }, [isHost, broadcast]);

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
