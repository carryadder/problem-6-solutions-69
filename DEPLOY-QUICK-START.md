# 📋 DEPLOYMENT QUICK REFERENCE

Your app is **ready to deploy!** Here's the quick path:

## Files Added for Deployment

✅ **`frontend/server.js`** — Runs the production Next.js standalone build
✅ **`.env.prod`** — Template for production environment variables (fill in your values)
✅ **`Caddyfile`** — Automatic HTTPS configuration with Let's Encrypt
✅ **`docker-compose.prod.caddy.yml`** — Alternative stack with Caddy included
✅ **`DEPLOY-CHECKLIST.md`** — Complete step-by-step deployment guide
✅ **`.gitignore` updated** — `.env.prod` now excluded (never commits secrets)

## One-Line Deployment (on Server)

```bash
git clone <your-repo> && cd problem-6-solutions-69 && \
cp .env.prod .env.prod && nano .env.prod && \
docker compose -f docker-compose.prod.caddy.yml --env-file .env.prod up -d --build
```

## What You Need to Do

### 1️⃣ Get Secrets
```bash
openssl rand -base64 32     # NEXTAUTH_SECRET
openssl rand -hex 32        # INTERNAL_API_TOKEN
openssl rand -hex 24        # POSTGRES_PASSWORD
```

### 2️⃣ Point Your Domain
Add an A record: `your-domain.com` → `YOUR_SERVER_IP`

### 3️⃣ Fill `.env.prod`
Edit the `.env.prod` file with:
- Your domain name
- Google OAuth credentials
- Your generated secrets
- Database password

### 4️⃣ Deploy
**Option A: With Automatic HTTPS (Recommended)**
```bash
docker compose -f docker-compose.prod.caddy.yml --env-file .env.prod up -d --build
```

**Option B: Without Reverse Proxy**
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 5️⃣ Verify
```bash
docker compose -f docker-compose.prod.caddy.yml ps     # Check all services
curl https://your-domain.com/                          # Should load login page
```

---

## Stack Architecture (Production)

```
┌─────────────────────────────────────────────────────────┐
│                      Your Server                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Caddy (Reverse Proxy)                              │ │
│  │ • Automatic HTTPS/TLS (Let's Encrypt)              │ │
│  │ • HTTP → HTTPS redirect                            │ │
│  │ • Static file serving (/uploads)                   │ │
│  │ • Proxies to: frontend, backend, socket.io         │ │
│  └────────────────────────────────────────────────────┘ │
│              ↓              ↓              ↓             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Frontend    │  │   Backend    │  │   Database   │  │
│  │ (Next.js)    │  │ (Express +   │  │(PostgreSQL)  │  │
│  │   :3002      │  │  Socket.IO)  │  │    :5432     │  │
│  │              │  │    :4000     │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│        ↓                  ↓                  ↓          │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Docker Network: social              │   │
│  │    (all services communicate via hostname)      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │ Redis (Cache)    │  │ Named Volumes             │   │
│  │ :6380            │  │ • pg_data                 │   │
│  │                  │  │ • redis_data              │   │
│  │ (sessions, chat) │  │ • uploads (avatars, etc)  │   │
│  └──────────────────┘  └──────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Key Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Frontend URL** | `https://your-domain.com` | Used by clients, must be HTTPS in prod |
| **Backend URL** | `http://backend:4000` | Internal Docker network URL (not localhost) |
| **Database URL** | `postgresql://social:PASSWORD@postgres:5432/social` | Postgres in Docker network |
| **Redis URL** | `redis://redis:6380` | Redis in Docker network |
| **Next.js Mode** | Standalone output | See `frontend/next.config.mjs` |
| **Node.js Server** | Runs `frontend/server.js` | Launches standalone Next.js build |

---

## Troubleshooting

### Caddy can't get certs?
- DNS must be propagated first: `nslookup your-domain.com`
- Ports 80 & 443 must be open to the internet
- Check logs: `docker compose -f docker-compose.prod.caddy.yml logs caddy`

### Can't log in with Google?
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.prod`
- Add redirect URI to Google Cloud Console: `https://your-domain.com/api/auth/callback/google`

### Database migration failed?
```bash
docker compose -f docker-compose.prod.caddy.yml exec backend \
  npx prisma migrate resolve --rolled-back 20260504081959_init

docker compose -f docker-compose.prod.caddy.yml exec backend \
  npx prisma migrate deploy
```

### Uploads not working?
Check the uploads volume is mounted:
```bash
docker volume ls | grep uploads
docker exec <backend-container> ls -la /app/uploads
```

---

## Next Steps

1. **Read** [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md) for full step-by-step guide
2. **Fill in** `.env.prod` with your secrets and domain
3. **Deploy** using either `docker-compose.prod.yml` or `docker-compose.prod.caddy.yml`
4. **Monitor** with: `docker compose logs -f`
5. **Backup** your database regularly

---

## Support

- **Docker Docs**: https://docs.docker.com/
- **Caddy Docs**: https://caddyserver.com/docs/
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **Prisma Migrations**: https://www.prisma.io/docs/orm/prisma-migrate

---

**Your app is production-ready. Deploy with confidence! 🚀**
