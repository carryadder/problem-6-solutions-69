# syntax=docker/dockerfile:1.6

# ---------- Base ----------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini libc6-compat

# ---------- Dependencies ----------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --include=dev

# ---------- Development target ----------
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3002
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]

# ---------- Production build ----------
FROM base AS builder
ENV NODE_ENV=production
ARG NEXT_PUBLIC_GTAG_ID
ARG NEXTAUTH_URL
ARG FRONTEND_URL
ENV NEXT_PUBLIC_GTAG_ID=$NEXT_PUBLIC_GTAG_ID
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV FRONTEND_URL=$FRONTEND_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- Production runtime ----------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini && \
    addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
USER app
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3002/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
