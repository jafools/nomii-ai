/**
 * NOMII AI — Widget Routes
 *
 * Endpoints that power the embedded chat widget:
 *
 *   POST /api/widget/session      — Validates tenant key + user identity,
 *                                   auto-creates customer if unknown,
 *                                   returns widget JWT + session flags.
 *
 *   POST /api/widget/set-name     — Saves customer's own name to soul_file
 *   POST /api/widget/set-agent-name — Saves customer's chosen agent nickname
 *   POST /api/widget/chat         — Accepts a message, calls LLM, returns reply
 *   POST /api/widget/end-session  — Triggers memory update + closes conversation
 *   POST /api/widget/flag         — Escalates conversation to Concerns
 *   POST /api/widget/verify       — Silent phone-home from embed.js (Step 4 check)
 *
 * Auth model:
 *   - Widget key  → identifies the tenant (body field widget_key)
 *   - User email  → passed by host page (empty = anonymous mode)
 *   - Widget JWT  → issued by /session, consumed by authenticated routes (2-hour expiry)
 *
 * Dual mode:
 *   - Authenticated (email provided): full soul + memory experience, agent naming
 *   - Anonymous (no email):           pure chat, conversation logged as visitor
 */

const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../db');
const { buildSystemPrompt }                      = require('../engine/promptBuilder');
const { getAgentResponse, callClaudeWithTools, callClaude, sanitiseResponse, resolveApiKey } = require('../services/llmService');
const { updateMemoryAfterSession, updateMemoryAfterExchange } = require('../engine/memoryUpdater');
const { getToolDefinitions }                     = require('../tools/registry');
const { execute: executeTool }                   = require('../tools/executor');
const { loadCustomTools, toToolDefinition, buildCustomExecutor, buildCombinedExecutor } = require('../tools/customToolLoader');
const { requireActiveWidgetSubscription, incrementMessageCount, getSubscription, sendLimitNotificationIfNeeded } = require('../middleware/subscription');
const { sendConcernEmail, sendHumanModeReplyEmail } = require('../services/emailService');
const { writeAuditLog } = require('../middleware/auditLog');
const { encryptJson, safeDecryptJson } = require('../services/cryptoService');
const { fireWebhooks }               = require('../services/webhookService');
const { fireNotifications }          = require('../services/notificationService');

const UNRESTRICTED_PLANS = ['master', 'enterprise'];

// ── In-app notification helper ─────────────────────────────────────────────
// Fire-and-forget. Errors are swallowed so they never interrupt the request.
async function createNotification(tenantId, { type, title, body, resourceType, resourceId, customerName }) {
  try {
    await db.query(
      `INSERT INTO notifications
         (tenant_id, type, title, body, resource_type, resource_id, customer_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, type, title, body || null, resourceType || null, resourceId || null, customerName || null]
    );
  } catch (err) {
    console.error('[Notifications] Insert failed:', err.message);
  }
}

const WIDGET_JWT_SECRET  = process.env.WIDGET_JWT_SECRET || process.env.JWT_SECRET || 'widget-dev-secret';
const WIDGET_JWT_EXPIRY  = '2h';


// ── CORS for widget (cross-origin iframe) ──────────────────────────────────────
function widgetCors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Widget-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

router.use(widgetCors);


// ── Middleware: validate widget session JWT ────────────────────────────────────
function requireWidgetAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Widget session token required' });

  try {
    req.widgetSession = jwt.verify(token, WIDGET_JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired widget session' });
  }
}


// ── POST /api/widget/session ───────────────────────────────────────────────────
//
// Body: { widget_key, email?, display_name? }
//
// If email is provided  → authenticated mode (soul + memory + agent naming)
// If email is absent    → anonymous mode (pure chat, logged as visitor)
//
router.post('/session', async (req, res, next) => {
  try {
    const { widget_key, email, display_name } = req.body;

    if (!widget_key) {
      return res.status(400).json({ error: 'widget_key is required' });
    }

    const isAnonymous = !email || email.trim() === '';

    // 1. Resolve tenant
    const { rows: tenantRows } = await db.query(
      `SELECT id, name, agent_name, slug, primary_color, secondary_color,
              vertical, vertical_config, compliance_config,
              base_soul_template, llm_provider, llm_model,
              chat_bubble_name, website_url
       FROM tenants
       WHERE widget_api_key = $1 AND is_active = true`,
      [widget_key]
    );

    if (tenantRows.length === 0) {
      return res.status(403).json({ error: 'Invalid or inactive widget key' });
    }

    const tenant = tenantRows[0];

    let customer;
    let isNew = false;

    if (isAnonymous) {
      // ── Anonymous visitor ────────────────────────────────────────────────────
      // Generate a unique anon identifier for this session (not persistent across visits)
      const anonId    = crypto.randomBytes(8).toString('hex');
      const anonEmail = `anon_${anonId}@visitor.nomii`;

      const { rows: newRows } = await db.query(
        `INSERT INTO customers (tenant_id, email, first_name, last_name, onboarding_status)
         VALUES ($1, $2, 'Visitor', '', 'pending')
         RETURNING id, first_name, last_name, email, soul_file, memory_file`,
        [tenant.id, anonEmail]
      );
      customer = newRows[0];
      isNew    = true;

    } else {
      // ── Authenticated visitor ─────────────────────────────────────────────────
      const normalizedEmail = email.toLowerCase().trim();

      let { rows: customerRows } = await db.query(
        `SELECT id, first_name, last_name, email, soul_file, memory_file,
                onboarding_status, onboarding_categories_completed
         FROM customers
         WHERE email = $1 AND tenant_id = $2`,
        [normalizedEmail, tenant.id]
      );

      if (customerRows.length === 0) {
        // Auto-create — but check customer limit first
        const sub = await getSubscription(tenant.id);
        const isUnrestricted = sub && UNRESTRICTED_PLANS.includes(sub.plan);

        if (!isUnrestricted && sub && sub.max_customers !== null) {
          const { rows: countRows } = await db.query(
            `SELECT COUNT(*) FROM customers
             WHERE tenant_id = $1 AND deleted_at IS NULL
               AND email NOT LIKE 'anon\\_%@visitor.nomii'`,
            [tenant.id]
          );
          const currentCount = parseInt(countRows[0].count);
          if (currentCount >= sub.max_customers) {
            console.log(`[Widget] Customer limit reached for tenant ${tenant.slug} (${currentCount}/${sub.max_customers}) — rejecting new session`);
            // Fire one-time notification email for trial tenants
            sendLimitNotificationIfNeeded(tenant.id);
            return res.status(403).json({
              error: 'customer_limit_reached',
              message: 'This service is temporarily at capacity. Please try again later.',
            });
          }
        }

        // Derive name from display_name or email prefix
        let firstName = 'Guest';
        let lastName  = '';
        if (display_name && display_name.trim()) {
          const parts = display_name.trim().split(/\s+/);
          firstName = parts[0];
          lastName  = parts.slice(1).join(' ');
        } else {
          const prefix = normalizedEmail.split('@')[0];
          firstName = prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/[._-]/g, ' ');
        }

        // Capture consent IP and timestamp — GDPR Article 7 requires proof of consent.
        // The act of providing an email address and initiating the widget session is
        // the consent event. Tenant's privacy policy must be visible in the widget.
        const consentIp      = req.ip || req.headers['x-forwarded-for'] || null;
        const consentVersion = process.env.PRIVACY_POLICY_VERSION || '2024-01';

        const { rows: newRows } = await db.query(
          `INSERT INTO customers
             (tenant_id, email, first_name, last_name, onboarding_status,
              consent_given_at, consent_ip, consent_version)
           VALUES ($1, $2, $3, $4, 'pending', NOW(), $5::inet, $6)
           RETURNING id, first_name, last_name, email, soul_file, memory_file,
                     onboarding_status, onboarding_categories_completed`,
          [tenant.id, normalizedEmail, firstName, lastName, consentIp, consentVersion]
        );
        customer = newRows[0];
        isNew    = true;
        console.log(`[Widget] Auto-created customer: ${firstName} ${lastName} <${normalizedEmail}> for tenant ${tenant.slug}`);
      } else {
        customer = customerRows[0];
        // Decrypt encrypted columns after read
        customer.soul_file   = safeDecryptJson(customer.soul_file);
        customer.memory_file = safeDecryptJson(customer.memory_file);
      }

      // If display_name was passed and soul_file has no customer_name yet, auto-save it.
      // This means logged-in users never need to see the "enter your name" screen.
      // Read-decrypt-modify-encrypt-write avoids jsonb_set on the encrypted column.
      const soul = customer.soul_file || {};
      if (!soul.customer_name && display_name && display_name.trim()) {
        const cleanName = display_name.trim().split(/\s+/)[0]; // first name
        soul.customer_name = cleanName;
        await db.query(
          `UPDATE customers
           SET soul_file  = $1,
               first_name = COALESCE(NULLIF(first_name,''), $2)
           WHERE id = $3`,
          [JSON.stringify(encryptJson(soul)), cleanName, customer.id]
        );
        customer.soul_file = soul;
      }
    }

    // 2. Find or create open conversation
    let { rows: convRows } = await db.query(
      `SELECT id FROM conversations
       WHERE customer_id = $1 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [customer.id]
    );

    let conversationId;
    let isNewConversation = false;
    if (convRows.length > 0) {
      conversationId = convRows[0].id;
    } else {
      const { rows: newConv } = await db.query(
        `INSERT INTO conversations (customer_id, status) VALUES ($1, 'active') RETURNING id`,
        [customer.id]
      );
      conversationId = newConv[0].id;
      isNewConversation = true;
    }

    // 2b. Load recent message history for returning authenticated users (last 25 messages)
    // This lets the widget pre-render conversation history on open without an extra round-trip.
    let recentMessages = [];
    if (!isAnonymous && !isNew && !isNewConversation) {
      const { rows: msgRows } = await db.query(
        `SELECT role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC
         LIMIT 25`,
        [conversationId]
      );
      // Reverse so oldest-first for display; exclude system/takeover notice messages
      recentMessages = msgRows
        .reverse()
        .filter(m => !m.content.startsWith('👋') && !m.content.startsWith('🤖'));
    }

    // 3. Issue widget JWT
    const widgetToken = jwt.sign(
      {
        widget_session:  true,
        tenant_id:       tenant.id,
        customer_id:     customer.id,
        conversation_id: conversationId,
        email:           customer.email,
        is_anonymous:    isAnonymous,
      },
      WIDGET_JWT_SECRET,
      { expiresIn: WIDGET_JWT_EXPIRY }
    );

    // 4. Audit log + webhook: new widget session created
    if (!isAnonymous) {
      writeAuditLog({
        actorType   : 'widget',
        customerId  : customer.id,
        tenantId    : tenant.id,
        eventType   : isNew ? 'widget.session.new_customer' : 'widget.session.returning',
        resourceType: 'customer',
        resourceId  : customer.id,
        description : isNew
          ? `New authenticated widget session — customer auto-created (consent captured)`
          : `Returning customer widget session started`,
        req,
        success     : true,
      });

      fireWebhooks(tenant.id, 'session.started', {
        customer_id:     customer.id,
        email:           customer.email,
        first_name:      customer.first_name,
        last_name:       customer.last_name,
        conversation_id: conversationId,
        is_new_customer: isNew,
      });

      if (isNew) {
        fireWebhooks(tenant.id, 'customer.created', {
          customer_id: customer.id,
          email:       customer.email,
          first_name:  customer.first_name,
          last_name:   customer.last_name,
        });
      }

      if (isNewConversation) {
        fireNotifications(tenant.id, 'conversation.started', {
          conversation_id: conversationId,
          customer_id:     customer.id,
          email:           customer.email,
          first_name:      customer.first_name,
          last_name:       customer.last_name,
        });
      }
    }

    // 5. Determine session flags
    const soulFile      = customer.soul_file   || {};
    const customerName  = soulFile.customer_name || null;
    const agentNickname = soulFile.agent_nickname || null;

    const needsName      = !isAnonymous && !customerName;
    const needsAgentName = !isAnonymous && !agentNickname;

    res.json({
      token:           widgetToken,
      conversation_id: conversationId,
      customer: {
        first_name:     customer.first_name,
        customer_name:  customerName,
        is_new:         isNew,
        is_anonymous:   isAnonymous,
        needs_name:     needsName,
        needs_agent_name: needsAgentName,
      },
      agent: {
        name:           agentNickname || tenant.agent_name || 'Nomii',
        default_name:   tenant.agent_name || 'Nomii',
        primary_color:  tenant.primary_color || '#1E3A5F',
        bubble_color:   tenant.secondary_color || tenant.primary_color || '#1E3A5F',
      },
      tenant: {
        name: tenant.name,
        chat_bubble_name: tenant.chat_bubble_name || null,
      },
      recent_messages: recentMessages,
    });

  } catch (err) { next(err); }
});


// ── POST /api/widget/session/claim ────────────────────────────────────────
//
// Called by widget.html when the host page signals that a previously-anonymous
// visitor has just authenticated (via nomii:identify postMessage).
//
// Body: { widget_key, anon_token, email, display_name? }
//
// What happens:
//   1. Verify the anon_token — extract tenant_id, customer_id, conversation_id
//   2. Resolve tenant (must match)
//   3. Find or create the authenticated customer record
//   4. Reassign the anonymous conversation to the real customer
//      (UPDATE conversations SET customer_id = realId WHERE id = anonConvId)
//   5. Soft-delete the anon customer row
//   6. Issue a fresh JWT for the authenticated session
//   7. Return new token + customer info so the widget can continue seamlessly
//
router.post('/session/claim', async (req, res, next) => {
  try {
    const { widget_key, anon_token, email, display_name } = req.body;

    if (!widget_key || !anon_token || !email) {
      return res.status(400).json({ error: 'widget_key, anon_token, and email are required' });
    }

    // 1. Verify the anonymous session token
    let anonSession;
    try {
      anonSession = jwt.verify(anon_token, WIDGET_JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired anonymous session token' });
    }

    if (!anonSession.is_anonymous) {
      return res.status(400).json({ error: 'Session is already authenticated — no claim needed' });
    }

    // 2. Resolve tenant and verify it matches the anon session
    const { rows: tenantRows } = await db.query(
      `SELECT id, name, agent_name, slug, primary_color, secondary_color,
              vertical, vertical_config, compliance_config,
              base_soul_template, llm_provider, llm_model,
              chat_bubble_name, website_url
       FROM tenants
       WHERE widget_api_key = $1 AND is_active = true`,
      [widget_key]
    );

    if (tenantRows.length === 0) {
      return res.status(403).json({ error: 'Invalid or inactive widget key' });
    }

    const tenant = tenantRows[0];

    if (anonSession.tenant_id !== tenant.id) {
      return res.status(403).json({ error: 'Session/tenant mismatch' });
    }

    // 3. Find or create the authenticated customer
    const normalizedEmail = email.toLowerCase().trim();

    let { rows: customerRows } = await db.query(
      `SELECT id, first_name, last_name, email, soul_file, memory_file,
              onboarding_status, onboarding_categories_completed
       FROM customers
       WHERE email = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [normalizedEmail, tenant.id]
    );

    let realCustomer;
    let isNew = false;

    if (customerRows.length === 0) {
      // Check customer seat limit before auto-creating
      const sub = await getSubscription(tenant.id);
      const isUnrestricted = sub && UNRESTRICTED_PLANS.includes(sub.plan);

      if (!isUnrestricted && sub && sub.max_customers !== null) {
        const { rows: countRows } = await db.query(
          `SELECT COUNT(*) FROM customers
           WHERE tenant_id = $1 AND deleted_at IS NULL
             AND email NOT LIKE 'anon\\_%@visitor.nomii'`,
          [tenant.id]
        );
        const currentCount = parseInt(countRows[0].count);
        if (currentCount >= sub.max_customers) {
          sendLimitNotificationIfNeeded(tenant.id);
          return res.status(403).json({
            error: 'customer_limit_reached',
            message: 'This service is temporarily at capacity. Please try again later.',
          });
        }
      }

      // Derive name from display_name or email prefix
      let firstName = 'Guest';
      let lastName  = '';
      if (display_name && display_name.trim()) {
        const parts = display_name.trim().split(/\s+/);
        firstName = parts[0];
        lastName  = parts.slice(1).join(' ');
      } else {
        const prefix = normalizedEmail.split('@')[0];
        firstName = prefix.charAt(0).toUpperCase() + prefix.slice(1).replace(/[._-]/g, ' ');
      }

      const consentIp      = req.ip || req.headers['x-forwarded-for'] || null;
      const consentVersion = process.env.PRIVACY_POLICY_VERSION || '2024-01';

      const { rows: newRows } = await db.query(
        `INSERT INTO customers
           (tenant_id, email, first_name, last_name, onboarding_status,
            consent_given_at, consent_ip, consent_version)
         VALUES ($1, $2, $3, $4, 'pending', NOW(), $5::inet, $6)
         RETURNING id, first_name, last_name, email, soul_file, memory_file,
                   onboarding_status, onboarding_categories_completed`,
        [tenant.id, normalizedEmail, firstName, lastName, consentIp, consentVersion]
      );
      realCustomer = newRows[0];
      isNew = true;
      console.log(`[Widget/Claim] Auto-created customer: ${firstName} ${lastName} <${normalizedEmail}> for tenant ${tenant.slug}`);
    } else {
      realCustomer = customerRows[0];
      realCustomer.soul_file   = safeDecryptJson(realCustomer.soul_file);
      realCustomer.memory_file = safeDecryptJson(realCustomer.memory_file);
    }

    // 4. Reassign the anon conversation to the real customer
    //    This preserves all messages — the conversation row just gets a new owner.
    const anonConvId = anonSession.conversation_id;
    let conversationId = anonConvId;

    if (anonConvId) {
      await db.query(
        `UPDATE conversations
         SET customer_id = $1, updated_at = NOW()
         WHERE id = $2 AND customer_id = $3`,
        [realCustomer.id, anonConvId, anonSession.customer_id]
      );
    } else {
      // Anon session had no conversation yet — find/create one for the real customer
      const { rows: convRows } = await db.query(
        `SELECT id FROM conversations
         WHERE customer_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [realCustomer.id]
      );
      if (convRows.length > 0) {
        conversationId = convRows[0].id;
      } else {
        const { rows: newConv } = await db.query(
          `INSERT INTO conversations (customer_id, status) VALUES ($1, 'active') RETURNING id`,
          [realCustomer.id]
        );
        conversationId = newConv[0].id;
      }
    }

    // 5. Soft-delete the anonymous customer record (keeps DB clean)
    await db.query(
      `UPDATE customers SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [anonSession.customer_id, tenant.id]
    );

    // 6. Issue fresh JWT for the authenticated session
    const newToken = jwt.sign(
      {
        widget_session:  true,
        tenant_id:       tenant.id,
        customer_id:     realCustomer.id,
        conversation_id: conversationId,
        email:           realCustomer.email,
        is_anonymous:    false,
      },
      WIDGET_JWT_SECRET,
      { expiresIn: WIDGET_JWT_EXPIRY }
    );

    // 7. Webhooks + audit log for the now-authenticated session
    writeAuditLog({
      actorType   : 'widget',
      customerId  : realCustomer.id,
      tenantId    : tenant.id,
      eventType   : 'widget.session.claimed',
      resourceType: 'customer',
      resourceId  : realCustomer.id,
      description : `Anonymous session claimed by ${normalizedEmail} — conversation migrated`,
      req,
      success     : true,
    });

    fireWebhooks(tenant.id, 'session.started', {
      customer_id:     realCustomer.id,
      email:           realCustomer.email,
      first_name:      realCustomer.first_name,
      last_name:       realCustomer.last_name,
      conversation_id: conversationId,
      is_new_customer: isNew,
    });

    if (isNew) {
      fireWebhooks(tenant.id, 'customer.created', {
        customer_id: realCustomer.id,
        email:       realCustomer.email,
        first_name:  realCustomer.first_name,
        last_name:   realCustomer.last_name,
      });
    }

    const soulFile      = realCustomer.soul_file   || {};
    const customerName  = soulFile.customer_name   || null;
    const agentNickname = soulFile.agent_nickname  || null;

    return res.json({
      token:           newToken,
      conversation_id: conversationId,
      customer: {
        first_name:       realCustomer.first_name,
        customer_name:    customerName,
        is_new:           isNew,
        is_anonymous:     false,
        needs_name:       !customerName,
        needs_agent_name: !agentNickname,
      },
      agent: {
        name:          agentNickname || tenant.agent_name || 'Nomii',
        default_name:  tenant.agent_name || 'Nomii',
        primary_color: tenant.primary_color || '#1E3A5F',
        bubble_color:  tenant.secondary_color || tenant.primary_color || '#1E3A5F',
      },
      tenant: {
        name:             tenant.name,
        chat_bubble_name: tenant.chat_bubble_name || null,
      },
    });

  } catch (err) { next(err); }
});


// ── POST /api/widget/set-name ──────────────────────────────────────────────
//
// Saves customer's own name to soul_file.customer_name.
// Only relevant for authenticated sessions where display_name wasn't available.
//
router.post('/set-name', requireWidgetAuth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const cleanName = name.trim().slice(0, 100);

    // Read → decrypt → modify → encrypt → write (avoids jsonb_set on encrypted column)
    const { rows: soulRows } = await db.query(
      `SELECT soul_file FROM customers WHERE id = $1 AND tenant_id = $2`,
      [req.widgetSession.customer_id, req.widgetSession.tenant_id]
    );
    const soul = safeDecryptJson(soulRows[0]?.soul_file);
    soul.customer_name = cleanName;

    await db.query(
      `UPDATE customers
       SET soul_file  = $1,
           first_name = $2
       WHERE id = $3 AND tenant_id = $4`,
      [JSON.stringify(encryptJson(soul)), cleanName, req.widgetSession.customer_id, req.widgetSession.tenant_id]
    );

    res.json({ ok: true, customer_name: cleanName });
  } catch (err) { next(err); }
});


// ── POST /api/widget/set-agent-name ───────────────────────────────────────────
//
// Called after the "What would you like to name your assistant?" screen.
// Saves the customer's chosen nickname for the agent to soul_file.agent_nickname.
//
router.post('/set-agent-name', requireWidgetAuth, async (req, res, next) => {
  try {
    const { agent_name } = req.body;
    if (!agent_name || !agent_name.trim()) {
      return res.status(400).json({ error: 'agent_name is required' });
    }

    const cleanName = agent_name.trim().slice(0, 100);

    // Read → decrypt → modify → encrypt → write (avoids jsonb_set on encrypted column)
    const { rows: soulRows } = await db.query(
      `SELECT soul_file FROM customers WHERE id = $1 AND tenant_id = $2`,
      [req.widgetSession.customer_id, req.widgetSession.tenant_id]
    );
    const soul = safeDecryptJson(soulRows[0]?.soul_file);
    soul.agent_nickname = cleanName;

    await db.query(
      `UPDATE customers
       SET soul_file = $1
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(encryptJson(soul)), req.widgetSession.customer_id, req.widgetSession.tenant_id]
    );

    res.json({ ok: true, agent_nickname: cleanName });
  } catch (err) { next(err); }
});


// ── POST /api/widget/end-session ──────────────────────────────────────────────
//
// Called when the chat widget is closed (X button or page unload via sendBeacon).
// Triggers memory + soul file update and marks the conversation closed.
//
// NOTE: This endpoint does NOT use requireWidgetAuth because sendBeacon
// cannot set HTTP headers. Instead, the JWT is passed in the request body
// as { token: "<widget_jwt>" } and verified manually here.
//
router.post('/end-session', async (req, res, next) => {
  try {
    // Extract token from body (sendBeacon) or Authorization header (fetch fallback)
    let payload;
    const bodyToken  = req.body && req.body.token;
    const authHeader = req.headers.authorization || '';
    const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = bodyToken || headerToken;

    if (!token) {
      console.warn('[Widget] end-session: no token found. Body keys:', Object.keys(req.body || {}), 'Auth header:', authHeader ? 'present' : 'missing');
      return res.status(401).json({ error: 'Widget session token required' });
    }

    try {
      payload = jwt.verify(token, WIDGET_JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired widget session' });
    }

    const { conversation_id, customer_id, is_anonymous } = payload;

    // Only update memory for authenticated (non-anonymous) sessions with messages
    if (!is_anonymous) {
      // Await memory update BEFORE closing conversation to avoid race condition
      try {
        await updateMemoryAfterSession(conversation_id, customer_id);
      } catch (err) {
        console.error('[Widget] Memory update error:', err.message);
        // Continue to close conversation even if memory fails
      }
    }

    // Close the conversation — but leave escalated conversations open
    // (a human agent needs to resolve them; ending the session doesn't close the concern)
    await db.query(
      `UPDATE conversations
       SET status = 'ended', ended_at = NOW()
       WHERE id = $1 AND status != 'escalated'`,
      [conversation_id]
    );

    // Webhook: session ended (fire-and-forget, non-blocking)
    if (!is_anonymous) {
      const { rows: tenantRows } = await db.query(
        'SELECT tenant_id FROM customers WHERE id = $1', [customer_id]
      ).catch(() => ({ rows: [] }));
      if (tenantRows[0]) {
        fireWebhooks(tenantRows[0].tenant_id, 'session.ended', {
          customer_id,
          conversation_id,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});


// ── POST /api/widget/flag ──────────────────────────────────────────────────
//
// Raises a concern from within the widget. Escalates conversation to Concerns.
//
router.post('/flag', requireWidgetAuth, async (req, res, next) => {
  try {
    const { description = 'Customer requested help via widget' } = req.body;
    const { tenant_id, customer_id, conversation_id } = req.widgetSession;

    await db.query(
      `UPDATE conversations SET status = 'escalated' WHERE id = $1`,
      [conversation_id]
    );

    await db.query(
      `INSERT INTO flags
         (customer_id, conversation_id, flag_type, severity, description, status)
       VALUES ($1, $2, 'escalation', 'medium', $3, 'open')`,
      [customer_id, conversation_id, description]
    );

    // Send concern notification email to tenant admin (fire-and-forget)
    try {
      const { rows: notifyRows } = await db.query(
        `SELECT a.email, a.first_name,
                c.first_name AS cust_first, c.last_name AS cust_last, c.email AS cust_email,
                t.email_from_name, t.email_reply_to, t.email_footer
         FROM tenant_admins a
         JOIN customers c ON c.id = $1
         JOIN tenants t ON t.id = $2
         WHERE a.tenant_id = $2
         LIMIT 1`,
        [customer_id, tenant_id]
      );
      if (notifyRows.length > 0) {
        const r = notifyRows[0];
        sendConcernEmail({
          to:             r.email,
          firstName:      r.first_name,
          customerName:   `${r.cust_first} ${r.cust_last}`.trim(),
          customerEmail:  r.cust_email,
          description,
          conversationId: conversation_id,
          tenantEmail:    { email_from_name: r.email_from_name, email_reply_to: r.email_reply_to, email_footer: r.email_footer },
        }).catch(err => console.error('[Widget] Concern email failed:', err.message));
      }
    } catch (emailErr) {
      console.error('[Widget] Could not fetch concern email data:', emailErr.message);
    }

    // Webhook: flag/concern raised
    fireWebhooks(tenant_id, 'flag.created', {
      customer_id,
      conversation_id,
      description,
      severity: 'medium',
    });
    fireWebhooks(tenant_id, 'concern.raised', {
      customer_id,
      conversation_id,
      description,
    });

    fireNotifications(tenant_id, 'conversation.escalated', {
      conversation_id,
      customer_id,
      description,
    });

    // In-app notification + Slack/Teams for dashboard advisors
    try {
      const { rows: custRows } = await db.query(
        `SELECT first_name, last_name, email FROM customers WHERE id = $1 LIMIT 1`,
        [customer_id]
      );
      const cName = custRows.length > 0
        ? [custRows[0].first_name, custRows[0].last_name].filter(Boolean).join(' ') || 'A customer'
        : 'A customer';
      const cEmail = custRows[0]?.email || '';

      createNotification(tenant_id, {
        type:         'flag',
        title:        `${cName} raised a concern`,
        body:         description,
        resourceType: 'conversation',
        resourceId:   conversation_id,
        customerName: cName,
      });

      fireNotifications(tenant_id, 'handoff.requested', {
        conversation_id,
        customer_name:    cName,
        customer_email:   cEmail,
        message_preview:  description,
      });
    } catch (_) {}

    res.json({ ok: true, message: 'Your request has been flagged. A team member will follow up with you.' });
  } catch (err) { next(err); }
});


// ── GET /api/widget/poll ───────────────────────────────────────────────────────
//
// Long-poll endpoint for human takeover mode.
// Returns current conversation mode + any new messages since a given timestamp.
//
// Query: ?since=<ISO timestamp>   (optional — defaults to epoch / return all recent)
//
router.get('/poll', requireWidgetAuth, async (req, res, next) => {
  try {
    const { conversation_id } = req.widgetSession;

    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30000); // last 30s by default

    const { rows: convRows } = await db.query(
      'SELECT mode FROM conversations WHERE id = $1',
      [conversation_id]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { rows: messages } = await db.query(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE conversation_id = $1 AND created_at > $2 AND role = 'agent'
       ORDER BY created_at ASC`,
      [conversation_id, since]
    );

    res.json({
      mode:     convRows[0].mode,
      messages: messages.map(m => ({
        id:         m.id,
        role:       m.role,
        content:    m.content,
        created_at: m.created_at,
      })),
    });
  } catch (err) { next(err); }
});


// ── POST /api/widget/chat ──────────────────────────────────────────────────────
//
// Headers: Authorization: Bearer <widget_token>
// Body:    { content }
//
const MAX_MESSAGE_LENGTH = 4000; // ~1000 tokens — blocks stuffing while allowing long messages

router.post('/chat', requireWidgetAuth, requireActiveWidgetSubscription, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Sanitize: strip null bytes + control chars, enforce length cap
    const sanitized = content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars (keep \t \n \r)
      .trim()
      .slice(0, MAX_MESSAGE_LENGTH);

    if (!sanitized) {
      return res.status(400).json({ error: 'Message content is empty after sanitization' });
    }

    // Shadow the original content with the sanitized version for all downstream use
    const originalLength = content.length;
    if (originalLength > MAX_MESSAGE_LENGTH) {
      console.warn(`[Widget] Message truncated: customer ${req.widgetSession.customer_id} sent ${originalLength} chars`);
    }

    const { tenant_id, customer_id, conversation_id } = req.widgetSession;

    // 0. Check if conversation is in human mode — if so, save message and return waiting signal
    const { rows: modeRows } = await db.query(
      'SELECT mode FROM conversations WHERE id = $1',
      [conversation_id]
    );
    if (modeRows.length > 0 && modeRows[0].mode === 'human') {
      // Persist the user message but don't call AI
      await db.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
        [conversation_id, 'customer', sanitized]
      );
      // Mark conversation as unread so dashboard badge updates
      await db.query(
        'UPDATE conversations SET unread = TRUE WHERE id = $1',
        [conversation_id]
      );
      await db.query(
        'UPDATE customers SET last_interaction_at = NOW() WHERE id = $1',
        [customer_id]
      );

      // Notify the assigned human agent (or all tenant admins) by email — fire-and-forget
      setImmediate(async () => {
        try {
          // Look up customer + assigned agent info + tenant email template settings
          const { rows: notifyRows } = await db.query(
            `SELECT
               cu.first_name AS cust_first, cu.last_name AS cust_last, cu.email AS cust_email,
               co.human_agent_id,
               a.email AS agent_email, a.first_name AS agent_first, a.last_name AS agent_last,
               t.email_from_name, t.email_reply_to, t.email_footer
             FROM conversations co
             JOIN customers cu ON co.customer_id = cu.id
             JOIN tenants t ON t.id = $1
             LEFT JOIN tenant_admins a ON a.id = co.human_agent_id
             WHERE co.id = $2`,
            [tenant_id, conversation_id]
          );
          if (notifyRows.length === 0) return;
          const row = notifyRows[0];
          const customerName = [row.cust_first, row.cust_last].filter(Boolean).join(' ') || 'Customer';
          const tenantEmail = { email_from_name: row.email_from_name, email_reply_to: row.email_reply_to, email_footer: row.email_footer };

          if (row.agent_email) {
            // Notify the specific agent who took over
            await sendHumanModeReplyEmail({
              to: row.agent_email,
              agentName:    [row.agent_first, row.agent_last].filter(Boolean).join(' '),
              customerName,
              customerEmail: row.cust_email,
              messageSnippet: sanitized,
              conversationId: conversation_id,
              tenantEmail,
            });
          } else {
            // No specific agent assigned — notify all tenant admins
            const { rows: adminRows } = await db.query(
              `SELECT email, first_name FROM tenant_admins WHERE tenant_id = $1 AND role = 'admin' LIMIT 5`,
              [tenant_id]
            );
            for (const admin of adminRows) {
              await sendHumanModeReplyEmail({
                to: admin.email,
                agentName:    admin.first_name,
                customerName,
                customerEmail: row.cust_email,
                messageSnippet: sanitized,
                conversationId: conversation_id,
                tenantEmail,
              });
            }
          }
          // In-app notification so advisor sees the reply even if email is delayed
          createNotification(tenant_id, {
            type:         'human_reply',
            title:        `${customerName} replied`,
            body:         sanitized.slice(0, 120),
            resourceType: 'conversation',
            resourceId:   conversation_id,
            customerName,
          });
        } catch (err) {
          console.error('[Widget] Failed to send human mode reply notification:', err.message);
        }
      });

      return res.json({
        role:    'agent',
        content: null,
        waiting: true,
        mode:    'human',
      });
    }

    // 1. Load tenant + customer data (including API key fields for BYOK)
    const { rows: convRows } = await db.query(
      `SELECT
         c.id as customer_id, c.first_name, c.last_name,
         c.soul_file, c.memory_file,
         c.onboarding_status, c.onboarding_categories_completed,
         t.id as tenant_id, t.name as tenant_name, t.agent_name,
         t.vertical, t.vertical_config,
         t.compliance_config, t.base_soul_template,
         t.llm_provider, t.llm_model, t.website_url,
         t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated,
         t.enabled_tools, t.tool_configs
       FROM customers c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1 AND t.id = $2`,
      [customer_id, tenant_id]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Session context not found' });
    }

    const conv = convRows[0];
    // Decrypt encrypted columns after read
    conv.soul_file   = safeDecryptJson(conv.soul_file);
    conv.memory_file = safeDecryptJson(conv.memory_file);

    // 2. Load customer data + tenant products in parallel
    const [{ rows: customerData }, { rows: products }] = await Promise.all([
      db.query('SELECT * FROM customer_data WHERE customer_id = $1', [customer_id]),
      db.query('SELECT name, description, category, price_info, notes FROM tenant_products WHERE tenant_id = $1 ORDER BY sort_order, created_at', [tenant_id]),
    ]);

    // 3. Load message history + handback note for this conversation
    const [{ rows: existingMessages }, { rows: convMeta }] = await Promise.all([
      db.query('SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversation_id]),
      db.query('SELECT handback_note FROM conversations WHERE id = $1', [conversation_id]),
    ]);
    const handbackNote = convMeta[0]?.handback_note || null;

    // 4. Persist the user message + mark conversation unread for dashboard
    await db.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation_id, 'customer', sanitized]
    );
    await db.query(
      'UPDATE conversations SET unread = TRUE WHERE id = $1',
      [conversation_id]
    );

    // 5. Build system prompt
    const tenantCtx = {
      name:                conv.tenant_name,
      agent_name:          conv.agent_name,
      vertical:            conv.vertical,
      vertical_config:     conv.vertical_config,
      compliance_config:   conv.compliance_config,
      base_soul_template:  conv.base_soul_template,
      website_url:         conv.website_url,
    };

    const customerCtx = {
      soul_file:                        conv.soul_file,
      memory_file:                      conv.memory_file,
      onboarding_status:                conv.onboarding_status,
      onboarding_categories_completed:  conv.onboarding_categories_completed,
    };

    const systemPrompt = buildSystemPrompt({
      tenant:        tenantCtx,
      customer:      customerCtx,
      customerData:  customerData,
      products:      products,
      handbackNote:  handbackNote,
      widgetGreeted: existingMessages.length === 0,
    });

    // If there was a handback note, consume it now (single-use — clear after this turn)
    if (handbackNote) {
      db.query('UPDATE conversations SET handback_note = NULL WHERE id = $1', [conversation_id])
        .catch(err => console.error('[Widget] Failed to clear handback_note:', err.message));
    }

    // 6. Build LLM messages array
    const llmMessages = [
      ...existingMessages.map(m => ({
        role:    m.role === 'customer' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: sanitized },
    ];

    // 7. Determine agent display name (prefer customer-given nickname)
    const soulFile = conv.soul_file || {};
    const agentDisplayName =
      soulFile.agent_nickname                     ||
      soulFile.base_identity?.customer_given_name ||
      soulFile.base_identity?.agent_name          ||
      conv.agent_name;

    // 8. Get LLM response
    // Resolves API key (BYOK or platform managed), then chooses:
    //   - Tool-calling loop  → if tenant has enabled_tools configured
    //   - Standard call      → if no tools enabled (pure conversation)
    //   - Mock response      → if no API key available
    const tenantForLLM = {
      llm_provider:          conv.llm_provider,
      llm_api_key_encrypted: conv.llm_api_key_encrypted,
      llm_api_key_iv:        conv.llm_api_key_iv,
      llm_api_key_validated: conv.llm_api_key_validated,
      managed_ai_enabled:    req.subscription ? req.subscription.managed_ai_enabled : false,
    };

    // Resolve the enabled tools for this tenant (universal registry tools)
    const enabledTools     = conv.enabled_tools || [];
    const toolConfigs      = conv.tool_configs  || {};
    const universalToolDefs = getToolDefinitions(enabledTools, toolConfigs);

    // Load custom tools defined by this tenant in the DB
    const customToolRows = await loadCustomTools(db, tenant_id);
    const customToolDefs = customToolRows.map(toToolDefinition);

    // Merge: universal tools first, then tenant-defined custom tools
    const toolDefs = [...universalToolDefs, ...customToolDefs];

    let agentResponse;

    if (toolDefs.length > 0 && (tenantForLLM.managed_ai_enabled || tenantForLLM.llm_api_key_encrypted)) {
      // ── Tool-enabled path ──────────────────────────────────────────────────
      // Build the tool executor bound to this request's context so handlers
      // can access db, customerId, conversationId, etc.
      const resolvedKey = resolveApiKey(tenantForLLM);

      const toolContext = {
        db,
        tenantId:       tenant_id,
        customerId:     customer_id,
        conversationId: conversation_id,
        customer: {
          first_name: conv.first_name,
          last_name:  conv.last_name,
          email:      conv.email,
        },
        tenant: {
          name:           conv.tenant_name,
          vertical_config: conv.vertical_config,
        },
      };

      // Universal executor (handles lookup_client_data, analyze_client_data, etc.)
      const universalExecutor = (toolName, params) =>
        executeTool(toolName, params, toolContext);

      // Custom executor (handles tenant-defined tools from custom_tools table)
      const customExecutor = buildCustomExecutor(customToolRows, toolContext);

      // Combined: custom tools take priority, fall through to universal
      const toolExecutor = buildCombinedExecutor(customExecutor, universalExecutor);

      const raw = await callClaudeWithTools(
        systemPrompt,
        llmMessages,
        toolDefs,
        toolExecutor,
        conv.llm_model,
        2048,
        resolvedKey
      );
      agentResponse = sanitiseResponse(raw);

    } else {
      // ── Standard path (no tools, or mock) ─────────────────────────────────
      agentResponse = await getAgentResponse({
        systemPrompt,
        messages:        llmMessages,
        model:           conv.llm_model,
        customerName:    `${conv.first_name} ${conv.last_name}`,
        agentName:       agentDisplayName,
        lastUserMessage: sanitized,
        tenant:          tenantForLLM,
      });
    }

    // 8b. Increment message counter
    await incrementMessageCount(tenant_id);

    // 9. Persist agent response
    await db.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation_id, 'agent', agentResponse]
    );

    // 10. Update last interaction timestamp
    await db.query(
      'UPDATE customers SET last_interaction_at = NOW() WHERE id = $1',
      [customer_id]
    );

    // 11. Per-exchange memory update (fire-and-forget)
    // Runs fact extraction every exchange, session summary on goodbye or every 20 msgs,
    // and soul evolution every 5 msgs — all non-blocking so response is never delayed.
    const { rows: msgCountRows } = await db.query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
      [conversation_id]
    );
    const msgCount = parseInt(msgCountRows[0].count, 10);
    if (!req.widgetSession.is_anonymous) {
      updateMemoryAfterExchange({
        customerMessage: sanitized,
        agentResponse,
        currentMemory:   conv.memory_file,   // already decrypted above
        currentSoul:     conv.soul_file,      // already decrypted above
        customerId:      customer_id,
        conversationId:  conversation_id,
        messageCount:    msgCount,
        sessionType:     conv.onboarding_status !== 'complete' ? 'onboarding' : 'regular',
        apiKey:          resolveApiKey(tenantForLLM),
        db,
      }).catch(err => console.error('[Widget] Memory update error:', err.message));
    }

    res.json({
      role:            'agent',
      content:         agentResponse,
      conversation_id: conversation_id,
    });

  } catch (err) { next(err); }
});


// ── POST /api/widget/greeting ─────────────────────────────────────────────────
//
// Generates a personalised AI welcome-back message for returning authenticated users.
// Called by widget.html on session init — always responds with { greeting: string|null }.
// Returns null for new users, anonymous sessions, or when no API key is available.
// The widget falls back to a static greeting string on null or error.
//
router.post('/greeting', requireWidgetAuth, async (req, res, next) => {
  try {
    const { tenant_id, customer_id, is_anonymous } = req.widgetSession;

    if (is_anonymous) return res.json({ greeting: null });

    // Load memory + soul + tenant API key fields in one query
    const { rows } = await db.query(
      `SELECT c.memory_file, c.soul_file,
              t.agent_name,
              t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated,
              t.managed_ai_enabled
       FROM customers c
       JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1 AND t.id = $2`,
      [customer_id, tenant_id]
    );

    if (!rows.length) return res.json({ greeting: null });

    const row     = rows[0];
    // Decrypt encrypted columns after read
    const memory  = safeDecryptJson(row.memory_file);
    const soul    = safeDecryptJson(row.soul_file);
    const history = memory.conversation_history || [];

    // Only generate personalised greeting for users with prior history
    if (history.length === 0) return res.json({ greeting: null });

    const apiKey = resolveApiKey(row);
    if (!apiKey) return res.json({ greeting: null });

    // Build context from the most recent session
    const lastSession  = history[history.length - 1];
    const customerName = soul.customer_name
      || memory.personal_profile?.name
      || 'there';
    const agentName    = soul.agent_nickname
      || soul.base_identity?.agent_name
      || row.agent_name
      || 'your assistant';

    // Build the richest available context — action items beat summaries beat topic slugs
    const actionItems    = lastSession.action_items || [];
    const openAction     = actionItems.find(a => a && a.trim());
    const emotionalTone  = lastSession.emotional_tone || 'neutral';
    const sessionSummary = lastSession.summary || '';
    const topicSlugs     = (lastSession.topics || []).slice(0, 3).map(t => t.replace(/_/g, ' ')).join(', ');

    let contextLine;
    if (openAction) {
      contextLine = `Last time, you noted this follow-up for the customer: "${openAction}". Reference it naturally — ask if they got a chance to act on it.`;
    } else if (sessionSummary.length > 20) {
      contextLine = `Summary of last session: "${sessionSummary.substring(0, 160)}"`;
    } else if (topicSlugs) {
      contextLine = `Topics covered last time: ${topicSlugs}`;
    } else {
      contextLine = 'You had a good conversation last time.';
    }

    const toneGuidance = emotionalTone === 'anxious' || emotionalTone === 'confused'
      ? 'The customer seemed anxious or uncertain last time — be especially warm and reassuring.'
      : emotionalTone === 'satisfied' || emotionalTone === 'positive'
      ? 'The customer left the last session feeling good — match that positive energy.'
      : '';

    const systemPrompt =
      `You write short welcome-back chat messages for a returning customer of a personalised AI assistant.
Rules: 1–2 sentences, max 40 words. Warm, personal, specific. ${toneGuidance}
If there's a follow-up item, ask about it directly — this is what makes the experience feel human.
No quotes, no asterisks, no emojis. Start directly with the greeting — no preamble like "Here is..." or "Sure!".`;

    const userContent =
      `Agent name: ${agentName}
Customer name: ${customerName}
Days since last session: ${lastSession.date ? Math.floor((Date.now() - new Date(lastSession.date)) / 86400000) : 'unknown'}
${contextLine}`;

    const raw = await callClaude(
      systemPrompt,
      [{ role: 'user', content: userContent }],
      process.env.LLM_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
      100,
      apiKey
    );

    const greeting = (raw || '').replace(/^["']|["']$/g, '').trim();
    res.json({ greeting: greeting || null });

  } catch (err) {
    console.error('[Widget] Greeting error:', err.message);
    res.json({ greeting: null }); // Always fall back gracefully — never crash widget
  }
});


// ── POST /api/widget/verify ────────────────────────────────────────────────
//
// Called silently by embed.js on first load. Sets widget_verified_at on the
// tenant so onboarding Step 4 flips to ✅ automatically.
//
router.post('/verify', async (req, res, next) => {
  try {
    const { widget_key } = req.body;
    if (widget_key) {
      await db.query(
        `UPDATE tenants
         SET widget_verified_at = NOW(),
             onboarding_steps   = onboarding_steps || '{"widget": true}'::jsonb
         WHERE widget_api_key = $1
           AND widget_verified_at IS NULL`,
        [widget_key]
      );
    }
  } catch (_) {
    // Silently swallow — never block the widget loading
  }
  res.sendStatus(200);
});


// POST /api/widget/csat  — submit a CSAT rating when the customer closes the widget
// Body: { score: 1|2, comment?: string }  (1 = thumbs down, 2 = thumbs up)
router.post('/csat', requireWidgetAuth, async (req, res, next) => {
  try {
    const { score, comment } = req.body;
    if (score !== 1 && score !== 2) {
      return res.status(400).json({ error: 'score must be 1 (negative) or 2 (positive)' });
    }

    const cleanComment = (comment && typeof comment === 'string')
      ? comment.trim().slice(0, 500) || null
      : null;

    const { conversation_id, tenant_id, customer_id } = req.widgetSession;

    // Only record if not already rated
    const { rowCount } = await db.query(
      `UPDATE conversations
       SET csat_score = $1, csat_comment = $2, csat_submitted_at = NOW()
       WHERE id = $3 AND csat_score IS NULL`,
      [score, cleanComment, conversation_id]
    );

    // Fire Slack/Teams notification if the rating was recorded
    if (rowCount > 0) {
      try {
        const { rows: custRows } = await db.query(
          `SELECT first_name, last_name, email FROM customers WHERE id = $1 LIMIT 1`,
          [customer_id]
        );
        const cName  = custRows[0] ? [custRows[0].first_name, custRows[0].last_name].filter(Boolean).join(' ') || '' : '';
        const cEmail = custRows[0]?.email || '';
        fireNotifications(tenant_id, 'csat.received', {
          conversation_id,
          customer_name:  cName,
          customer_email: cEmail,
          csat_score:     score,
          csat_comment:   cleanComment,
        });
        fireWebhooks(tenant_id, 'csat.received', {
          conversation_id, customer_id, csat_score: score, csat_comment: cleanComment,
        });
      } catch (_) {}
    }

    res.json({ ok: true });
  } catch (err) {
    // Never block the close flow
    res.json({ ok: true });
  }
});


module.exports = router;
