import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (parent of server/)
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

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
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

  createAI: {
    apiUrl: optional('CREATE_AI_API_URL', ''),
    token: optional('CREATE_AI_TOKEN', ''),
    primaryModel: optional('CREATE_AI_PRIMARY_MODEL', 'gemini-pro'),
    backupModel: optional('CREATE_AI_BACKUP_MODEL', 'claude-3-opus'),
  },

  openai: {
    apiKey: optional('OPENAI_API_KEY', ''),
    baseUrl: optional('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    model: optional('OPENAI_MODEL', 'gpt-4o-mini'),
  },

  zoom_secret_token: optional('ZOOM_SECRET_TOKEN', ''),
} as const;
