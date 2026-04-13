import { prisma } from '../db.js';

const SYSTEM_ZOOM_USER_ID = 'zoom-momentum-system';

interface ResolveMeetingOptions {
  createIfMissing?: boolean;
  defaultTitle?: string;
}

async function ensureSystemOwnerUser(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { zoomUserId: SYSTEM_ZOOM_USER_ID },
    update: {},
    create: {
      zoomUserId: SYSTEM_ZOOM_USER_ID,
      displayName: 'Zoom Momentum System',
      role: 'host',
    },
    select: { id: true },
  });

  return user.id;
}

/**
 * Resolve an internal Meeting.id from either:
 * - an internal Meeting.id
 * - a Zoom meeting UUID (meeting.zoomMeetingId)
 *
 * Optionally creates a meeting when it does not exist.
 */
export async function resolveMeetingId(
  meetingRef: string,
  options: ResolveMeetingOptions = {},
): Promise<string | null> {
  if (!meetingRef) return null;

  const byId = await prisma.meeting.findUnique({
    where: { id: meetingRef },
    select: { id: true },
  });
  if (byId) return byId.id;

  const byZoomId = await prisma.meeting.findUnique({
    where: { zoomMeetingId: meetingRef },
    select: { id: true },
  });
  if (byZoomId) return byZoomId.id;

  if (options.createIfMissing === false) {
    return null;
  }

  const ownerId = await ensureSystemOwnerUser();

  const meeting = await prisma.meeting.upsert({
    where: { zoomMeetingId: meetingRef },
    update: {},
    create: {
      zoomMeetingId: meetingRef,
      title: options.defaultTitle ?? 'In-Meeting Session',
      ownerId,
    },
    select: { id: true },
  });

  return meeting.id;
}
