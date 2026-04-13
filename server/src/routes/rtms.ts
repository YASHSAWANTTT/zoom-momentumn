import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import {
  startRTMSSession,
  stopRTMSSession,
  getActiveSessions,
} from '../services/rtms-ingest.js';
import {
  extractRtmsMeetingUuid,
  extractRtmsStartPayload,
  isRtmsStartedEvent,
  isRtmsStoppedEvent,
} from '../services/rtms-payload.js';

export const rtmsRouter = Router();

// ---------------------------------------------------------------------------
// Webhook HMAC signature verification
// ---------------------------------------------------------------------------

function getRtmsSecret(): string {
  const token = config.zoom_secret_token;
  return token && token.trim().length > 0 ? token : config.zoom.clientSecret;
}

function verifyWebhookSignature(req: { headers: Record<string, any>; body: any }): boolean {
  const secret = getRtmsSecret();

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
      .createHmac('sha256', getRtmsSecret())
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
    console.error(
      '[rtms] Webhook signature verification failed — set ZOOM_SECRET_TOKEN to your app’s Secret Token from Zoom Marketplace (or verify ZOOM_CLIENT_SECRET matches)',
    );
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Acknowledge immediately so Zoom doesn't retry
  res.status(200).json({ status: 'accepted' });

  const eventName = typeof event === 'string' ? event : '';
  console.log(`[rtms] Webhook received: ${eventName}`);

  try {
    if (isRtmsStartedEvent(eventName)) {
      const start = extractRtmsStartPayload(payload);
      if (!start) {
        console.error('[rtms] meeting.rtms_started missing fields; payload keys:', payload && typeof payload === 'object' ? Object.keys(payload as object) : []);
        return;
      }
      await startRTMSSession(start);
      return;
    }

    if (isRtmsStoppedEvent(eventName)) {
      const uuid = extractRtmsMeetingUuid(payload);
      await stopRTMSSession(uuid ?? '');
      return;
    }

    console.log(`[rtms] Unhandled webhook event: ${eventName}`);
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
    note:
      'Transcript DB fills only after Zoom delivers meeting.rtms_started to POST /api/rtms/webhook and captions flow over RTMS. The in-meeting startRTMS() API alone does not write segments.',
  });
});
