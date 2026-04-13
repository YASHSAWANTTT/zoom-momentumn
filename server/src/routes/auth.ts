import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
export const authRouter = Router();

// Extend session type
declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string;
    state?: string;
    userId?: string;
  }
}

// Step 1: Generate PKCE challenge for frontend
authRouter.get('/authorize', (req, res) => {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  req.session.codeVerifier = codeVerifier;
  req.session.state = state;

  res.json({ codeChallenge, state });
});


// GET callback — Zoom redirects here after OAuth consent
authRouter.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    res.status(400).send('Missing authorization code');
    return;
  }
  // Redirect to frontend with code+state so the client can POST it
  const params = new URLSearchParams({ code: code as string, state: (state as string) ?? '' });
  res.redirect(`${config.clientUrl}?zoom_auth=callback&${params.toString()}`);
});

// Step 2: Exchange authorization code for tokens
authRouter.post('/callback', async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || state !== req.session.state) {
      res.status(400).json({ error: 'Invalid state or missing code' });
      return;
    }

    // Exchange code for access token
    const tokenRes = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${config.zoom.clientId}:${config.zoom.clientSecret}`,
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.zoom.redirectUrl,
        code_verifier: req.session.codeVerifier ?? '',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[auth] token exchange failed:', err);
      res.status(401).json({ error: 'Token exchange failed' });
      return;
    }

    const tokens = (await tokenRes.json()) as { access_token: string };

    // Fetch user profile
    const profileRes = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      res.status(401).json({ error: 'Failed to fetch user profile' });
      return;
    }

    const profile = (await profileRes.json()) as {
      id: string;
      display_name: string;
      email: string;
      role_name: string;
    };

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { zoomUserId: profile.id },
      update: { displayName: profile.display_name, email: profile.email },
      create: {
        zoomUserId: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        role: profile.role_name === 'Owner' ? 'host' : 'student',
      },
    });

    // Store user ID in session
    req.session.userId = user.id;

    // Clean up PKCE state
    delete req.session.codeVerifier;
    delete req.session.state;

    res.json({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error('[auth] callback error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 3: Get current user
authRouter.get('/me', async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
  });

  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
  });
});
