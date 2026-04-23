#!/bin/bash
# ============================================================
#  Shenmay AI — Stripe Webhook Simulator (bash version)
#  Simulates a signed checkout.session.completed event
#  using curl + openssl — no Node.js required.
#
#  Usage (run on your server):
#    bash scripts/test-webhook.sh starter
#    bash scripts/test-webhook.sh growth
#    bash scripts/test-webhook.sh professional
# ============================================================

PLAN="${1:-starter}"
EMAIL="${2:-ajaces@gmail.com}"
ENV_FILE="./.env"

# ── Load env vars (safe — handles special chars in Stripe secrets) ──
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value; do
    # Skip comments and blank lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${key// }" ]] && continue
    # Strip inline comments and surrounding quotes from value
    value="${value%%#*}"
    value="${value%"${value##*[![:space:]]}"}"  # trim trailing whitespace
    value="${value#\"}" ; value="${value%\"}"   # strip double-quotes
    value="${value#\'}" ; value="${value%\'}"   # strip single-quotes
    export "$key=$value"
  done < "$ENV_FILE"
fi

WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
WEBHOOK_URL="http://localhost:3001/api/stripe/webhook"

# ── Plan → Price ID mapping ───────────────────────────────
case "$PLAN" in
  starter)      PRICE_ID="${STRIPE_PRICE_STARTER:-price_test_starter}" ;;
  growth)       PRICE_ID="${STRIPE_PRICE_GROWTH:-price_test_growth}" ;;
  professional) PRICE_ID="${STRIPE_PRICE_PROFESSIONAL:-price_test_professional}" ;;
  *)
    echo "❌  Unknown plan: $PLAN  (use: starter / growth / professional)"
    exit 1
    ;;
esac

echo ""
echo "=================================================="
echo "  Shenmay AI — Stripe Webhook Simulator"
echo "  Plan: $PLAN  →  Price ID: $PRICE_ID"
echo "=================================================="
echo ""

# ── Get tenant ID ─────────────────────────────────────────
TENANT_ID=$(docker exec shenmay-db psql -U nomii -d nomii_ai -t -c \
  "SELECT tenant_id FROM tenant_admins WHERE email = '$EMAIL' LIMIT 1;" 2>/dev/null | tr -d ' \n')

if [ -z "$TENANT_ID" ]; then
  echo "❌  Could not find tenant for: $EMAIL"
  echo "    Usage: bash scripts/test-webhook.sh starter your@email.com"
  exit 1
fi

echo "✅  Tenant ID: $TENANT_ID"
echo "✅  Simulating $PLAN purchase..."
echo ""

# ── Build the fake Stripe event payload ───────────────────
TIMESTAMP=$(date +%s)
EVENT_ID="evt_test_${TIMESTAMP}"
SESSION_ID="cs_test_${TIMESTAMP}"
CUSTOMER_ID="cus_test_${TIMESTAMP}"
SUB_ID="sub_test_${TIMESTAMP}"

PAYLOAD=$(cat <<EOF
{"id":"${EVENT_ID}","object":"event","type":"checkout.session.completed","data":{"object":{"id":"${SESSION_ID}","object":"checkout.session","client_reference_id":"${TENANT_ID}","customer":"${CUSTOMER_ID}","subscription":"${SUB_ID}","payment_status":"paid","status":"complete","metadata":{"tenant_id":"${TENANT_ID}","plan":"${PLAN}"},"line_items":{"data":[{"price":{"id":"${PRICE_ID}"}}]}}}}
EOF
)

# ── Sign the payload (same algorithm Stripe uses) ─────────
if [ -n "$WEBHOOK_SECRET" ]; then
  SIGNED_PAYLOAD="${TIMESTAMP}.${PAYLOAD}"
  SIGNATURE=$(echo -n "$SIGNED_PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/.*= //')
  STRIPE_SIG="t=${TIMESTAMP},v1=${SIGNATURE}"
  echo "✅  Payload signed with STRIPE_WEBHOOK_SECRET"
else
  STRIPE_SIG="t=${TIMESTAMP},v1=unsigned_test"
  echo "⚠️   STRIPE_WEBHOOK_SECRET not set — webhook will likely reject"
  echo "    Set it in .env and rerun"
fi

echo ""

# ── Send the request ──────────────────────────────────────
HTTP_STATUS=$(curl -s -o /tmp/webhook_response.txt -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: $STRIPE_SIG" \
  -d "$PAYLOAD")

RESPONSE=$(cat /tmp/webhook_response.txt)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅  Webhook accepted! (HTTP 200)"
  echo ""
  echo "📋  Checking database subscription..."
  echo ""
  docker exec shenmay-db psql -U nomii -d nomii_ai \
    -c "SELECT plan, status, max_customers, max_messages_month, max_agents FROM subscriptions WHERE tenant_id = '$TENANT_ID';"
  echo ""
  echo "👉  Refresh your dashboard to confirm the $PLAN plan shows."
else
  echo "❌  Webhook rejected — HTTP $HTTP_STATUS"
  echo "    Response: $RESPONSE"
  echo ""
  echo "  Common causes:"
  echo "  • STRIPE_WEBHOOK_SECRET is wrong or not set in .env"
  echo "  • Price ID not mapped in portal.js getPlanFromPriceId()"
  echo "  • Backend container not running — check: docker compose ps"
fi

echo ""
echo "=================================================="
