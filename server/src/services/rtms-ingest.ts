import { prisma } from '../db.js';
import { resolveMeetingId } from './meeting-resolver.js';
import { config } from '../config.js';

// Dynamically import the @zoom/rtms ES module
let rtms: any;
async function getRtms() {
  if (!rtms) {
    const mod = await import('@zoom/rtms');
    rtms = mod.default;
  }
  return rtms;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RTMSStartPayload {
  meeting_uuid: string;
  rtms_stream_id: string;
  server_urls: string;
  operator_id?: string;
}

interface ActiveSession {
  client: any;
  stopping: boolean;
  firstTranscriptReceived: boolean;
  participantNames: Map<string, string>;
  streamId: string;
  startTime: Date;
  operatorId: string | null;
  seqCounter: number;
}

// ---------------------------------------------------------------------------
// Session Store
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, ActiveSession>();

export function getActiveSessions(): Map<string, ActiveSession> {
  return activeSessions;
}

// ---------------------------------------------------------------------------
// Start an RTMS session for a meeting
// ---------------------------------------------------------------------------

export async function startRTMSSession(payload: RTMSStartPayload): Promise<void> {
  const { meeting_uuid, rtms_stream_id, server_urls, operator_id } = payload;

  console.log(`[rtms-ingest] Starting RTMS session for meeting ${meeting_uuid}`);

  // Prevent duplicate connections
  if (activeSessions.has(meeting_uuid)) {
    console.log('[rtms-ingest] Already connected to this meeting, ignoring duplicate');
    return;
  }

  const rtmsModule = await getRtms();

  const client = new rtmsModule.Client();

  // Store session BEFORE joining to prevent race conditions
  const session: ActiveSession = {
    client,
    stopping: false,
    firstTranscriptReceived: false,
    participantNames: new Map(),
    streamId: rtms_stream_id,
    startTime: new Date(),
    operatorId: operator_id ?? null,
    seqCounter: 0,
  };
  activeSessions.set(meeting_uuid, session);

  try {
    // --- Transcript handler ---
    client.onTranscriptData((buffer: Buffer, _size: number, timestamp: number, metadata: { userName: string; userId: number }) => {
      try {
        const text = buffer.toString('utf-8');
        if (!text.trim()) return;

        const sess = activeSessions.get(meeting_uuid);
        if (sess && !sess.firstTranscriptReceived) {
          sess.firstTranscriptReceived = true;
          console.log('[rtms-ingest] First transcript received');
        }

        // Track participant name
        if (metadata?.userId && metadata?.userName && sess) {
          sess.participantNames.set(String(metadata.userId), metadata.userName);
        }

        storeSegment(meeting_uuid, {
          speaker: metadata?.userName ?? 'Unknown',
          text,
          timestamp,
        }).catch((err) => console.error('[rtms-ingest] Error storing segment:', err));
      } catch (err) {
        console.error('[rtms-ingest] Error processing transcript buffer:', err);
      }
    });

    // --- Join confirmation ---
    client.onJoinConfirm((reason: number) => {
      console.log(`[rtms-ingest] Joined RTMS session, reason: ${reason}`);
    });

    // --- Leave handler ---
    client.onLeave((reason: number) => {
      console.log(`[rtms-ingest] RTMS connection closed, reason: ${reason}`);
      activeSessions.delete(meeting_uuid);
    });

    // --- Participant events ---
    client.onParticipantEvent((event: 'join' | 'leave', _timestamp: number, participants: Array<{ userId: number; userName?: string }>) => {
      const sess = activeSessions.get(meeting_uuid);

      // Suppress leave events during shutdown
      if (sess?.stopping && event === 'leave') {
        console.log('[rtms-ingest] Suppressing leave event during shutdown');
        return;
      }

      if (event === 'join' && sess) {
        for (const p of participants) {
          if (p.userId && p.userName) {
            sess.participantNames.set(String(p.userId), p.userName);
          }
        }
      }

      console.log(`[rtms-ingest] Participant ${event}:`, participants.map((p) => p.userName ?? p.userId));
    });

    // --- Join the session ---
    const result = client.join({
      meeting_uuid,
      rtms_stream_id,
      server_urls,
      client: config.zoom.clientId,
      secret: config.zoom.clientSecret,
    });
    console.log(`[rtms-ingest] Join result: ${result}`);
  } catch (error) {
    console.error('[rtms-ingest] Failed to start RTMS:', error);
    activeSessions.delete(meeting_uuid);
  }
}

// ---------------------------------------------------------------------------
// Stop an RTMS session
// ---------------------------------------------------------------------------

export async function stopRTMSSession(meetingUuid: string): Promise<void> {
  console.log(`[rtms-ingest] Stopping RTMS for meeting: ${meetingUuid}`);

  const session = activeSessions.get(meetingUuid);
  if (!session) {
    console.log('[rtms-ingest] No active session found for meeting');
    return;
  }

  try {
    session.stopping = true;
    session.client.leave();
  } catch (error) {
    console.error('[rtms-ingest] Error stopping RTMS:', error);
  } finally {
    activeSessions.delete(meetingUuid);
  }
}

// ---------------------------------------------------------------------------
// Store a transcript segment via Prisma (same pattern as transcript.ts route)
// ---------------------------------------------------------------------------

async function storeSegment(
  meetingUuid: string,
  data: { speaker: string; text: string; timestamp: number },
): Promise<void> {
  const session = activeSessions.get(meetingUuid);
  const seqNo = session ? ++session.seqCounter : Date.now();

  const meetingId = await resolveMeetingId(meetingUuid, {
    createIfMissing: true,
    defaultTitle: 'RTMS Session',
  });
  if (!meetingId) {
    console.error(`[rtms-ingest] Failed to resolve meeting for zoom UUID ${meetingUuid}`);
    return;
  }

  await prisma.transcriptSegment.create({
    data: {
      meetingId,
      speaker: data.speaker,
      text: data.text,
      timestamp: BigInt(data.timestamp ?? Date.now()),
      seqNo: BigInt(seqNo),
    },
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown — close all active RTMS clients
// ---------------------------------------------------------------------------

export function shutdownAllSessions(): void {
  console.log(`[rtms-ingest] Shutting down ${activeSessions.size} active sessions`);
  for (const [meetingId, session] of activeSessions) {
    try {
      session.stopping = true;
      session.client.leave();
      console.log(`[rtms-ingest] Closed session for meeting: ${meetingId}`);
    } catch (err) {
      console.error(`[rtms-ingest] Error closing session ${meetingId}:`, err);
    }
  }
  activeSessions.clear();
}
