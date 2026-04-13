import express, { type Request } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { createServer } from 'http';
import { config, repoRoot } from './config.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { transcriptRouter } from './routes/transcript.js';
import { bookmarkRouter } from './routes/bookmarks.js';
import { rtmsRouter } from './routes/rtms.js';
import { shutdownAllSessions } from './services/rtms-ingest.js';
import { initWebSocketServer } from './services/websocket.js';

const app = express();
// Avoid 304 + empty body on repeated GET /api/* JSON — breaks fetch().json() for live polling (e.g. transcript buffer)
app.set('etag', false);

// Middleware
app.use(cors({ origin: true, credentials: true }));
// Capture raw body: Zoom webhook HMAC is v0:{timestamp}:{RAW_BODY} — JSON.stringify(req.body) breaks verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // Set true in production with HTTPS
      httpOnly: true,
      sameSite: 'none' as const,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);


// Required OWASP headers — Zoom blocks rendering without all four
app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' appssdk.zoom.us",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https:",
    "connect-src 'self' wss: https:",
    "frame-src 'self' appssdk.zoom.us",
    "frame-ancestors https://*.zoom.us https://*.zoomgov.com",
  ].join('; '));
  next();
});

app.use((req, res, next) => {
  if (req.originalUrl.split('?')[0].startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/transcript', transcriptRouter);
app.use('/api/bookmarks', bookmarkRouter);
app.use('/api/rtms', rtmsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve production client build (if dist exists)
const clientDist = path.join(repoRoot, 'client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const httpServer = createServer(app);
initWebSocketServer(httpServer);

httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] listening on ${config.port} (0.0.0.0)`);
});

// Graceful shutdown — close RTMS sessions
function shutdown(signal: string) {
  console.log(`[server] ${signal} received, shutting down RTMS sessions...`);
  shutdownAllSessions();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
