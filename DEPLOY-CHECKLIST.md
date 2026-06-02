# 🚀 DEPLOYMENT CHECKLIST & GUIDE

> Everything you need to deploy this app to production. Follow these steps in order.

## Pre-Deployment Checklist

- [ ] You have SSH access to your production server
- [ ] Docker Engine 20.10+ and Docker Compose 2.0+ are installed (`docker compose version`)
- [ ] You own/control the domain you'll use (e.g., `example.com`)
- [ ] You have a Google OAuth client ID & secret configured
- [ ] You have generated strong random values for secrets

## Step 1: Generate Secrets Locally

Run these commands locally to generate strong, random values:

```bash
# NEXTAUTH_SECRET (NextAuth session key)
openssl rand -base64 32

# INTERNAL_API_TOKEN (server-to-server auth)
openssl rand -hex 32

# POSTGRES_PASSWORD (database password)
openssl rand -hex 24
```

Save all these values—you'll need them in Step 3.

---

## Step 2: Set Up Your Domain

1. Point your domain's A record at your server's IP address
   - A record: `example.com` → `YOUR.SERVER.IP.ADDRESS`
   - Wait for DNS to propagate (~5 minutes)

2. Verify DNS:
   ```bash
   nslookup example.com
   # Should show your server's IP
   ```

---

## Step 3: Server Setup (One-Time)

SSH into your server:

```bash
ssh user@YOUR.SERVER.IP
```

### 3a. Clone the repository

```bash
git clone https://github.com/YOUR_ORG/problem-6-solutions-69.git
cd problem-6-solutions-69
```

### 3b. Create `.env.prod` with production values

```bash
cp .env.prod .env.prod
nano .env.prod
```

Fill in all values:

```env
# Database
POSTGRES_USER=social
POSTGRES_PASSWORD=<PASTE_YOUR_RANDOM_HEX_24_HERE>
POSTGRES_DB=social
DATABASE_URL=postgresql://social:<PASTE_PASSWORD_HERE>@postgres:5432/social

# Redis (internal Docker network)
REDIS_URL=redis://redis:6380

# Public URLs
FRONTEND_URL=https://example.com
NEXTAUTH_URL=https://example.com
BACKEND_URL=http://backend:4000
PUBLIC_BACKEND_URL=https://api.example.com

# Secrets
NEXTAUTH_SECRET=<PASTE_YOUR_BASE64_32_HERE>
INTERNAL_API_TOKEN=<PASTE_YOUR_HEX_64_HERE>

# Google OAuth
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE

# Analytics (optional)
NEXT_PUBLIC_GTAG_ID=G-0H17TY84BB
```

**Do NOT commit this file to git.**

### 3c. Verify `docker-compose.prod.yml` exists

```bash
ls -la docker-compose.prod.yml
# Should exist and contain the production stack definition
```

---

## Step 4: Enable HTTPS (TLS/SSL)

### Option A: Automatic with Caddy (Recommended)

Edit `docker-compose.prod.yml` to replace nginx with Caddy:

```yaml
services:
  # Remove nginx section if present, add Caddy:
  caddy:
    image: caddy:2.7-alpine
    restart: always
    depends_on:
      - frontend
      - backend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
      - uploads:/var/www/uploads:ro
    environment:
      ACME_AGREE: 'true'

volumes:
  caddy_data:
  caddy_config:
```

Create a `Caddyfile` in the project root:

```
example.com {
  root * /var/www
  encode gzip

  # Serve static uploads
  @uploads path /uploads/*
  handle @uploads {
    root /var/www
  }

  # Proxy auth routes to frontend
  @auth path /api/auth/*
  handle @auth {
    reverse_proxy frontend:3002
  }

  # Proxy API to backend
  handle /api/* {
    reverse_proxy backend:4000
  }

  # Proxy socket.io to backend
  handle /socket.io/* {
    reverse_proxy backend:4000
  }

  # Everything else goes to frontend
  handle {
    reverse_proxy frontend:3002
  }
}
```

### Option B: Manual with Let's Encrypt + Nginx

If you prefer Nginx:

1. Uncomment the nginx section in `docker-compose.prod.yml`
2. Mount certbot volumes:
   ```yaml
   nginx:
     volumes:
       - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
       - ./nginx/certs:/etc/nginx/certs:ro
       - uploads:/var/www/uploads:ro
   ```

3. Use certbot outside of compose to generate certs once:
   ```bash
   certbot certonly --standalone -d example.com
   ```

4. Update nginx.conf to include 443 block (redirect 80 → 443)

---

## Step 5: Bring Up the Stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Watch for errors:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
```

### Troubleshooting startup failures:

**Database migration error (P3009)?**
```bash
# Your migrations were recorded as failed; resolve it:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  npx prisma migrate resolve --rolled-back 20260504081959_init

# Then redeploy migrations:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  npx prisma migrate deploy
```

**Fresh start (lose data)?**
```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

## Step 6: Verify It's Running

### Check containers are healthy:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

All should show `healthy` or `Up`.

### Check endpoints:

```bash
# Frontend
curl -I https://example.com/

# Backend API
curl https://example.com/api/health

# Socket.IO
curl https://example.com/socket.io/
```

### Visit the site:

Open `https://example.com` in a browser. You should see the login page.

Click "Continue with Google" and log in. You should land on an empty feed.

---

## Step 7: Set Up Backups (Ongoing)

### Daily Postgres backup cron job:

```bash
# Create a backup directory
mkdir -p ~/backups

# Add to crontab (crontab -e):
0 2 * * * docker compose -f /path/to/problem-6-solutions-69/docker-compose.prod.yml -f /path/to/problem-6-solutions-69/.env.prod exec -T postgres pg_dump -U social social | gzip > ~/backups/social-$(date +\%F).sql.gz

# Keep only the last 7 days:
0 3 * * * find ~/backups -name "social-*.sql.gz" -mtime +7 -delete
```

### Upload to S3 or similar:

```bash
# Example: after backup, sync to AWS S3
# 0 2 * * * ... && aws s3 sync ~/backups s3://my-backups/social/
```

---

## Step 8: Ongoing Maintenance

### Check logs:

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Just backend
docker compose -f docker-compose.prod.yml logs -f backend

# Just frontend
docker compose -f docker-compose.prod.yml logs -f frontend
```

### Update the app (when you push new code):

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Docker will rebuild affected images and restart containers gracefully. Database migrations run automatically.

### Monitor disk usage:

```bash
docker system df
docker system prune -a  # Clean up old images
```

### Restart individual services:

```bash
docker compose -f docker-compose.prod.yml restart frontend
docker compose -f docker-compose.prod.yml restart backend
```

---

## Troubleshooting

### "Connection refused" when accessing the site:

- Check DNS: `nslookup example.com`
- Check Docker network: `docker network ls`
- Check container logs: `docker compose -f docker-compose.prod.yml logs backend`

### "Google login not working":

- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.prod`
- Ensure Google Cloud Console has the redirect URI: `https://example.com/api/auth/callback/google`
- Check browser console for auth errors

### "404 on /api endpoints":

- Verify backend is running: `docker compose -f docker-compose.prod.yml ps backend`
- Check nginx/Caddy is proxying correctly: `docker compose -f docker-compose.prod.yml logs nginx`

### "Uploads not persisting":

- Check the `uploads` volume is mounted: `docker volume ls | grep uploads`
- Verify volume permissions: `docker exec backend ls -la /app/uploads`

### "Database migration rollback":

If you see "Error: P3009", a prior migration failed. To recover:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  npx prisma migrate resolve --rolled-back 20260504081959_init

# Re-run all pending migrations:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend \
  npx prisma migrate deploy
```

---

## Security Checklist (Before Going Live)

- [ ] `.env.prod` contains random, strong secrets (not defaults)
- [ ] `.env.prod` is in `.gitignore` (never committed)
- [ ] HTTPS/TLS is enabled (not HTTP-only)
- [ ] Firewall allows only 80/443 from public (or restrict to your IP)
- [ ] SSH key auth is enabled; password login disabled
- [ ] Docker containers run with non-root users
- [ ] Rate limiting is active on `/api` endpoints (Express rate-limit middleware)
- [ ] CORS is restricted to your domain (`FRONTEND_URL`)
- [ ] Database backups are automated and stored off-server

---

## Support & References

- **Docker**: https://docs.docker.com/engine/install/
- **Docker Compose**: https://docs.docker.com/compose/install/
- **Next.js Standalone**: https://nextjs.org/docs/advanced-features/output-file-tracing
- **Caddy**: https://caddyserver.com/docs/
- **Prisma Migrations**: https://www.prisma.io/docs/orm/prisma-migrate/getting-started
- **NextAuth.js**: https://next-auth.js.org/deployment/

---

**When you're ready to deploy, start at Step 1 and follow all steps in order. Good luck! 🚀**
