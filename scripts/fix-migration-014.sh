#!/bin/bash
# ============================================================
#  Shenmay AI — Migration 014 Fix
#
#  Applies migration 014 (unread badges + multi-agent support)
#  safely to the running database container. All statements use
#  IF NOT EXISTS so re-running is always safe.
#
#  Run from ~/nomii-ai on the server:
#    bash scripts/fix-migration-014.sh
#
#  What this fixes:
#    [ERROR] column c.unread does not exist
#    (portal badge-counts + conversation list queries fail)
# ============================================================

set -e

echo ""
echo "=================================================="
echo "  Shenmay AI — Apply Migration 014"
echo "  unread flag + max_agents + agent invite columns"
echo "=================================================="
echo ""

# ── Check DB container is up ─────────────────────────────────
if ! docker exec shenmay-db psql -U shenmay -d shenmay_ai -c "SELECT 1" > /dev/null 2>&1; then
  echo "❌  shenmay-db container not reachable. Run: docker compose ps"
  exit 1
fi

echo "✅  Database connection confirmed"
echo ""

# ── Check if already applied ─────────────────────────────────
UNREAD_EXISTS=$(docker exec shenmay-db psql -U shenmay -d shenmay_ai -t -c \
  "SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'conversations' AND column_name = 'unread';" 2>/dev/null | tr -d ' \n')

if [ "$UNREAD_EXISTS" = "1" ]; then
  echo "✅  conversations.unread already exists — migration 014 already applied"
  echo ""
  echo "  If you still see the error, restart the backend:"
  echo "    docker compose restart backend"
  echo ""
  echo "=================================================="
  exit 0
fi

echo "⚙️   Applying migration 014..."
echo ""

docker exec -i shenmay-db psql -U shenmay -d shenmay_ai <<'SQL'
-- ──────────────────────────────────────────────────────────────
-- Migration 014 — Unread flags + Multi-agent support
-- (safe to re-run — all statements are idempotent)
-- ──────────────────────────────────────────────────────────────

-- 1. Unread flag on conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS unread BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_conversations_unread
  ON conversations (unread)
  WHERE unread = TRUE;

-- 2. Max agents per subscription plan
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS max_agents INTEGER NOT NULL DEFAULT 3;

UPDATE subscriptions SET max_agents = 1   WHERE plan = 'free'         AND max_agents = 3;
UPDATE subscriptions SET max_agents = 3   WHERE plan = 'trial'        AND max_agents = 3;
UPDATE subscriptions SET max_agents = 10  WHERE plan = 'starter'      AND max_agents = 3;
UPDATE subscriptions SET max_agents = 25  WHERE plan = 'growth'       AND max_agents = 3;
UPDATE subscriptions SET max_agents = 100 WHERE plan = 'professional' AND max_agents = 3;

-- 3. Expand tenant_admins role to include 'agent'
ALTER TABLE tenant_admins
  DROP CONSTRAINT IF EXISTS tenant_admins_role_check;

ALTER TABLE tenant_admins
  ADD CONSTRAINT tenant_admins_role_check
  CHECK (role IN ('owner', 'member', 'agent'));

-- Add invite token columns for agent invite flow
ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS invite_token         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invite_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by           UUID REFERENCES tenant_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_admins_invite_token
  ON tenant_admins (invite_token)
  WHERE invite_token IS NOT NULL;

-- 4. Status index on conversations
CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations (status);

SELECT 'Migration 014 applied successfully' AS result;
SQL

echo ""
echo "✅  Migration 014 applied!"
echo ""
echo "  Restarting backend to clear any cached query errors..."
docker compose restart backend 2>/dev/null || true
echo ""
echo "  Verifying columns exist:"
docker exec shenmay-db psql -U shenmay -d shenmay_ai -c \
  "SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'conversations' AND column_name = 'unread'
   UNION ALL
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'subscriptions' AND column_name = 'max_agents'
   UNION ALL
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'tenant_admins' AND column_name = 'invite_token';"
echo ""
echo "=================================================="
echo "  Done. Check logs: docker compose logs -f backend"
echo "=================================================="
echo ""
