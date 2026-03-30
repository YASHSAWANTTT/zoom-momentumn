# Zoom Momentum — single URL: Express serves Vite build + /api (Zoom Marketplace Home URL)
# Requires runtime env: DATABASE_URL, ZOOM_*, SESSION_SECRET, CLIENT_URL, etc.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY client/package.json client/
COPY server/package.json server/
COPY mock-transcript/package.json mock-transcript/
RUN npm ci

FROM deps AS build
COPY . .
# Prisma client types must exist before `tsc` (server imports Bookmark, etc.)
WORKDIR /app/server
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate
WORKDIR /app
# Invalidate cached `npm run build` when server output must change (Railway/Docker layer cache).
ARG CACHE_BUST=2026-03-30-esm-config
RUN echo "$CACHE_BUST" && npm run build

FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/package.json ./server/
COPY server/docker-entrypoint.sh ./server/docker-entrypoint.sh
WORKDIR /app/server
RUN chmod +x docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
