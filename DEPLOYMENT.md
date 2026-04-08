# Nomii AI — Deployment & Migration Guide
*Last updated: 2026-04-08*

---

## Current Production State

| Item | Value |
|------|-------|
| Server | Proxmox VM at `81.224.218.93` |
| API | `https://api.pontensolutions.com` (Cloudflare Tunnel) |
| Portal | `https://nomii.pontensolutions.com` (Lovable frontend) |
| DB | PostgreSQL 16, DB name `nomii_ai`, user `knomi` |
| Containers | `nomii-db`, `nomii-backend`, `knomi-frontend`, `knomi-cloudflared` |
| Tunnel ID | `fb2cb466-3f4f-46f8-8a0c-2b45c549bbe4` |

---

## Migrating to Hetzner CX22

> **Why Hetzner:** €4/mo, datacenter uptime SLA, static IP, identical Docker Compose setup.
> Zero code changes required — this is purely an infrastructure move.

### Phase 1 — Provision Hetzner Server

1. Create account at [hetzner.com/cloud](https://hetzner.com/cloud)
2. New Project → **Add Server**
   - Location: `Ashburn, VA` (US) or `Nuremberg` (EU) — pick closest to your users
   - Image: **Ubuntu 24.04**
   - Type: **CX22** (2 vCPU, 4 GB RAM, 40 GB SSD)
   - SSH key: paste your public key (`~/.ssh/id_rsa.pub` on your Windows machine via WSL or Git Bash)
   - Name: `nomii-prod`
3. Note the server's public IPv4 (e.g. `65.21.xxx.xxx`)

### Phase 2 — Install Docker on Hetzner

```bash
ssh root@<hetzner-ip>

apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

### Phase 3 — Clone Repo + Configure Env

```bash
cd ~
git clone https://github.com/jafools/nomii-ai.git nomii-ai
cd nomii-ai

# Copy env from Proxmox (run this on Proxmox, scp to Hetzner)
# On Proxmox:
scp ~/Knomi/knomi-ai/.env root@<hetzner-ip>:~/knomi-ai/.env

# Or manually create on Hetzner and paste all values from Proxmox .env
nano .env
```

**Critical env vars to verify are set:**
```
ANTHROPIC_API_KEY=          # use the NEW rotated key
CLAUDE_API_KEY=             # same as above
JWT_SECRET=
WIDGET_JWT_SECRET=
API_KEY_ENCRYPTION_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_PROFESSIONAL=
STRIPE_PORTAL_RETURN_URL=https://app.pontensolutions.com/nomii/dashboard/plans
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
MASTER_EMAIL=ajaces@gmail.com
LLM_HAIKU_MODEL=claude-haiku-4-5-20251001
LLM_SONNET_MODEL=claude-sonnet-4-20250514
CLOUDFLARE_TUNNEL_TOKEN=    # same token as Proxmox
PORTAL_URL=https://nomii.pontensolutions.com
LOGIN_RATE_LIMIT_MAX=3
WIDGET_SESSION_RATE_LIMIT_MAX=6
```

### Phase 4 — Backup DB from Proxmox

```bash
# On Proxmox — dump the full database
# --no-owner strips OWNER clauses so the dump restores cleanly under the new 'nomii' user on Hetzner
cd ~/Knomi/knomi-ai
docker compose exec -T db pg_dump -U knomi --no-owner --no-privileges knomi_ai > /tmp/nomii_backup.sql

# Verify dump looks sane (should be several MB, not empty)
wc -l /tmp/nomii_backup.sql
head -5 /tmp/nomii_backup.sql

# Copy to Hetzner
scp /tmp/nomii_backup.sql root@<hetzner-ip>:/tmp/nomii_backup.sql
```

### Phase 5 — Start Services on Hetzner (DB only first)

```bash
# On Hetzner — start ONLY the database container first
cd ~/knomi-ai
docker compose up -d db

# Wait ~10 seconds for Postgres to initialize, then restore the dump
sleep 10
docker compose exec -T db psql -U nomii -d nomii_ai < /tmp/nomii_backup.sql

# Verify row counts match Proxmox
docker compose exec db psql -U nomii -d nomii_ai -c "
  SELECT
    (SELECT COUNT(*) FROM tenants) AS tenants,
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM conversations) AS conversations,
    (SELECT COUNT(*) FROM messages) AS messages;
"
```

Cross-check these numbers against Proxmox:
```bash
# Run same query on Proxmox to compare
docker compose exec db psql -U nomii -d nomii_ai -c "
  SELECT
    (SELECT COUNT(*) FROM tenants) AS tenants,
    (SELECT COUNT(*) FROM customers) AS customers,
    (SELECT COUNT(*) FROM conversations) AS conversations,
    (SELECT COUNT(*) FROM messages) AS messages;
"
```

### Phase 6 — Start Backend + Frontend on Hetzner (no tunnel yet)

```bash
# On Hetzner — start backend and frontend, skip cloudflared for now
docker compose up -d --build backend frontend

# Tail logs to confirm clean startup (no errors)
docker compose logs -f backend
# Look for: "Server running on port 3001" — Ctrl+C when confirmed

# Quick health check direct to IP (bypasses Cloudflare)
curl http://<hetzner-ip>:3001/api/health
# Expected: {"status":"ok",...}
```

### Phase 7 — Cutover (Switch Tunnel to Hetzner)

This is the moment of switchover. It takes ~30 seconds. Plan for a brief interruption.

```bash
# Step 1: Stop cloudflared on Proxmox
# On Proxmox:
docker compose stop cloudflared

# Step 2: Start cloudflared on Hetzner
# On Hetzner:
docker compose up -d cloudflared

# Step 3: Verify tunnel is routing to Hetzner
curl https://api.pontensolutions.com/api/health
# Should return {"status":"ok"} within 10-15 seconds

# Step 4: Test the live widget
# Open hub.hopeforthisnation.com and send a message
# Check dashboard at nomii.pontensolutions.com
```

### Phase 8 — Verify Everything

Run through this checklist after cutover:

- [ ] `https://api.pontensolutions.com/api/health` returns `{"status":"ok"}`
- [ ] Login to `https://nomii.pontensolutions.com` works
- [ ] Conversations list loads
- [ ] Widget at `hub.hopeforthisnation.com` opens and accepts a message
- [ ] AI responds in the widget
- [ ] Trigger a flag → check dashboard shows it
- [ ] Check email is received for the flag notification
- [ ] Analytics page loads with data

### Phase 9 — Set Up Automated DB Backups

```bash
# On Hetzner — create daily backup script
cat > /root/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/root/db-backups
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker compose -f /root/knomi-ai/docker-compose.yml exec -T db \
  pg_dump -U nomii nomii_ai > $BACKUP_DIR/nomii_$TIMESTAMP.sql
# Keep last 14 days only
find $BACKUP_DIR -name "*.sql" -mtime +14 -delete
echo "Backup complete: nomii_$TIMESTAMP.sql"
EOF

chmod +x /root/backup-db.sh

# Schedule daily at 2am
(crontab -l 2>/dev/null; echo "0 2 * * * /root/backup-db.sh >> /var/log/nomii-backup.log 2>&1") | crontab -

# Test it runs
/root/backup-db.sh
ls /root/db-backups/
```

### Phase 10 — Decommission Proxmox

Only do this after running on Hetzner for at least **48 hours** without issues.

```bash
# On Proxmox — final backup before shutdown
docker compose exec -T db pg_dump -U knomi --no-owner --no-privileges knomi_ai > ~/nomii_final_backup_$(date +%Y%m%d).sql

# Stop all containers
docker compose down

# Keep the Proxmox VM around for 2 weeks as a fallback
# Then delete it once you're confident
```

---

## Rollback Plan

If anything goes wrong during cutover:

```bash
# On Proxmox — restart cloudflared to take traffic back
docker compose up -d cloudflared

# On Hetzner — stop cloudflared so it stops competing
docker compose stop cloudflared
```

Traffic will return to Proxmox within ~15 seconds. No data loss since the DB on Hetzner wasn't yet taking live writes during verification.

---

## Routine Operations (post-migration)

```bash
# Deploy a code update
cd ~/knomi-ai && git pull && docker compose up --build -d

# Apply a new DB migration
docker compose exec -T db psql -U nomii -d nomii_ai < server/db/migrations/XXX_name.sql

# View logs
docker compose logs -f backend
docker compose logs -f --tail=100 backend

# Check container health
docker compose ps

# Manual DB backup
/root/backup-db.sh
```

---

## Emergency: Restore DB from Backup

```bash
# Stop backend so no new writes come in
docker compose stop backend

# Drop and recreate DB
docker compose exec db psql -U nomii -c "DROP DATABASE nomii_ai;"
docker compose exec db psql -U nomii -c "CREATE DATABASE nomii_ai;"

# Restore from backup file
docker compose exec -T db psql -U nomii -d nomii_ai < /root/db-backups/nomii_YYYYMMDD_HHMMSS.sql

# Restart backend
docker compose start backend
```
