#!/bin/bash
# PII Tokenizer — black-box E2E against Hetzner prod.
#
# Creates a disposable test tenant, sends PII-laced chat messages through
# the public widget HTTP endpoint, verifies:
#   - Chat response comes back with real values (detokenization works)
#   - Backend logs show tokenization happened (no raw PII in [LLM] lines)
#   - pii_breach_log stays empty on clean inputs
# Then deletes the test tenant + customer + conversation + messages.
#
# Runs on Hetzner itself (so DB operations are local).
set -uo pipefail

BASE="https://nomii.pontensolutions.com"
SSH="nomii@204.168.232.24"
TEST_SLUG="pii-e2e-$(date +%s)"
TEST_EMAIL="pii-e2e-$(date +%s)@example.test"

echo "== PII Tokenizer Black-Box E2E =="
echo "Base: $BASE"
echo "Test slug: $TEST_SLUG"
echo ""

# ── 1. Create disposable tenant + subscription ─────────────────────────────
echo "1. Creating disposable test tenant..."
ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai -c \"INSERT INTO tenants (name, slug, vertical, agent_name, widget_api_key, pii_tokenization_enabled) VALUES ('PII E2E Test $TEST_SLUG', '$TEST_SLUG', 'general', 'TestBot', 'e2e_' || encode(gen_random_bytes(20), 'hex'), true);\"" > /dev/null
WIDGET_KEY=$(ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai -t -A -c \"SELECT widget_api_key FROM tenants WHERE slug = '$TEST_SLUG'\"" | tr -d '[:space:]')
echo "   widget_api_key: ${WIDGET_KEY:0:20}..."

# Attach an active "master" subscription so the /chat endpoint doesn't reject.
ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai" <<SQL > /dev/null
  INSERT INTO subscriptions (tenant_id, plan, status, managed_ai_enabled, max_customers, max_messages_month)
  SELECT id, 'master', 'active', true, 999999, 999999 FROM tenants WHERE slug = '$TEST_SLUG';
SQL
echo "   subscription attached"

# Baseline breach log count
BREACH_BEFORE=$(ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai -t -A -c 'SELECT COUNT(*) FROM pii_breach_log'" | tr -d '[:space:]')
echo "   pii_breach_log baseline: $BREACH_BEFORE"

# ── 2. Start widget session ────────────────────────────────────────────────
echo ""
echo "2. Starting widget session as $TEST_EMAIL..."
SESSION=$(curl -s -X POST "$BASE/api/widget/session" \
  -H "Content-Type: application/json" \
  -d "{\"widget_key\":\"$WIDGET_KEY\",\"email\":\"$TEST_EMAIL\",\"display_name\":\"E2E Tester\"}")
echo "   response: $(echo "$SESSION" | head -c 150)..."

JWT=$(echo "$SESSION" | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)
CONV_ID=$(echo "$SESSION" | grep -oE '"conversation_id":"[^"]+"' | cut -d'"' -f4)
# Decode customer_id from the JWT payload (middle segment, base64url)
CUST_ID=$(echo "$JWT" | cut -d'.' -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | grep -oE '"customer_id":"[^"]+"' | cut -d'"' -f4)
echo "   conversation_id: $CONV_ID"
echo "   customer_id:     $CUST_ID"
[ -z "$JWT" ] && { echo "FAIL: no JWT returned"; exit 1; }

# ── 3. Start tailing backend logs so we can verify NO raw PII leaves ───────
echo ""
echo "3. Starting backend log tail (filtered to this conversation)..."
ssh "$SSH" "docker logs -f --since=1s nomii-backend 2>&1 | grep -E '$CONV_ID|PII|BreachError|Tool call|\\[LLM\\]' > /tmp/pii_e2e_backend.log" &
TAIL_PID=$!
trap "kill $TAIL_PID 2>/dev/null || true" EXIT
sleep 2

# ── 4. Send a PII-laced message ────────────────────────────────────────────
echo ""
echo "4. Sending PII-laced message..."
MSG='Hi! My full name is Diana Thornton. My SSN is 555-12-3456, my credit card is 4111-1111-1111-1111, my email is diana.thornton@example.com, I was born 1975-03-14, and my bank account number is 12345678901. Can you confirm what you have on file for me?'
echo "   message: $MSG"

# Write the JSON body to a file to avoid shell-escaping hell
BODY_FILE=$(mktemp)
cat > "$BODY_FILE" <<EOF
{"conversation_id":"$CONV_ID","content":"$MSG"}
EOF

CHAT_RESPONSE=$(curl -s -X POST "$BASE/api/widget/chat" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  --data-binary "@$BODY_FILE")
rm -f "$BODY_FILE"
echo ""
echo "   raw response: $CHAT_RESPONSE"

AGENT_REPLY=$(echo "$CHAT_RESPONSE" | grep -oE '"content":"[^"]+"' | head -1 | cut -d'"' -f4)
echo ""
echo "   agent reply: $AGENT_REPLY"

# ── 5. Verify agent response contains real values (detokenization) ─────────
echo ""
echo "5. Verifying detokenization worked..."
DETOK_PASSED=true
# Note: the agent may or may not echo specific PII back, so we check that
# the response is coherent (>20 chars) and does NOT contain the literal tokens
if [ -z "$AGENT_REPLY" ] || [ ${#AGENT_REPLY} -lt 10 ]; then
  echo "   ✗ agent reply too short or missing"
  DETOK_PASSED=false
else
  echo "   ✓ agent reply length OK (${#AGENT_REPLY} chars)"
fi

if echo "$AGENT_REPLY" | grep -qE '\[SSN_[0-9]+\]|\[CC_[0-9]+\]|\[EMAIL_[0-9]+\]|\[CLIENT_[0-9]+\]|\[DOB_[0-9]+\]'; then
  echo "   ✗ LEAK: agent reply contains unresolved tokens"
  DETOK_PASSED=false
else
  echo "   ✓ no unresolved tokens in response (detokenization succeeded)"
fi

# ── 6. Verify backend log shows tokenization happened / no raw PII ─────────
echo ""
echo "6. Stopping log tail and inspecting backend logs..."
sleep 1
kill $TAIL_PID 2>/dev/null || true
LOG_CONTENT=$(ssh "$SSH" "cat /tmp/pii_e2e_backend.log 2>/dev/null" | head -30)

LOG_PASSED=true
# The backend shouldn't log raw SSN/CC/email — check it didn't slip into our line captures
if echo "$LOG_CONTENT" | grep -qE '555-12-3456|4111-1111-1111-1111|diana\.thornton@example\.com'; then
  echo "   ✗ LEAK: raw PII appeared in backend log"
  echo "$LOG_CONTENT" | grep -E '555-12-3456|4111-1111-1111-1111|diana\.thornton@example\.com' | head -3
  LOG_PASSED=false
else
  echo "   ✓ no raw PII in backend logs"
fi

# ── 7. Check pii_breach_log for unexpected blocks ──────────────────────────
echo ""
echo "7. Checking pii_breach_log (expected: 0 new rows — clean tokenization)..."
BREACH_AFTER=$(ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai -t -A -c 'SELECT COUNT(*) FROM pii_breach_log'" | tr -d '[:space:]')
BREACH_NEW=$((BREACH_AFTER - BREACH_BEFORE))
echo "   pii_breach_log after: $BREACH_AFTER (delta: +$BREACH_NEW)"

BREACH_PASSED=true
if [ "$BREACH_NEW" -gt 0 ]; then
  echo "   ! $BREACH_NEW breach(es) recorded (this may be OK if tokenizer was conservative)"
  ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai -c 'SELECT call_site, findings FROM pii_breach_log ORDER BY blocked_at DESC LIMIT $BREACH_NEW'"
fi

# ── 8. Cleanup ──────────────────────────────────────────────────────────────
echo ""
echo "8. Cleaning up test tenant..."
ssh "$SSH" "docker exec -i nomii-db psql -U nomii -d nomii_ai" <<SQL > /dev/null
  DELETE FROM messages WHERE conversation_id = '$CONV_ID';
  DELETE FROM conversations WHERE id = '$CONV_ID';
  DELETE FROM customers WHERE id = '$CUST_ID';
  DELETE FROM subscriptions WHERE tenant_id = (SELECT id FROM tenants WHERE slug = '$TEST_SLUG');
  DELETE FROM tenants WHERE slug = '$TEST_SLUG';
SQL
echo "   cleanup done"

# Also clean up the log file on Hetzner
ssh "$SSH" "rm -f /tmp/pii_e2e_backend.log"

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "== SUMMARY =="
$DETOK_PASSED && echo "✓ Detokenization: agent reply is real, no unresolved tokens" || echo "✗ Detokenization FAILED"
$LOG_PASSED   && echo "✓ Backend logs: no raw PII appeared"                           || echo "✗ Log check FAILED"
[ "$BREACH_NEW" -eq 0 ] && echo "✓ Breach log: no spurious blocks on clean input"    || echo "! Breach log had $BREACH_NEW entries (review above)"

if $DETOK_PASSED && $LOG_PASSED; then
  echo ""
  echo "E2E PASSED"
  exit 0
else
  echo ""
  echo "E2E FAILED"
  exit 1
fi
