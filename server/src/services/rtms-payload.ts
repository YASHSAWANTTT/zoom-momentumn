/**
 * Normalize Zoom RTMS webhook inner payloads (field names and nesting vary).
 */

export interface RTMSStartFields {
  meeting_uuid: string;
  rtms_stream_id: string;
  server_urls: string;
  signature?: string;
  operator_id?: string;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Unwrap Zoom nested `payload.object` when present */
function unwrapPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  if (o.object && typeof o.object === 'object') {
    return o.object as Record<string, unknown>;
  }
  return o;
}

export function extractRtmsStartPayload(payload: unknown): RTMSStartFields | null {
  const p = unwrapPayload(payload);
  const meeting_uuid = pickString(p, 'meeting_uuid', 'meetingUUID');
  const rtms_stream_id = pickString(p, 'rtms_stream_id', 'rtmsStreamId');
  const server_urls = pickString(p, 'server_urls', 'serverUrls');
  const signature = pickString(p, 'signature');
  const operator_id = pickString(p, 'operator_id', 'operatorId');

  if (!meeting_uuid || !rtms_stream_id || !server_urls) {
    return null;
  }

  return {
    meeting_uuid,
    rtms_stream_id,
    server_urls,
    ...(signature ? { signature } : {}),
    ...(operator_id ? { operator_id } : {}),
  };
}

export function extractRtmsMeetingUuid(payload: unknown): string | undefined {
  const p = unwrapPayload(payload);
  return pickString(p, 'meeting_uuid', 'meetingUUID');
}

/** Recognize RTMS start events across Zoom payload variants */
export function isRtmsStartedEvent(event: string | undefined): boolean {
  if (!event) return false;
  return (
    event === 'meeting.rtms_started' ||
    event === 'meeting.rtms.started'
  );
}

export function isRtmsStoppedEvent(event: string | undefined): boolean {
  if (!event) return false;
  return (
    event === 'meeting.rtms_stopped' ||
    event === 'meeting.rtms.stopped'
  );
}
