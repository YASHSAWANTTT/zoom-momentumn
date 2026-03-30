#!/bin/sh
set -e

missing=""
for key in DATABASE_URL ZOOM_CLIENT_ID ZOOM_CLIENT_SECRET ZOOM_REDIRECT_URL SESSION_SECRET; do
  eval "v=\$$key"
  if [ -z "$v" ]; then
    missing="$missing $key"
  fi
done

if [ -n "$missing" ]; then
  echo ""
  echo "ERROR: Missing required environment variable(s):$missing"
  echo ""
  echo "Railway → your app service → Variables → add each (see .env.example)."
  echo "Without these, the server exits before listening → HTTP 502."
  echo ""
  exit 1
fi

echo "[entrypoint] PORT=${PORT:-unset} (Railway sets this automatically)"
echo "[entrypoint] running prisma migrate deploy..."
npx prisma migrate deploy
echo "[entrypoint] starting node..."
exec node dist/server.js
