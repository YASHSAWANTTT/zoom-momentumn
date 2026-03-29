import express from 'express';
import cors from 'cors';
import session from 'express-session';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { transcriptRouter } from './routes/transcript.js';
import { bookmarkRouter } from './routes/bookmarks.js';
import { rtmsRouter } from './routes/rtms.js';
import { shutdownAllSessions } from './services/rtms-ingest.js';
import { prisma, disconnectPrisma } from './db/prisma.js';

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
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


// OWASP Security Headers
app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors https://*.zoom.us");
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/transcript', transcriptRouter);
app.use('/api/bookmarks', bookmarkRouter);
app.use('/api/rtms', rtmsRouter);

// Health check (includes Neon/PostgreSQL connectivity)
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[server] health db check failed:', err);
    res.status(503).json({
      status: 'degraded',
      database: 'down',
      timestamp: new Date().toISOString(),
    });
  }
});

// Production: serve Vite client from same origin so Zoom Marketplace has one HTTPS URL (Home + /api).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      fallthrough: true,
      index: 'index.html',
    }),
  );
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`[server] serving static files from ${clientDist}`);
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled route error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] listening on port ${config.port}`);
});

// Graceful shutdown — close RTMS sessions
async function shutdown(signal: string) {
  console.log(`[server] ${signal} received, shutting down RTMS sessions...`);
  shutdownAllSessions();
  try {
    await disconnectPrisma();
  } catch (e) {
    console.error('[server] Prisma disconnect error:', e);
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
