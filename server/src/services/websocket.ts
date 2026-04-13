import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';

interface ClientSocket extends WebSocket {
  meetingId?: string;
  role?: string;
  participantId?: string;
  isAlive?: boolean;
}

// Room management: meetingId → Set of connected sockets
const rooms = new Map<string, Set<ClientSocket>>();

function addToRoom(meetingId: string, ws: ClientSocket) {
  if (!rooms.has(meetingId)) {
    rooms.set(meetingId, new Set());
  }
  rooms.get(meetingId)!.add(ws);
  console.log(`[ws] Client joined room ${meetingId} (${rooms.get(meetingId)!.size} clients)`);
}

function removeFromRoom(ws: ClientSocket) {
  if (!ws.meetingId) return;
  const room = rooms.get(ws.meetingId);
  if (room) {
    room.delete(ws);
    console.log(`[ws] Client left room ${ws.meetingId} (${room.size} clients)`);
    if (room.size === 0) {
      rooms.delete(ws.meetingId);
    }
  }
}

function relayToRoom(senderWs: ClientSocket, message: string) {
  if (!senderWs.meetingId) return;
  const room = rooms.get(senderWs.meetingId);
  if (!room) return;

  let relayed = 0;
  for (const client of room) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
      relayed++;
    }
  }
  return relayed;
}

function broadcastToRoom(meetingId: string, message: string) {
  const room = rooms.get(meetingId);
  if (!room) return;
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Heartbeat: ping every 30s, terminate dead connections
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<ClientSocket>) {
      if (ws.isAlive === false) {
        removeFromRoom(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws: ClientSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const meetingId = url.searchParams.get('meetingId') ?? '';
    const role = url.searchParams.get('role') ?? 'student';
    const participantId = url.searchParams.get('participantId') ?? '';

    ws.meetingId = meetingId;
    ws.role = role;
    ws.participantId = participantId;
    ws.isAlive = true;

    if (meetingId) {
      addToRoom(meetingId, ws);

      // Notify others in the room about the new participant
      broadcastToRoom(meetingId, JSON.stringify({
        type: 'PARTICIPANT_JOINED',
        payload: { participantId, role },
        seq: 0,
        timestamp: Date.now(),
        senderId: 'server',
        senderRole: 'server',
      }));
    }

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const raw = data.toString();
        const relayed = relayToRoom(ws, raw);
        // Log first few chars for debugging
        const parsed = JSON.parse(raw);
        console.log(`[ws] ${ws.role}→room(${ws.meetingId}): ${parsed.type} (relayed to ${relayed} clients)`);
      } catch (err) {
        console.error('[ws] Failed to relay message:', err);
      }
    });

    ws.on('close', () => {
      removeFromRoom(ws);
    });

    ws.on('error', (err) => {
      console.error('[ws] Socket error:', err);
      removeFromRoom(ws);
    });

    console.log(`[ws] New connection: role=${role}, meetingId=${meetingId}, participantId=${participantId}`);
  });

  console.log('[ws] WebSocket server initialized on /ws');
  return wss;
}
