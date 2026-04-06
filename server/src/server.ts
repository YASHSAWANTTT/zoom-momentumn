import express from 'express';
import cors from 'cors';
import session from 'express-session';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { transcriptRouter } from './routes/transcript.js';
import { bookmarkRouter } from './routes/bookmarks.js';
import { rtmsRouter } from './routes/rtms.js';
import { shutdownAllSessions } from './services/rtms-ingest.js';
import { prisma, disconnectPrisma } from './db/prisma.js';

const app = express();

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
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
    name: 'zm.sid',
    cookie: {
      // Production: HTTPS + cross-site (Zoom in-meeting WebView → Railway API)
      secure: isProd,
      httpOnly: true,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);


// Security headers — must allow Zoom Apps SDK script + Zoom API/WebSocket for in-meeting panel
const ZOOM_APP_CSP = [
  "default-src 'self'",
  "script-src 'self' https://appssdk.zoom.us",
  "script-src-elem 'self' https://appssdk.zoom.us",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.zoom.us https://*.zoom.com https://*.zoomdev.us wss://*.zoom.us wss://*.zoom.com wss://*.zoomdev.us",
  'frame-ancestors https://*.zoom.us',
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', ZOOM_APP_CSP);
  next();
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/transcript', transcriptRouter);
app.use('/api/bookmarks', bookmarkRouter);
app.use('/api/rtms', rtmsRouter);

function prismaHealthMeta(err: unknown): { prismaCode?: string; hint: string } {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const hints: Record<string, string> = {
      P1000:
        'Authentication failed — wrong user/password in DATABASE_URL, or password changed. Regenerate the connection string in Neon.',
      P1001:
        'Cannot reach Postgres host — check Neon is not paused, hostname is correct, and sslmode=require is present.',
      P1017:
        'Server closed the connection — try Neon pooled URL; remove channel_binding from URL if issues persist.',
      P2024:
        'Connection pool timeout — increase Neon compute or use pooled connection string.',
    };
    return { prismaCode: err.code, hint: hints[err.code] ?? 'See Railway deploy logs for details.' };
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    const msg = err.message;
    // Same Prisma class as DB connect failures — disambiguate by message
    if (/Query Engine|binaryTargets|debian-openssl|openssl-\d|locate the Query Engine/i.test(msg)) {
      return {
        prismaCode: 'ENGINE',
        hint:
          'Prisma query-engine binary does not match the server OS/OpenSSL. In prisma/schema.prisma set binaryTargets to include debian-openssl-3.0.x (plus native), run prisma generate, rebuild the Docker image, and redeploy.',
      };
    }
    if (/Can\'t reach database server|Timed out trying to acquire a postgres advisory lock/i.test(msg)) {
      return {
        prismaCode: 'P1001',
        hint:
          'Cannot reach Postgres — Neon paused, wrong host, firewall, or DATABASE_URL. Use Neon’s connection string with sslmode=require; URL-encode special characters in the password.',
      };
    }
    if (/Authentication failed|password authentication failed|28P01/i.test(msg)) {
      return {
        prismaCode: 'P1000',
        hint:
          'Postgres rejected credentials — copy a fresh connection string from Neon (or reset password) and update DATABASE_URL on Railway.',
      };
    }
    return {
      prismaCode: 'INIT',
      hint:
        'Prisma failed to initialize. Check Railway logs for the full message. Common fixes: valid DATABASE_URL (no smart quotes), sslmode=require, URL-encoded password if it contains @ or #; redeploy after changing variables.',
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/Can\'t reach database server|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(msg)) {
    return {
      prismaCode: 'P1001',
      hint:
        'Network/DNS to database failed. Confirm Neon project is active, DATABASE_URL matches Neon “Connection string”, and Railway has outbound internet.',
    };
  }
  return { hint: 'See Railway deploy logs for the full Prisma error.' };
}

// Health check (includes Neon/PostgreSQL connectivity)
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[server] health db check failed:', err);
    const meta = prismaHealthMeta(err);
    res.status(503).json({
      status: 'degraded',
      database: 'down',
      timestamp: new Date().toISOString(),
      ...meta,
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
  console.log(`[server] listening on 0.0.0.0:${config.port} (process.env.PORT=${process.env.PORT ?? 'unset'})`);
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
