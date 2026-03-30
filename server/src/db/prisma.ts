/**
 * Single PrismaClient for Neon (PostgreSQL). Reuse this module everywhere instead of `new PrismaClient()`
 * so connection pooling stays efficient under load (RTMS, transcript, OAuth, bookmarks).
 */
import '../config.js';
import { PrismaClient } from '@prisma/client';

// Neon often provides pooled + direct URLs; hosts like Railway may only set DATABASE_URL.
if (!process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL?.trim()) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

function assertPostgresUrl(name: string, value: string | undefined): void {
  if (!value?.trim()) {
    throw new Error(
      `Missing ${name}. Add it to server/.env (and keep root .env in sync if you use it). See Neon Console → Connect.`,
    );
  }
  const v = value.trim();
  if (!/^postgres(ql)?:\/\//i.test(v)) {
    throw new Error(
      `${name} must be a PostgreSQL connection string (e.g. postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require).`,
    );
  }
}

assertPostgresUrl('DATABASE_URL', process.env.DATABASE_URL);
assertPostgresUrl('DIRECT_URL', process.env.DIRECT_URL);

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
