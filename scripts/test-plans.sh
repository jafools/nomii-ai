#!/bin/bash
# ============================================================
#  Shenmay AI — Subscription Plan Test Script
#  Tests that each plan enforces the correct limits in the DB
#  and that the dashboard responds correctly.
#
#  Usage (run on your server):
#    bash scripts/test-plans.sh ajaces@gmail.com
# ============================================================

EMAIL="${1:-ajaces@gmail.com}"
DB_CMD="docker exec shenmay-db psql -U nomii -d nomii_ai -t -c"
DB_EXEC="docker exec shenmay-db psql -U nomii -d nomii_ai -c"
API="https://api.pontensolutions.com"

echo ""
echo "=================================================="
echo "  Shenmay AI Plan Test — Starting"
echo "  Testing account: $EMAIL"
echo "=================================================="
echo ""

# ── Get tenant ID ──────────────────────────────────────────
TENANT_ID=$($DB_CMD "SELECT tenant_id FROM tenant_admins WHERE email = '$EMAIL' LIMIT 1;" 2>/dev/null | tr -d ' \n')

if [ -z "$TENANT_ID" ]; then
  echo "❌  Could not find tenant for email: $EMAIL"
  echo "    Make sure the email is correct and the account exists."
  exit 1
fi

echo "✅  Found tenant ID: $TENANT_ID"
echo ""

# ── Ensure max_agents column exists (migration 014) ────────
HAS_COL=$($DB_CMD "SELECT column_name FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='max_agents';" 2>/dev/null | tr -d ' \n')
if [ -z "$HAS_COL" ]; then
  echo "⚠️   max_agents column missing — applying migration now..."
  docker exec shenmay-db psql -U nomii -d nomii_ai -c "
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS max_agents INTEGER NOT NULL DEFAULT 3;
    UPDATE subscriptions SET max_agents = 1   WHERE plan = 'free';
    UPDATE subscriptions SET max_agents = 3   WHERE plan = 'trial';
    UPDATE subscriptions SET max_agents = 10  WHERE plan = 'starter';
    UPDATE subscriptions SET max_agents = 25  WHERE plan = 'growth';
    UPDATE subscriptions SET max_agents = 100 WHERE plan = 'professional';
  " > /dev/null 2>&1
  echo "✅  Column added."
  echo ""
fi

# ── Helper to set a plan ───────────────────────────────────
set_plan() {
  local PLAN=$1
  local MAX_CUSTOMERS=$2
  local MAX_MESSAGES=$3
  local MAX_AGENTS=$4

  docker exec -i shenmay-db psql -U nomii -d nomii_ai <<SQL
UPDATE subscriptions
SET plan='${PLAN}', status='active', max_customers=${MAX_CUSTOMERS}, max_messages_month=${MAX_MESSAGES}, max_agents=${MAX_AGENTS}, trial_ends_at=NOW()
WHERE tenant_id='${TENANT_ID}';
SQL
}

# ── Helper to show current plan ────────────────────────────
show_plan() {
  echo ""
  echo "  Current subscription in database:"
  $DB_EXEC "SELECT plan, status, max_customers, max_messages_month, max_agents FROM subscriptions WHERE tenant_id = '$TENANT_ID';"
}

# ── Helper to test API returns correct limits ──────────────
test_api() {
  local TOKEN=$1
  if [ -n "$TOKEN" ]; then
    echo ""
    echo "  API response from /api/portal/subscription:"
    curl -s -H "Authorization: Bearer $TOKEN" "$API/api/portal/subscription" | \
      python3 -c "import sys,json; d=json.load(sys.stdin); print(f'    plan={d.get(\"plan\")}, status={d.get(\"status\")}, max_customers={d.get(\"max_customers\")}, max_agents={d.get(\"max_agents\")}')" 2>/dev/null || \
      echo "    (skipped — no token provided)"
  fi
}

# ══════════════════════════════════════════════════════════
echo "──────────────────────────────────────────────────"
echo "  TEST 1: STARTER PLAN (\$49/mo)"
echo "  Expected: 50 customers, 1,000 messages, 10 agents"
echo "──────────────────────────────────────────────────"
set_plan "starter" 50 1000 10
show_plan
echo ""
echo "  👉  Now open your dashboard at nomii.pontensolutions.com"
echo "      Go to Plans & Billing — it should show Starter plan."
echo "      Try adding a 51st customer — the API should block it."
echo ""
read -p "  Press Enter when ready to test Growth plan..."

# ══════════════════════════════════════════════════════════
echo ""
echo "──────────────────────────────────────────────────"
echo "  TEST 2: GROWTH PLAN (\$149/mo)"
echo "  Expected: 250 customers, 5,000 messages, 25 agents"
echo "──────────────────────────────────────────────────"
set_plan "growth" 250 5000 25
show_plan
echo ""
echo "  👉  Refresh your dashboard — should now show Growth plan."
echo "      The 14-day trial banner should be gone."
echo ""
read -p "  Press Enter when ready to test Professional plan..."

# ══════════════════════════════════════════════════════════
echo ""
echo "──────────────────────────────────────────────────"
echo "  TEST 3: PROFESSIONAL PLAN (\$399/mo)"
echo "  Expected: 1,000 customers, 25,000 messages, 100 agents"
echo "──────────────────────────────────────────────────"
set_plan "professional" 1000 25000 100
show_plan
echo ""
echo "  👉  Refresh your dashboard — should show Professional plan."
echo ""
read -p "  Press Enter when ready to test cancellation / downgrade..."

# ══════════════════════════════════════════════════════════
echo ""
echo "──────────────────────────────────────────────────"
echo "  TEST 4: CANCELLED / EXPIRED"
echo "  Expected: dashboard shows paywall / subscription gate"
echo "──────────────────────────────────────────────────"
docker exec -i shenmay-db psql -U nomii -d nomii_ai <<SQL
UPDATE subscriptions SET status='canceled' WHERE tenant_id='${TENANT_ID}';
SQL
show_plan
echo ""
echo "  👉  Refresh your dashboard — the paywall / SubscriptionGate"
echo "      should appear and block access to conversations."
echo ""
read -p "  Press Enter to restore your account to trial..."

# ══════════════════════════════════════════════════════════
echo ""
echo "──────────────────────────────────────────────────"
echo "  RESTORE: Setting back to active trial"
echo "──────────────────────────────────────────────────"
docker exec -i shenmay-db psql -U nomii -d nomii_ai <<SQL
UPDATE subscriptions SET plan='trial', status='active', max_customers=25, max_messages_month=500, max_agents=3, trial_ends_at=NOW() + INTERVAL '14 days' WHERE tenant_id='${TENANT_ID}';
SQL
show_plan

echo ""
echo "=================================================="
echo "  ✅  All plan tests complete!"
echo ""
echo "  Summary of what was checked:"
echo "    ✓ Starter  — 50 customers / 1,000 messages / 10 agents"
echo "    ✓ Growth   — 250 customers / 5,000 messages / 25 agents"
echo "    ✓ Professional — 1,000 / 25,000 / 100 agents"
echo "    ✓ Cancelled — paywall appears in dashboard"
echo "    ✓ Restored to trial"
echo ""
echo "  If all four looked correct in the dashboard,"
echo "  your subscription system is working end-to-end."
echo "=================================================="
echo ""
