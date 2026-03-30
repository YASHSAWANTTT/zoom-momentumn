import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (ESM has no __dirname — same pattern as server.ts)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// Railway sets PORT; use `||` so empty string falls back (?? would keep "").
const portStr = (process.env.PORT || '3001').trim();
const parsedPort = parseInt(portStr, 10);

export const config = {
  port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001,
  clientUrl: optional('CLIENT_URL', 'http://localhost:5173'),

  zoom: {
    clientId: required('ZOOM_CLIENT_ID'),
    clientSecret: required('ZOOM_CLIENT_SECRET'),
    redirectUrl: required('ZOOM_REDIRECT_URL'),
  },

  session: {
    secret: required('SESSION_SECRET'),
  },

  aws: {
    region: optional('AWS_REGION', 'us-east-1'),
  },

  zoom_secret_token: optional('ZOOM_SECRET_TOKEN', ''),
} as const;
