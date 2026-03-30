import type { TranscriptSegment } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { resolveMeetingId } from '../services/meeting-resolver.js';

export const transcriptRouter = Router();

function logTranscriptError(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  console.error(`[transcript] ${context}:`, msg, code ? `(code ${code})` : '', err);
}

/** Prisma errors when Postgres is unreachable, misconfigured, or pool timed out */
function isDatabaseUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P1000', 'P1001', 'P1017', 'P2024'].includes(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /Can't reach database|reach database server|ECONNREFUSED|Connection refused|ETIMEDOUT|timeout/i.test(msg);
}

// POST /api/transcript/segment — Store a transcript chunk (from RTMS or mock)
// meetingId may be internal Meeting.id, Zoom meeting UUID (zoomMeetingId), or any key resolveMeetingId accepts.
transcriptRouter.post('/segment', async (req, res) => {
  try {
    const { meetingId, speaker, text, timestamp, seqNo } = req.body;

    if (!meetingId || !text) {
      res.status(400).json({ error: 'meetingId and text are required' });
      return;
    }

    const internalMeetingId = await resolveMeetingId(String(meetingId).trim(), {
      createIfMissing: true,
      defaultTitle: 'Transcript session',
    });
    if (!internalMeetingId) {
      res.status(500).json({ error: 'Failed to resolve meeting' });
      return;
    }

    const segment = await prisma.transcriptSegment.create({
      data: {
        meetingId: internalMeetingId,
        speaker: speaker ?? 'Unknown',
        text,
        timestamp: BigInt(timestamp ?? Date.now()),
        seqNo: BigInt(seqNo ?? 0),
      },
    });

    res.json({ id: segment.id });
  } catch (err) {
    logTranscriptError('segment error', err);
    res.status(500).json({ error: 'Failed to store segment' });
  }
});

// GET /api/transcript/buffer?meetingId=xxx&hostSpeaker=Name
// meetingId: Zoom meeting UUID (from SDK), internal Meeting.id, or zoomMeetingId string — resolved to internal id.
// Optional hostSpeaker: only include segments whose speaker label matches (RTMS userName for that speaker).
// Omit hostSpeaker to include all speakers (legacy / mixed discussion).
transcriptRouter.get('/buffer', async (req, res) => {
  const meetingRef = (req.query.meetingId as string)?.trim();
  const hostSpeakerRaw = req.query.hostSpeaker as string | undefined;
  const hostNorm = hostSpeakerRaw?.trim().toLowerCase() ?? '';
  const hostFiltered = Boolean(hostNorm);

  try {
    if (!meetingRef) {
      res.status(400).json({ error: 'meetingId is required' });
      return;
    }

    const internalMeetingId = await resolveMeetingId(meetingRef, { createIfMissing: false });
    if (!internalMeetingId) {
      res.json({
        buffer: '',
        segmentCount: 0,
        hostFiltered,
        meetingResolved: false,
      });
      return;
    }

    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId: internalMeetingId },
      orderBy: { seqNo: 'desc' },
      // Pull extra rows so after host-only filtering we still have enough text
      take: hostNorm ? 200 : 50,
    });

    const filtered: TranscriptSegment[] = hostNorm
      ? segments.filter((s) => s.speaker.trim().toLowerCase() === hostNorm)
      : segments;

    const buffer = filtered
      .slice()
      .reverse()
      .map((s: TranscriptSegment) => s.text)
      .join(' ');

    // Trim to approximately 300 words
    const words = buffer.split(/\s+/);
    const trimmed = words.slice(-300).join(' ');

    res.json({
      buffer: trimmed,
      segmentCount: filtered.length,
      hostFiltered,
      meetingResolved: true,
    });
  } catch (err) {
    logTranscriptError('buffer error', err);
    if (isDatabaseUnavailable(err)) {
      res.status(200).json({
        buffer: '',
        segmentCount: 0,
        hostFiltered,
        meetingResolved: false,
        degraded: true,
        reason: 'database_unavailable',
      });
      return;
    }
    res.status(500).json({ error: 'Failed to get buffer' });
  }
});
