/**
 * NOMII AI — Chat Route
 * The core endpoint: loads Soul + Memory, builds prompt, calls LLM (or mock), returns response.
 * Also handles post-message memory notes and flag detection.
 */

const router = require('express').Router();
const db = require('../db');
const { buildSystemPrompt } = require('../engine/promptBuilder');
const { getAgentResponse, resolveApiKey } = require('../services/llmService');
const { requireAuth, requireTenantScope } = require('../middleware/auth');
const { sendFlagNotificationEmail } = require('../services/emailService');
const { updateMemoryAfterExchange } = require('../engine/memoryUpdater');
const { encryptJson, safeDecryptJson } = require('../services/cryptoService');

// POST /api/chat/message — Send a message and get agent response
router.post('/message', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { conversation_id, content } = req.body;
    if (!conversation_id || !content) {
      return res.status(400).json({ error: 'conversation_id and content are required' });
    }

    // 1. Get conversation + customer + tenant + accounts
    const { rows: convRows } = await db.query(
      `SELECT co.*, c.id as customer_id, c.first_name, c.last_name,
              c.soul_file, c.memory_file, c.onboarding_status,
              c.onboarding_categories_completed,
              t.id as tenant_id, t.name as tenant_name, t.agent_name,
              t.vertical, t.vertical_config,
              t.compliance_config, t.base_soul_template, t.llm_provider, t.llm_model,
              s.managed_ai_enabled, t.llm_api_key_encrypted, t.llm_api_key_iv, t.llm_api_key_validated
       FROM conversations co
       JOIN customers c ON co.customer_id = c.id
       JOIN tenants t ON c.tenant_id = t.id
       JOIN subscriptions s ON s.tenant_id = t.id
       WHERE co.id = $1`,
      [conversation_id]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRows[0];
    // Decrypt encrypted columns after read
    conv.soul_file   = safeDecryptJson(conv.soul_file);
    conv.memory_file = safeDecryptJson(conv.memory_file);

    // 2. Get customer data records
    const { rows: customerData } = await db.query(
      'SELECT * FROM customer_data WHERE customer_id = $1',
      [conv.customer_id]
    );

    // 3. Get conversation history (messages so far in this session)
    const { rows: existingMessages } = await db.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversation_id]
    );

    // 4. Save the customer's message
    await db.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation_id, 'customer', content]
    );

    // 5. Build the system prompt
    const tenant = {
      name: conv.tenant_name,
      agent_name: conv.agent_name,
      vertical: conv.vertical,
      vertical_config: conv.vertical_config,
      compliance_config: conv.compliance_config,
      base_soul_template: conv.base_soul_template,
    };

    const customer = {
      soul_file: conv.soul_file,
      memory_file: conv.memory_file,
      onboarding_status: conv.onboarding_status,
      onboarding_categories_completed: conv.onboarding_categories_completed,
    };

    const systemPrompt = buildSystemPrompt({
      tenant,
      customer,
      customerData: customerData,
    });

    // 6. Build messages array for LLM
    const llmMessages = [
      ...existingMessages.map(m => ({
        role: m.role === 'customer' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content },
    ];

    // 7. Determine agent display name from Soul file
    const soulFile = conv.soul_file || {};
    const agentDisplayName = soulFile.base_identity?.customer_given_name
      || soulFile.base_identity?.agent_name
      || conv.agent_name;

    // 8. Get response (real Claude or mock fallback)
    const agentResponse = await getAgentResponse({
      systemPrompt,
      messages:        llmMessages,
      model:           conv.llm_model,
      customerName:    `${conv.first_name} ${conv.last_name}`,
      agentName:       agentDisplayName,
      lastUserMessage: content,
    });

    // 9. Save agent response
    await db.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversation_id, 'agent', agentResponse]
    );

    // 9b. Fire-and-forget memory + soul update — never blocks the response
    setImmediate(() => {
      const apiKey = resolveApiKey(conv);
      // existingMessages was fetched before the new exchange; +2 = customer msg + agent response
      const messageCount = existingMessages.length + 2;
      const sessionType  = conv.onboarding_status === 'in_progress' ? 'onboarding' : 'regular';

      updateMemoryAfterExchange({
        customerMessage: content,
        agentResponse,
        currentMemory:   conv.memory_file  || {},
        currentSoul:     conv.soul_file    || {},
        customerId:      conv.customer_id,
        conversationId:  conversation_id,
        messageCount,
        sessionType,
        apiKey,
        db,
      }).catch(err => console.error('[Chat] Memory update error:', err.message));
    });

    // 10. Detect if customer just named the agent — save to Soul file
    const nameGiven = detectAgentNaming(content);
    if (nameGiven && !soulFile.base_identity?.customer_given_name) {
      const updatedSoul = {
        ...soulFile,
        base_identity: {
          ...(soulFile.base_identity || {}),
          customer_given_name: nameGiven,
        },
      };
      await db.query(
        'UPDATE customers SET soul_file = $1 WHERE id = $2',
        [JSON.stringify(encryptJson(updatedSoul)), conv.customer_id]
      );
      console.log(`[Chat] Customer ${conv.first_name} named their agent: "${nameGiven}"`);
    }

    // 11. Update customer's last_interaction_at
    await db.query('UPDATE customers SET last_interaction_at = NOW() WHERE id = $1', [conv.customer_id]);

    // 12. Basic flag detection (keyword-based for MVP)
    const flags = detectFlags(content, agentResponse);
    for (const flag of flags) {
      // Get assigned advisor (primary) + their email for notification
      const { rows: advisorRows } = await db.query(
        `SELECT ac.advisor_id, a.email AS advisor_email, a.name AS advisor_name
         FROM advisor_customers ac
         JOIN advisors a ON ac.advisor_id = a.id
         WHERE ac.customer_id = $1 AND ac.is_primary = true LIMIT 1`,
        [conv.customer_id]
      );
      const advisorId    = advisorRows.length > 0 ? advisorRows[0].advisor_id    : null;
      const advisorEmail = advisorRows.length > 0 ? advisorRows[0].advisor_email : null;
      const advisorName  = advisorRows.length > 0 ? advisorRows[0].advisor_name  : null;

      await db.query(
        `INSERT INTO flags (customer_id, conversation_id, flag_type, severity, description, assigned_advisor_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [conv.customer_id, conversation_id, flag.type, flag.severity, flag.description, advisorId]
      );

      // Notify advisor via email — fire-and-forget (don't block response)
      if (advisorEmail) {
        const customerName = [conv.first_name, conv.last_name].filter(Boolean).join(' ') || 'A customer';
        // Load tenant email template settings for branding
        db.query('SELECT email_from_name, email_reply_to, email_footer FROM tenants WHERE id = $1', [conv.tenant_id])
          .then(({ rows: tRows }) => {
            const te = tRows[0] || {};
            sendFlagNotificationEmail({
              to:             advisorEmail,
              advisorName:    advisorName,
              customerName:   customerName,
              flagType:       flag.type,
              severity:       flag.severity,
              description:    flag.description,
              conversationId: conversation_id,
              tenantName:     conv.tenant_name,
              tenantEmail:    { email_from_name: te.email_from_name, email_reply_to: te.email_reply_to, email_footer: te.email_footer },
            }).catch(err => console.error('[Chat] Flag notification email failed:', err.message));
          })
          .catch(err => console.error('[Chat] Failed to load tenant email settings:', err.message));
      }
    }

    res.json({
      role: 'agent',
      content: agentResponse,
      conversation_id,
      flags_triggered: flags.length,
    });

  } catch (err) { next(err); }
});

// GET /api/chat/context/:conversation_id — Get full context for a conversation (debug/admin)
router.get('/context/:conversation_id', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    // Admin/advisor only — debug endpoint
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Debug endpoint for advisors/admins only' });
    }

    const { rows: convRows } = await db.query(
      `SELECT co.*, c.id as customer_id, c.first_name, c.last_name,
              c.soul_file, c.memory_file, c.onboarding_status,
              c.onboarding_categories_completed,
              t.name as tenant_name, t.agent_name, t.vertical, t.vertical_config,
              t.compliance_config, t.base_soul_template, t.onboarding_config
       FROM conversations co
       JOIN customers c ON co.customer_id = c.id
       JOIN tenants t ON c.tenant_id = t.id
       WHERE co.id = $1 AND c.tenant_id = $2`,
      [req.params.conversation_id, req.tenant_id]
    );

    if (convRows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const conv = convRows[0];
    // Decrypt encrypted columns after read
    conv.soul_file   = safeDecryptJson(conv.soul_file);
    conv.memory_file = safeDecryptJson(conv.memory_file);

    const { rows: customerData } = await db.query(
      'SELECT * FROM customer_data WHERE customer_id = $1',
      [conv.customer_id]
    );

    const systemPrompt = buildSystemPrompt({
      tenant: { name: conv.tenant_name, agent_name: conv.agent_name, vertical: conv.vertical, vertical_config: conv.vertical_config, compliance_config: conv.compliance_config, base_soul_template: conv.base_soul_template, onboarding_config: conv.onboarding_config },
      customer: { soul_file: conv.soul_file, memory_file: conv.memory_file, onboarding_status: conv.onboarding_status, onboarding_categories_completed: conv.onboarding_categories_completed },
      customerData: customerData,
    });

    res.json({
      system_prompt: systemPrompt,
      system_prompt_length: systemPrompt.length,
      customer: `${conv.first_name} ${conv.last_name}`,
      soul_file: conv.soul_file,
      memory_file: conv.memory_file,
      customer_data_count: customerData.length,
    });
  } catch (err) { next(err); }
});


// Flag detection — simple keyword-based heuristic for MVP.
function detectFlags(customerMessage, agentResponse) {
  const flags = [];
  const msg = customerMessage.toLowerCase();

  // Exploitation / scam concerns
  if (msg.includes('someone called me') || msg.includes('gave them my') || msg.includes('wire money') || msg.includes('gift card')) {
    flags.push({
      type: 'exploitation_concern',
      severity: 'critical',
      description: `Potential exploitation detected. Customer message: "${customerMessage.substring(0, 200)}"`,
    });
  }

  // High emotion
  if (msg.includes('scared') || msg.includes('terrified') || msg.includes("can't sleep") || msg.includes('panic') || msg.includes('desperate')) {
    flags.push({
      type: 'high_emotion',
      severity: 'medium',
      description: `Customer expressing high emotional distress. Message: "${customerMessage.substring(0, 200)}"`,
    });
  }

  // Large withdrawal
  if ((msg.includes('withdraw') || msg.includes('take out') || msg.includes('cash out')) &&
      (msg.includes('all') || msg.includes('everything') || /\$\d{5,}/.test(msg))) {
    flags.push({
      type: 'escalation',
      severity: 'high',
      description: `Large withdrawal request detected. Customer message: "${customerMessage.substring(0, 200)}"`,
    });
  }

  // Wants human advisor
  if (msg.includes('talk to someone') || msg.includes('real person') || msg.includes('human advisor') || msg.includes('speak to my advisor')) {
    flags.push({
      type: 'advisor_requested',
      severity: 'medium',
      description: `Customer requesting human advisor connection.`,
    });
  }

  return flags;
}


/**
 * Detect if the customer is trying to name the agent.
 * Returns the detected name or null. Matches patterns like "call you Rosie",
 * "your name is Rosie", or `"Rosie" sounds good`.
 */
function detectAgentNaming(message) {
  const lower = message.toLowerCase().trim();

  // Patterns that indicate naming intent
  const patterns = [
    /(?:call you|name you|calling you|i'll call you|i will call you|your name is|your name should be|let's go with|how about|i'd like to call you|i want to call you)\s+["']?([A-Z][a-zA-Z]{1,20})["']?/i,
    /["']([A-Z][a-zA-Z]{1,20})["']\s*(?:sounds good|works|is good|is nice|feels right)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Filter out common words that aren't names
      const notNames = ['the', 'that', 'this', 'what', 'something', 'anything', 'nothing', 'maybe', 'sure', 'okay', 'yes', 'please'];
      if (!notNames.includes(name.toLowerCase()) && name.length >= 2) {
        return name;
      }
    }
  }

  return null;
}



module.exports = router;
