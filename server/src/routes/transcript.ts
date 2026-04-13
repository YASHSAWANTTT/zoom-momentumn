import { Router } from 'express';
import { prisma } from '../db.js';
import { resolveMeetingId } from '../services/meeting-resolver.js';
export const transcriptRouter = Router();

// POST /api/transcript/segment — Store a transcript chunk (from RTMS or mock)
transcriptRouter.post('/segment', async (req, res) => {
  try {
    const { meetingId, speaker, text, timestamp, seqNo } = req.body;

    if (!meetingId || !text) {
      res.status(400).json({ error: 'meetingId and text are required' });
      return;
    }

    const resolvedMeetingId = await resolveMeetingId(meetingId, {
      createIfMissing: true,
      defaultTitle: 'Lecture Session',
    });
    if (!resolvedMeetingId) {
      res.status(400).json({ error: 'Failed to resolve meetingId' });
      return;
    }

    const segment = await prisma.transcriptSegment.upsert({
      where: {
        meetingId_seqNo: {
          meetingId: resolvedMeetingId,
          seqNo: BigInt(seqNo ?? 0),
        },
      },
      update: {
        speaker: speaker ?? 'Unknown',
        text,
        timestamp: BigInt(timestamp ?? Date.now()),
      },
      create: {
        meetingId: resolvedMeetingId,
        speaker: speaker ?? 'Unknown',
        text,
        timestamp: BigInt(timestamp ?? Date.now()),
        seqNo: BigInt(seqNo ?? 0),
      },
    });

    res.json({ id: segment.id });
  } catch (err) {
    console.error('[transcript] segment error:', err);
    res.status(500).json({ error: 'Failed to store segment' });
  }
});

// GET /api/transcript/buffer?meetingId=xxx — Get rolling buffer (last ~300 words)
transcriptRouter.get('/buffer', async (req, res) => {
  try {
    const meetingId = req.query.meetingId as string;
    if (!meetingId) {
      res.status(400).json({ error: 'meetingId is required' });
      return;
    }

    const resolvedMeetingId = await resolveMeetingId(meetingId, { createIfMissing: false });
    if (!resolvedMeetingId) {
      res.json({ buffer: '', segmentCount: 0 });
      return;
    }

    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId: resolvedMeetingId },
      select: { text: true },
      orderBy: { seqNo: 'desc' },
      take: 50,
    });

    const buffer = segments
      .reverse()
      .map((s) => s.text)
      .join(' ');

    const words = buffer.split(/\s+/);
    const trimmed = words.slice(-300).join(' ');

    res.json({ buffer: trimmed, segmentCount: segments.length });
  } catch (err) {
    console.error('[transcript] buffer error:', err);
    res.status(500).json({ error: 'Failed to get buffer' });
  }
});
