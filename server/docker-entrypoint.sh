#!/bin/sh
set -e
if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "ERROR: DATABASE_URL is not set."
  echo ""
  echo "Railway: open this service → Variables → New Variable:"
  echo "  Name:  DATABASE_URL"
  echo "  Value: your PostgreSQL connection string"
  echo ""
  echo "If you added Railway PostgreSQL: use Variable → Reference →"
  echo "  pick your Postgres service → DATABASE_URL (or copy the URL from the DB service)."
  echo ""
  echo "Or paste a Neon / other Postgres URL (postgresql://...?sslmode=require)."
  echo ""
  exit 1
fi
npx prisma migrate deploy
exec node dist/server.js
