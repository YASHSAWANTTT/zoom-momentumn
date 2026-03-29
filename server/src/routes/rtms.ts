import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import {
  startRTMSSession,
  stopRTMSSession,
  getActiveSessions,
  type RTMSStartPayload,
} from '../services/rtms-ingest.js';

/** Normalize webhook JSON — Zoom may use snake_case or camelCase or nest under `payload`. */
function parseRtmsStartedPayload(body: Record<string, unknown>): RTMSStartPayload | null {
  const raw = (body?.payload ?? body) as Record<string, unknown>;
  const meeting_uuid = raw.meeting_uuid ?? raw.meetingUuid;
  const rtms_stream_id = raw.rtms_stream_id ?? raw.rtmsStreamId;
  const server_urls = raw.server_urls ?? raw.serverUrls;
  const operator_id = raw.operator_id ?? raw.operatorId;

  if (
    meeting_uuid == null ||
    String(meeting_uuid).trim() === '' ||
    rtms_stream_id == null ||
    String(rtms_stream_id).trim() === '' ||
    server_urls == null ||
    String(server_urls).trim() === ''
  ) {
    console.error('[rtms] meeting.rtms_started missing required fields', {
      hasMeetingUuid: meeting_uuid != null,
      hasStreamId: rtms_stream_id != null,
      hasServerUrls: server_urls != null,
    });
    return null;
  }

  return {
    meeting_uuid: String(meeting_uuid),
    rtms_stream_id: String(rtms_stream_id),
    server_urls: String(server_urls),
    operator_id: operator_id != null && String(operator_id).trim() !== '' ? String(operator_id) : undefined,
  };
}

function parseRtmsStoppedMeetingUuid(body: Record<string, unknown>): string | undefined {
  const raw = (body?.payload ?? body) as Record<string, unknown>;
  const uuid = raw.meeting_uuid ?? raw.meetingUuid;
  return uuid != null && String(uuid).trim() !== '' ? String(uuid) : undefined;
}

export const rtmsRouter = Router();

// ---------------------------------------------------------------------------
// Webhook HMAC signature verification
// ---------------------------------------------------------------------------

function verifyWebhookSignature(req: { headers: Record<string, any>; body: any }): boolean {
  const secret = config.zoom_secret_token || config.zoom.clientSecret;

  const signature = req.headers['x-zm-signature'] as string | undefined;
  const timestamp = req.headers['x-zm-request-timestamp'] as string | undefined;

  if (!signature || !timestamp) {
    return false;
  }

  // Reject timestamps older than 5 minutes (replay protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    console.warn('[rtms] Webhook timestamp too old — possible replay attack');
    return false;
  }

  const message = `v0:${timestamp}:${JSON.stringify(req.body)}`;
  const expectedSignature =
    'v0=' +
    crypto.createHmac('sha256', secret).update(message).digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/rtms/webhook — Receive RTMS webhooks from Zoom
// ---------------------------------------------------------------------------

rtmsRouter.post('/webhook', async (req, res) => {
  const { event, payload } = req.body;

  // --- URL validation (Zoom sends this to verify the webhook endpoint) ---
  if (event === 'endpoint.url_validation') {
    const plainToken: string = payload?.plainToken;
    if (!plainToken) {
      res.status(400).json({ error: 'Missing plainToken' });
      return;
    }

    const hashForValidate = crypto
      .createHmac('sha256', config.zoom_secret_token || config.zoom.clientSecret)
      .update(plainToken)
      .digest('hex');

    res.status(200).json({
      plainToken,
      encryptedToken: hashForValidate,
    });
    return;
  }

  // --- Verify HMAC for all other events ---
  if (!verifyWebhookSignature(req)) {
    console.error('[rtms] Webhook signature verification failed');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Acknowledge immediately so Zoom doesn't retry
  res.status(200).json({ status: 'accepted' });

  console.log(`[rtms] Webhook received: ${event}`);

  try {
    switch (event) {
      case 'meeting.rtms_started': {
        const startPayload = parseRtmsStartedPayload(req.body as Record<string, unknown>);
        if (startPayload) {
          await startRTMSSession(startPayload);
        }
        break;
      }

      case 'meeting.rtms_stopped': {
        const meetingUuid = parseRtmsStoppedMeetingUuid(req.body as Record<string, unknown>);
        await stopRTMSSession(meetingUuid ?? '');
        break;
      }

      default:
        console.log(`[rtms] Unhandled webhook event: ${event}`);
    }
  } catch (error) {
    console.error('[rtms] Webhook handler error:', error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/rtms/health — Check active RTMS sessions
// ---------------------------------------------------------------------------

rtmsRouter.get('/health', (_req, res) => {
  const sessions = getActiveSessions();
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    meetings: Array.from(sessions.keys()),
  });
});
