import { useEffect, useCallback, useRef, useState } from 'react';
import type { AppMessage, AppState, MessageType } from '../types/messages';

interface UseMessagingOptions {
  isHost: boolean;
  participantId: string;
  /** From Zoom SDK (or demo id); may be '' until config completes. */
  meetingId: string;
  onMessage: (message: AppMessage) => void;
}

export function useMessaging({ isHost, participantId, meetingId, onMessage }: UseMessagingOptions) {
  const [connected, setConnected] = useState(false);
  const seqRef = useRef(0);
  const stateRef = useRef<AppState | null>(null);
  const onMessageRef = useRef(onMessage);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connectWs = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const urlDemo = params.get('demo') === '1';
    const effectiveMeetingId = meetingId || (urlDemo ? 'mock-meeting-001' : '');

    if (!effectiveMeetingId) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const role = isHost ? 'host' : 'student';
    const url = `${protocol}//${host}/ws?meetingId=${encodeURIComponent(effectiveMeetingId)}&role=${role}&participantId=${encodeURIComponent(participantId || 'anon')}`;

    console.log(`[useMessaging] Connecting to ${url}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useMessaging] WebSocket connected');
      setConnected(true);

      // Student: request current state on connect
      if (!isHost) {
        const requestMsg: AppMessage = {
          type: 'REQUEST_STATE',
          payload: null,
          seq: 0,
          timestamp: Date.now(),
          senderId: participantId,
          senderRole: 'student',
        };
        ws.send(JSON.stringify(requestMsg));
        console.log('[useMessaging] sent REQUEST_STATE');
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed: AppMessage = JSON.parse(event.data);
        console.log('[useMessaging] received:', parsed.type);

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
          ws.send(JSON.stringify(fullState));
          console.log('[useMessaging] sent FULL_STATE');
          return;
        }

        // Skip server-generated messages like PARTICIPANT_JOINED
        if ((parsed as any).senderRole === 'server') {
          // If host, broadcast full state to catch up new participants
          if (isHost && (parsed as any).type === 'PARTICIPANT_JOINED' && stateRef.current) {
            const fullState: AppMessage = {
              type: 'FULL_STATE',
              payload: stateRef.current,
              seq: ++seqRef.current,
              timestamp: Date.now(),
              senderId: participantId,
              senderRole: 'host',
            };
            ws.send(JSON.stringify(fullState));
            console.log('[useMessaging] sent FULL_STATE for new participant');
          }
          return;
        }

        onMessageRef.current(parsed);
      } catch (err) {
        console.error('[useMessaging] failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[useMessaging] WebSocket disconnected');
      setConnected(false);
      wsRef.current = null;

      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(() => {
        console.log('[useMessaging] Reconnecting...');
        connectWs();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('[useMessaging] WebSocket error:', err);
    };
  }, [isHost, participantId, meetingId]);

  useEffect(() => {
    connectWs();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connectWs]);

  const send = useCallback(
    (type: MessageType, payload: unknown) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const msg: AppMessage = {
        type,
        payload,
        seq: 0,
        timestamp: Date.now(),
        senderId: participantId,
        senderRole: isHost ? 'host' : 'student',
      };
      wsRef.current.send(JSON.stringify(msg));
    },
    [isHost, participantId],
  );

  const broadcast = useCallback(
    (type: MessageType, payload: unknown) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      seqRef.current += 1;
      const msg: AppMessage = {
        type,
        payload,
        seq: seqRef.current,
        timestamp: Date.now(),
        senderId: participantId,
        senderRole: 'host',
      };
      wsRef.current.send(JSON.stringify(msg));
    },
    [participantId],
  );

  const setState = useCallback((newState: AppState) => {
    stateRef.current = newState;
  }, []);

  return { connected, send, broadcast, setState };
}
