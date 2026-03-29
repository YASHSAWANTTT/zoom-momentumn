import type { Bookmark } from '@prisma/client';
import { Router } from 'express';
import { resolveMeetingId } from '../services/meeting-resolver.js';
import { prisma } from '../db/prisma.js';
export const bookmarkRouter = Router();

// POST /api/bookmarks — Create a bookmark
bookmarkRouter.post('/', async (req, res) => {
  try {
    const { userId, meetingId, timestamp, topic, transcriptSnippet, isAuto } = req.body;

    if (!userId || !meetingId || !topic) {
      res.status(400).json({ error: 'userId, meetingId, and topic are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }

    const resolvedMeetingId = await resolveMeetingId(meetingId, {
      createIfMissing: true,
      defaultTitle: 'Lecture Session',
    });
    if (!resolvedMeetingId) {
      res.status(400).json({ error: 'Invalid meetingId' });
      return;
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        userId,
        meetingId: resolvedMeetingId,
        timestamp: BigInt(timestamp ?? Date.now()),
        topic,
        transcriptSnippet: transcriptSnippet ?? null,
        isAuto: isAuto ?? false,
      },
    });

    res.json({ id: bookmark.id });
  } catch (err) {
    console.error('[bookmarks] create error:', err);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

// GET /api/bookmarks?meetingId=xxx&userId=xxx — Get bookmarks for a meeting
bookmarkRouter.get('/', async (req, res) => {
  try {
    const { meetingId, userId } = req.query as { meetingId?: string; userId?: string };

    if (!meetingId || !userId) {
      res.status(400).json({ error: 'meetingId and userId are required' });
      return;
    }

    const resolvedMeetingId = await resolveMeetingId(meetingId, { createIfMissing: false });
    if (!resolvedMeetingId) {
      res.json([]);
      return;
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { meetingId: resolvedMeetingId, userId },
      orderBy: { createdAt: 'asc' },
    });

    // Convert BigInt to string for JSON serialization
    const serialized = bookmarks.map((b: Bookmark) => ({
      ...b,
      timestamp: b.timestamp.toString(),
    }));

    res.json(serialized);
  } catch (err) {
    console.error('[bookmarks] list error:', err);
    res.status(500).json({ error: 'Failed to list bookmarks' });
  }
});
