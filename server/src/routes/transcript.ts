import { Router } from 'express';
import { prisma } from '../db.js';
import { resolveMeetingId } from '../services/meeting-resolver.js';
import { getActiveSessions } from '../services/rtms-ingest.js';

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

// GET /api/transcript/diagnostics?meetingId= — why is buffer empty?
transcriptRouter.get('/diagnostics', async (req, res) => {
  try {
    const meetingId = req.query.meetingId as string;
    if (!meetingId) {
      res.status(400).json({ error: 'meetingId is required' });
      return;
    }

    const resolved = await resolveMeetingId(meetingId, { createIfMissing: false });
    const segmentCount = resolved
      ? await prisma.transcriptSegment.count({ where: { meetingId: resolved } })
      : 0;
    const meetingRow = await prisma.meeting.findFirst({
      where: { zoomMeetingId: meetingId },
      select: { id: true, zoomMeetingId: true, title: true },
    });
    const rtmsActive = getActiveSessions().has(meetingId);

    res.json({
      queryZoomMeetingId: meetingId,
      resolvedInternalMeetingId: resolved,
      meetingRowFound: Boolean(meetingRow),
      transcriptSegmentRows: segmentCount,
      rtmsServerSessionActive: rtmsActive,
      explanation:
        segmentCount === 0
          ? 'Segments appear only when Zoom POSTs meeting.rtms_started to https://YOUR_HOST/api/rtms/webhook (valid signature), the RTMS client joins, and caption/transcript packets arrive. Speaking in the meeting without that pipeline leaves the buffer empty. Enable live transcription/captions in the meeting if required by your Zoom account.'
          : undefined,
    });
  } catch (err) {
    console.error('[transcript] diagnostics error:', err);
    res.status(500).json({ error: 'Failed to load diagnostics' });
  }
});
