# 🔧 PRODUCTION TROUBLESHOOTING GUIDE

## Container Issues

### All containers keep restarting?

**Check logs:**
```bash
docker compose -f docker-compose.prod.caddy.yml logs backend
docker compose -f docker-compose.prod.caddy.yml logs frontend
docker compose -f docker-compose.prod.caddy.yml logs postgres
```

**Common causes:**
- Missing or wrong `.env.prod` values
- Database connection timeout (Postgres not ready)
- Port already in use
- Insufficient disk space

**Solution:**
```bash
# Restart with verbose output
docker compose -f docker-compose.prod.caddy.yml down
docker compose -f docker-compose.prod.caddy.yml up --build
```

---

### Container exits with code 1

**Check the error:**
```bash
docker compose -f docker-compose.prod.caddy.yml logs --tail=50 <service-name>
```

**Backend common errors:**
- `ECONNREFUSED` → Postgres/Redis not ready yet (increase `retries` in healthcheck)
- `Error: P3009` → Migration already recorded as failed (see Database section)
- `Error: listen EADDRINUSE` → Port 4000 already in use

**Frontend common errors:**
- `Cannot find module` → Dependencies not installed (rebuild: `--build`)
- `Error: ENOENT` → Config file missing (check `.env.prod`)

---

## Database Issues

### "Error: P3009 — migration already recorded as failed"

This means a prior migration attempt failed and is blocking new ones.

**Resolution:**

1. Mark the failed migration as rolled back:
```bash
docker compose -f docker-compose.prod.caddy.yml exec backend \
  npx prisma migrate resolve --rolled-back 20260504081959_init
```

2. Re-apply all pending migrations:
```bash
docker compose -f docker-compose.prod.caddy.yml exec backend \
  npx prisma migrate deploy
```

3. If that fails, inspect the database:
```bash
docker compose -f docker-compose.prod.caddy.yml exec postgres \
  psql -U social -d social -c "\dm"  # List all migrations
```

4. **Nuclear option** (lose all data, start fresh):
```bash
docker compose -f docker-compose.prod.caddy.yml down -v
docker compose -f docker-compose.prod.caddy.yml up -d --build
```

---

### "Connection refused" from backend to database

**Cause:** Backend starts before Postgres is ready.

**Fix:**
```bash
# Add to backend service in docker-compose.prod.caddy.yml:
depends_on:
  postgres:
    condition: service_healthy  # Wait for health check to pass
  redis:
    condition: service_healthy
```

**Or manually wait:**
```bash
docker compose -f docker-compose.prod.caddy.yml up -d
sleep 30  # Give Postgres time to start
docker compose -f docker-compose.prod.caddy.yml restart backend
```

---

### Database size growing too large?

**Check size:**
```bash
docker compose -f docker-compose.prod.caddy.yml exec postgres \
  psql -U social -d social -c "SELECT pg_size_pretty(pg_database_size('social'));"
```

**Vacuum (free up space):**
```bash
docker compose -f docker-compose.prod.caddy.yml exec postgres \
  psql -U social -d social -c "VACUUM FULL;"
```

---

## Network & Reverse Proxy Issues

### "502 Bad Gateway" from Caddy

**Means:** Caddy can't reach the backend service.

**Check:**
1. Backend is running:
```bash
docker compose -f docker-compose.prod.caddy.yml ps backend
```

2. Backend is healthy:
```bash
docker compose -f docker-compose.prod.caddy.yml logs backend
```

3. Check Caddy logs:
```bash
docker compose -f docker-compose.prod.caddy.yml logs caddy
```

4. Verify DNS name resolution inside Caddy container:
```bash
docker compose -f docker-compose.prod.caddy.yml exec caddy \
  nslookup backend
```

**Solution:**
- Restart Caddy: `docker compose -f docker-compose.prod.caddy.yml restart caddy`
- Restart backend: `docker compose -f docker-compose.prod.caddy.yml restart backend`
- Rebuild: `docker compose -f docker-compose.prod.caddy.yml up -d --build`

---

### "404 Not Found" on `/api` endpoints

**Check backend is responding:**
```bash
# From inside a container
docker compose -f docker-compose.prod.caddy.yml exec caddy \
  curl http://backend:4000/api/health
```

**If 404 in browser but works inside container:**
- Caddy proxy rule not matching
- Check `Caddyfile` has `/api/*` rule
- Restart Caddy after changing Caddyfile

---

### Socket.IO not connecting (real-time chat broken)

**Check:**
1. Socket.IO endpoint is reachable:
```bash
curl https://your-domain.com/socket.io/
```

2. Backend Socket.IO is running:
```bash
docker compose -f docker-compose.prod.caddy.yml logs backend | grep socket.io
```

3. Redis is running (required for multi-container Socket.IO):
```bash
docker compose -f docker-compose.prod.caddy.yml exec redis redis-cli -p 6380 ping
```

**Browser console errors:**
- `CORS error` → `FRONTEND_URL` in `.env.prod` doesn't match the domain
- `Connection refused` → Backend not running or port wrong
- `Cannot find Socket.IO` → Frontend not built correctly

---

## HTTPS/TLS Issues

### Caddy can't get certificate (stuck on HTTP)

**Check DNS:**
```bash
nslookup your-domain.com
# Should show your server's IP
```

**Check Caddy logs:**
```bash
docker compose -f docker-compose.prod.caddy.yml logs caddy | grep -i "acme\|https\|cert"
```

**Common issues:**
- DNS not propagated yet (wait 5-10 minutes, then restart Caddy)
- Port 80 blocked by firewall (Let's Encrypt needs it for validation)
- Rate limited by Let's Encrypt (wait 1+ hour before retry)

**Force cert renewal:**
```bash
docker compose -f docker-compose.prod.caddy.yml down
rm -rf caddy_data caddy_config
docker compose -f docker-compose.prod.caddy.yml up -d
```

---

### "SSL: CERTIFICATE_VERIFY_FAILED" on clients

**If you're using self-signed certs or old certs:**

Option 1: Update your cert (Let's Encrypt via Caddy):
```bash
docker compose -f docker-compose.prod.caddy.yml logs caddy
```

Option 2: If testing locally with HTTP:
- Use `http://localhost:3002` (not HTTPS)
- Or create a self-signed cert and trust it locally

---

## Performance Issues

### App is slow

**Check CPU/memory usage:**
```bash
docker stats
```

**If high CPU:**
- Check for infinite loops in logs: `docker compose logs | grep -i "error"` every 10 seconds
- Frontend rebuild stuck: Try `docker compose -f docker-compose.prod.caddy.yml up -d --build --force-recreate`

**If high memory:**
- Node.js memory leak? Restart backend: `docker compose -f docker-compose.prod.caddy.yml restart backend`
- Database query slow? Check Postgres logs: `docker compose logs postgres`
- Redis memory full? Check: `docker exec <redis-container> redis-cli -p 6380 info memory`

---

### High latency / timeouts

**Check network:**
```bash
docker compose -f docker-compose.prod.caddy.yml exec backend \
  ping frontend
```

**If high (>1ms between containers):**
- Server under heavy load
- Network misconfiguration
- Check `docker network ls` and verify containers on same network

**Check if using volumes over network:**
```bash
docker volume ls | grep uploads
docker volume inspect <uploads-volume-name>
```

---

### Uploads slow or stuck

**Check volume mount:**
```bash
docker compose -f docker-compose.prod.caddy.yml exec backend \
  dd if=/dev/zero of=/app/uploads/test.bin bs=1M count=10
```

**If slow:**
- Using network volume (NFS, SMB) instead of local
- Disk I/O bottleneck (check `iostat`)
- File system full: `docker exec <backend> df -h`

---

## Auth Issues

### "Invalid credentials" or redirect loop

**Check:**
1. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are in `.env.prod`
2. Google Cloud Console has correct redirect URI: `https://your-domain.com/api/auth/callback/google`
3. `NEXTAUTH_SECRET` is set and hasn't changed
4. `NEXTAUTH_URL` matches your domain: `https://your-domain.com`

**Debug:**
```bash
# Check what the frontend sees
docker compose -f docker-compose.prod.caddy.yml exec frontend \
  env | grep NEXT
```

**Test manually:**
1. Go to `https://your-domain.com/`
2. Open browser DevTools → Network tab
3. Click "Continue with Google"
4. Watch the redirect chain
5. Note any errors in the Network or Console tabs

---

### Session persists after logout / login remains after restart

**Issue:** Session token not being cleared.

**Fix:**
```bash
# Clear all sessions in Redis
docker compose -f docker-compose.prod.caddy.yml exec redis \
  redis-cli -p 6380 FLUSHDB
```

---

## Disk Space Issues

### "No space left on device"

**Check usage:**
```bash
df -h /
docker system df
```

**Clean up Docker:**
```bash
# Remove unused images, containers, volumes
docker system prune -a --volumes

# Or just unused volumes
docker volume prune
```

**Check specific volume size:**
```bash
docker exec <postgres-container> du -sh /var/lib/postgresql/data
```

---

### Backup is huge / Postgres data too large

**Check table sizes:**
```bash
docker compose exec postgres \
  psql -U social -d social -c \
  "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) \
   FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

**Archive old data:**
```bash
docker compose exec postgres \
  psql -U social -d social -c \
  "DELETE FROM posts WHERE created_at < NOW() - INTERVAL '6 months';"
```

---

## Log Issues

### Too many logs, hard to debug

**Filter logs:**
```bash
# Just errors
docker compose -f docker-compose.prod.caddy.yml logs backend 2>&1 | grep -i error

# Last 100 lines
docker compose -f docker-compose.prod.caddy.yml logs --tail=100 backend

# Follow in real-time
docker compose -f docker-compose.prod.caddy.yml logs -f backend

# Between timestamps
docker compose -f docker-compose.prod.caddy.yml logs --since 10m backend
```

**Save logs for analysis:**
```bash
docker compose -f docker-compose.prod.caddy.yml logs > all-logs.txt
```

---

## Recovery Procedures

### Quick restart (all services)

```bash
docker compose -f docker-compose.prod.caddy.yml restart
```

### Graceful shutdown and restart

```bash
docker compose -f docker-compose.prod.caddy.yml down
docker compose -f docker-compose.prod.caddy.yml up -d
```

### Start fresh (lose data)

```bash
docker compose -f docker-compose.prod.caddy.yml down -v
docker compose -f docker-compose.prod.caddy.yml up -d --build
```

### Rollback to previous working state

If you're on git:
```bash
git log --oneline
git checkout <commit-hash>
docker compose -f docker-compose.prod.caddy.yml up -d --build
```

---

## Monitoring Health

### Set up alerting

**Check services every minute:**
```bash
while true; do
  docker compose -f docker-compose.prod.caddy.yml ps | grep -i "exited" && \
    echo "ALERT: A service crashed!" || echo "All services running"
  sleep 60
done
```

**Better: Use Docker healthchecks**

All services in the compose file include `healthcheck` directives. Monitor them:
```bash
watch -n5 'docker compose -f docker-compose.prod.caddy.yml ps'
```

---

## When All Else Fails

### Reset everything (NUCLEAR OPTION)

⚠️ **This deletes all data. Only do this if you have backups.**

```bash
# Stop everything
docker compose -f docker-compose.prod.caddy.yml down -v

# Remove dangling volumes/images
docker system prune -a --volumes

# Start fresh
docker compose -f docker-compose.prod.caddy.yml up -d --build

# Check logs
docker compose -f docker-compose.prod.caddy.yml logs -f
```

### Restore from backup

```bash
# If you have a backup file
gunzip < backup-2025-06-02.sql.gz | \
  docker compose -f docker-compose.prod.caddy.yml exec -T postgres \
  psql -U social -d social
```

---

## Getting Help

**Check logs first:**
```bash
docker compose -f docker-compose.prod.caddy.yml logs | tail -100
```

**Provide this info when asking for help:**
```bash
docker compose -f docker-compose.prod.caddy.yml ps
docker compose -f docker-compose.prod.caddy.yml logs --tail=50
docker system df
```

**Resources:**
- Docker Troubleshooting: https://docs.docker.com/config/containers/logging/
- Next.js Deployment: https://nextjs.org/docs/deployment
- Caddy Issues: https://github.com/caddyserver/caddy/discussions
- Prisma Help: https://www.prisma.io/docs/concepts/components/prisma-client/working-with-prismaclient/error-formatting

---

**Good luck! Production issues are learning opportunities. 🚀**
