import { useEffect, useState, useCallback } from 'react';
import zoomSdk from '@zoom/appssdk';

interface ZoomContext {
  isHost: boolean;
  userName: string;
  participantId: string;
  meetingId: string;
  runningContext: string;
  isConfigured: boolean;
  error: string | null;
}

const SDK_CAPABILITIES = [
  'connect',
  'postMessage',
  'onConnect',
  'onMessage',
  'getUserContext',
  'getMeetingUUID',
  'getMeetingParticipants',
  'onParticipantChange',
  'onActiveSpeakerChange',
  'onMeeting',
  'onRunningContextChange',
  'authorize',
  'onAuthorized',
  'promptAuthorize',
  'showNotification',
  'sendMessageToChat',
  // RTMS — Realtime Media Streams (transcript pipeline for Live Anchor)
  'startRTMS',
  'stopRTMS',
  'getRTMSStatus',
  'onRTMSStatusChange',
] as const;

export function useZoomSdk(): ZoomContext {
  const [context, setContext] = useState<ZoomContext>({
    isHost: false,
    userName: '',
    participantId: '',
    meetingId: '',
    runningContext: '',
    isConfigured: false,
    error: null,
  });

  const configure = useCallback(async () => {
    try {
      const configResponse = await zoomSdk.config({
        capabilities: [...SDK_CAPABILITIES],
        version: '0.16.0',
      });

      const userContext = await zoomSdk.getUserContext();

      // Prefer explicit API — config() often omits meetingUUID in the typed response
      let meetingId = String((configResponse as { meetingUUID?: string }).meetingUUID ?? '').trim();
      if (!meetingId) {
        try {
          const uuidRes = await zoomSdk.getMeetingUUID();
          meetingId = String(uuidRes.meetingUUID ?? '').trim();
        } catch (uuidErr) {
          console.warn('[zoom] getMeetingUUID failed:', uuidErr);
        }
      }

      setContext({
        isHost: userContext.role === 'host' || userContext.role === 'coHost',
        userName: userContext.screenName ?? '',
        participantId: userContext.participantUUID ?? '',
        meetingId,
        runningContext: configResponse.runningContext ?? 'inMeeting',
        isConfigured: true,
        error: null,
      });

      try {
        zoomSdk.onRTMSStatusChange((ev) => {
          console.log('[zoom] onRTMSStatusChange', ev);
        });
      } catch (rtmsErr) {
        console.warn('[zoom] onRTMSStatusChange not available:', rtmsErr);
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to configure Zoom SDK';
      const isAppNotSupport = /80004|app_not_support/i.test(rawMessage);
      const message = isAppNotSupport
        ? 'APP_NOT_SUPPORT: Your Marketplace app must be a Zoom App (In-Meeting App) with the In-Meeting side panel enabled. Meeting SDK and Video SDK app types cannot use the Zoom Apps SDK.'
        : rawMessage;
      setContext((prev) => ({ ...prev, error: message }));
    }
  }, []);

  useEffect(() => {
    configure();
  }, [configure]);

  return context;
}
