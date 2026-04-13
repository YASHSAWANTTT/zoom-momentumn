import { useEffect, useState, useCallback } from 'react';

// Use the global zoomSdk from the CDN script tag (sdk.js) which has the native bridge.
// The npm @zoom/appssdk package creates a separate instance without the bridge in ZoomWebKit.
// Falls back to undefined outside Zoom (DevPreview handles this via main.tsx routing).
const zoomSdk = (window as any).zoomSdk as any | undefined;

interface ZoomContext {
  isHost: boolean;
  userName: string;
  participantId: string;
  meetingId: string;
  runningContext: string;
  isConfigured: boolean;
  participantCount: number;
  error: string | null;
}

const SDK_CAPABILITIES = [
  'connect',
  'postMessage',
  'onConnect',
  'onMessage',
  'getUserContext',
  'getMeetingContext',
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
    participantCount: 0,
    error: null,
  });

  const configure = useCallback(async () => {
    if (!zoomSdk) {
      setContext((prev) => ({ ...prev, error: 'Zoom SDK not available (running outside Zoom)' }));
      return;
    }
    try {
      const configResponse = await zoomSdk.config({
        capabilities: [...SDK_CAPABILITIES],
        version: '0.16.0',
      });

      const userContext = await zoomSdk.getUserContext();

      // Get meeting ID — follow Arlo's pattern: getMeetingUUID first, then getMeetingContext
      // getMeetingUUID returns the same value for both host and attendee
      let meetingUUID = '';
      try {
        const uuidResponse = await zoomSdk.getMeetingUUID();
        console.log('[useZoomSdk] getMeetingUUID response:', JSON.stringify(uuidResponse));
        meetingUUID = uuidResponse?.meetingUUID ?? uuidResponse?.uuid ?? (typeof uuidResponse === 'string' ? uuidResponse : '');
      } catch (e) {
        console.log('[useZoomSdk] getMeetingUUID failed:', e);
      }

      if (!meetingUUID) {
        try {
          const meetingContext = await zoomSdk.getMeetingContext();
          console.log('[useZoomSdk] getMeetingContext response:', JSON.stringify(meetingContext));
          meetingUUID = meetingContext?.meetingUUID ?? meetingContext?.meetingID ?? '';
        } catch (e) {
          console.log('[useZoomSdk] getMeetingContext failed:', e);
        }
      }

      if (!meetingUUID) {
        meetingUUID = (configResponse as any).meetingUUID ?? '';
        console.log('[useZoomSdk] fallback to configResponse.meetingUUID:', meetingUUID);
      }
      console.log('[useZoomSdk] final meetingId:', meetingUUID, '| role:', userContext.role);

      // Get participant count
      let participantCount = 0;
      try {
        const participants = await zoomSdk.getMeetingParticipants();
        participantCount = participants?.participants?.length ?? 0;
      } catch {
        // getMeetingParticipants may not be available
      }

      setContext({
        isHost: userContext.role === 'host' || userContext.role === 'coHost',
        userName: userContext.screenName ?? '',
        participantId: userContext.participantUUID ?? '',
        meetingId: meetingUUID,
        runningContext: configResponse.runningContext ?? 'inMeeting',
        isConfigured: true,
        participantCount,
        error: null,
      });
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

/** Start RTMS transcript stream (only works inside Zoom) */
export async function startRTMS(): Promise<boolean> {
  if (!zoomSdk) return false;
  try {
    await zoomSdk.callZoomApi('startRTMS', {
      audioOptions: { rawAudio: false },
      transcriptOptions: { caption: true },
    });
    console.log('[useZoomSdk] RTMS started');
    return true;
  } catch (err: any) {
    // 10308 = RTMS already running — treat as success
    if (err?.code === '10308') {
      console.log('[useZoomSdk] RTMS already running');
      return true;
    }
    console.error('[useZoomSdk] startRTMS failed:', err);
    return false;
  }
}

/** Stop RTMS transcript stream (only works inside Zoom) */
export async function stopRTMS(): Promise<boolean> {
  if (!zoomSdk) return false;
  try {
    await zoomSdk.callZoomApi('stopRTMS', {});
    console.log('[useZoomSdk] RTMS stopped');
    return true;
  } catch (err) {
    console.error('[useZoomSdk] stopRTMS failed:', err);
    return false;
  }
}
