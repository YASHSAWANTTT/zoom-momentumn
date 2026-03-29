import type { TranscriptSegment } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db/prisma.js';
export const transcriptRouter = Router();

// POST /api/transcript/segment — Store a transcript chunk (from RTMS or mock)
transcriptRouter.post('/segment', async (req, res) => {
  try {
    const { meetingId, speaker, text, timestamp, seqNo } = req.body;

    if (!meetingId || !text) {
      res.status(400).json({ error: 'meetingId and text are required' });
      return;
    }

    const segment = await prisma.transcriptSegment.create({
      data: {
        meetingId,
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

    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId },
      orderBy: { seqNo: 'desc' },
      take: 50, // Get recent segments, trim to ~300 words
    });

    const buffer = segments
      .reverse()
      .map((s: TranscriptSegment) => s.text)
      .join(' ');

    // Trim to approximately 300 words
    const words = buffer.split(/\s+/);
    const trimmed = words.slice(-300).join(' ');

    res.json({ buffer: trimmed, segmentCount: segments.length });
  } catch (err) {
    console.error('[transcript] buffer error:', err);
    res.status(500).json({ error: 'Failed to get buffer' });
  }
});
