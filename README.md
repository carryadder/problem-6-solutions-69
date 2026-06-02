# Social Web App

Responsive social web app: Google-only login, posts, likes, threaded comments,
sharing, profiles, and emoji-only real-time chat. Everything runs in Docker.
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

docker compose -f docker-compose.prod.caddy.yml --env-file .env.prod up -d --build

See [PHASES.md](PHASES.md) for the full 7-phase build plan and
[DEPLOY.md](DEPLOY.md) for production deployment.

## Stack

- **Frontend**: Next.js 14 + TailwindCSS + NextAuth (Google) + Socket.IO client
- **Backend**: Node.js + Express + Socket.IO + Prisma
- **Database**: PostgreSQL
- **Cache / Pub-Sub**: Redis (rate limit, Socket.IO adapter)
- **Orchestration**: Docker Compose

## First-time Google OAuth setup

You need a Google OAuth client to log in.

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Client ID (type: Web application).
3. Authorized redirect URIs:
   - Dev: `http://localhost:3002/api/auth/callback/google`
   - Prod: `https://YOUR_DOMAIN/api/auth/callback/google`
4. Copy the client ID + secret into your `.env`.

## Quick start (development)

```bash
cp .env.example .env
# Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / NEXTAUTH_SECRET / INTERNAL_API_TOKEN
docker compose up --build
```

Generate secrets quickly:

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "INTERNAL_API_TOKEN=$(openssl rand -hex 32)"
```

Then open:

- Frontend: http://localhost:3002
- Backend health: http://localhost:4000/api/health

The backend container runs `prisma migrate deploy` on start. The committed
migrations in `backend/prisma/migrations` are applied automatically, so this
repo does not need a new `init` migration.

```bash
docker compose exec backend npx prisma migrate dev --name <change_name>
```

After that, schema changes are applied automatically on container start.

## Layout

```
backend/
  src/             Express + Socket.IO API
    routes/        users, posts, comments, likes, conversations, notifications, search
    chat.js        Socket.IO emoji-only chat
    util/emoji.js  Emoji-only validator (server-side authoritative)
  prisma/          Database schema
frontend/
  src/app/         Next.js app router pages
  src/components/  AppShell, PostCard, Composer, EmojiPicker
  src/lib/         api client, auth options, avatar helper, socket helper
  public/avatars/  12 default avatar SVGs
nginx/             Reverse proxy config (production)
db/                DB init scripts (if any)
docker-compose.yml         Development stack
docker-compose.prod.yml    Production stack
```

## Hard rules (enforced server-side)

- **Login**: Google OAuth only. No email/password.
- **Comments**: text only, no attachments.
- **Chat**: emoji-only. The server rejects anything else with `400 emoji_only`.
- **Posts**: text + optional image (jpg/png/webp/gif, ≤4 MB).
- **Avatars**: optional upload. If absent, a deterministic default avatar is
  picked from `public/avatars/` based on `hash(userId) % 12`.

## Phase status

- ✅ Phase 1 — Project Skeleton & Docker Foundation
- ✅ Phase 2 — Auth (Google-only) & User Accounts
- ✅ Phase 3 — Profiles (view, edit, default avatars)
- ✅ Phase 4 — Posts, Likes, Comments, Replies, Shares
- ✅ Phase 5 — Real-Time Chat (Emoji-Only)
- ✅ Phase 6 — Responsive UX, Notifications, Search, Dark Mode
- ✅ Phase 7 — Hardening, Prod Docker, Deploy doc
