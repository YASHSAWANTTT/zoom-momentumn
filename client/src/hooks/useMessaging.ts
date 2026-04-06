import { useEffect, useCallback, useRef, useState } from 'react';
import zoomSdk from '@zoom/appssdk';
import type { AppMessage, AppState, MessageType } from '../types/messages';

interface UseMessagingOptions {
  isHost: boolean;
  participantId: string;
  onMessage: (message: AppMessage) => void;
  /** Wait for zoomSdk.config() to finish before connect() / onMessage — required by Zoom Apps SDK */
  sdkReady: boolean;
}

export function useMessaging({ isHost, participantId, onMessage, sdkReady }: UseMessagingOptions) {
  const [connected, setConnected] = useState(false);
  const seqRef = useRef(0);
  const stateRef = useRef<AppState | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref fresh without re-subscribing
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!sdkReady) return;

    let mounted = true;

    const init = async () => {
      try {
        await zoomSdk.connect();
        if (mounted) setConnected(true);

        // If student, request current state on connect
        if (!isHost) {
          const requestMsg: AppMessage = {
            type: 'REQUEST_STATE',
            payload: null,
            seq: 0,
            timestamp: Date.now(),
            senderId: participantId,
            senderRole: 'student',
          };
          try {
            await zoomSdk.postMessage({ payload: JSON.stringify(requestMsg) });
          } catch (postErr) {
            console.error('[useMessaging] postMessage REQUEST_STATE failed:', postErr);
          }
        }
      } catch (err) {
        console.error('[useMessaging] connect failed:', err);
      }
    };

    try {
      zoomSdk.onMessage((message) => {
        try {
          const raw = typeof message.payload === 'string' ? message.payload : JSON.stringify(message.payload);
          const parsed: AppMessage = JSON.parse(raw);

          // Host auto-responds to state requests
          if (isHost && parsed.type === 'REQUEST_STATE' && stateRef.current) {
            const fullState: AppMessage = {
              type: 'FULL_STATE',
              payload: stateRef.current,
              seq: ++seqRef.current,
              timestamp: Date.now(),
              senderId: participantId,
              senderRole: 'host',
            };
            try {
              zoomSdk.postMessage({ payload: JSON.stringify(fullState) });
            } catch (postErr) {
              console.error('[useMessaging] postMessage FULL_STATE failed:', postErr);
            }
            return;
          }

          try {
            onMessageRef.current(parsed);
          } catch (handlerErr) {
            console.error('[useMessaging] message handler threw:', handlerErr);
          }
        } catch (err) {
          console.error('[useMessaging] failed to parse message:', err);
        }
      });
    } catch (subErr) {
      console.error('[useMessaging] onMessage subscribe failed:', subErr);
    }

    if (isHost) {
      try {
        zoomSdk.onParticipantChange(() => {
          if (stateRef.current) {
            const fullState: AppMessage = {
              type: 'FULL_STATE',
              payload: stateRef.current,
              seq: ++seqRef.current,
              timestamp: Date.now(),
              senderId: participantId,
              senderRole: 'host',
            };
            try {
              zoomSdk.postMessage({ payload: JSON.stringify(fullState) });
            } catch (postErr) {
              console.error('[useMessaging] participant broadcast failed:', postErr);
            }
          }
        });
      } catch (subErr) {
        console.error('[useMessaging] onParticipantChange subscribe failed:', subErr);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [isHost, participantId, sdkReady]);

  // Send a message (used by students for answers/responses)
  const send = useCallback(
    (type: MessageType, payload: unknown) => {
      const msg: AppMessage = {
        type,
        payload,
        seq: 0, // students don't sequence
        timestamp: Date.now(),
        senderId: participantId,
        senderRole: isHost ? 'host' : 'student',
      };
      try {
        zoomSdk.postMessage({ payload: JSON.stringify(msg) });
      } catch (e) {
        console.error('[useMessaging] send postMessage failed:', e);
      }
    },
    [isHost, participantId],
  );

  // Host-only: broadcast with sequence number
  const broadcast = useCallback(
    (type: MessageType, payload: unknown) => {
      seqRef.current += 1;
      const msg: AppMessage = {
        type,
        payload,
        seq: seqRef.current,
        timestamp: Date.now(),
        senderId: participantId,
        senderRole: 'host',
      };
      try {
        zoomSdk.postMessage({ payload: JSON.stringify(msg) });
      } catch (e) {
        console.error('[useMessaging] broadcast postMessage failed:', e);
      }
    },
    [participantId],
  );

  // Host: update canonical state reference
  const setState = useCallback((newState: AppState) => {
    stateRef.current = newState;
  }, []);

  return { connected, send, broadcast, setState };
}
