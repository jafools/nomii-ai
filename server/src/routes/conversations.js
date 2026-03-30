/**
 * NOMII AI — Conversation Routes
 * Chat session management + message history
 *
 * Customers: can list/view/start their own conversations
 * Advisors: can list/view conversations for assigned customers, review them
 * Admins: full access within tenant
 */

const router = require('express').Router();
const db = require('../db');
const { updateMemoryAfterSession } = require('../engine/memoryUpdater');
const { requireAuth, requireTenantScope } = require('../middleware/auth');

// GET /api/conversations — List conversations
router.get('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { customer_id, advisor_id } = req.query;

    // Customers can only list their own conversations
    if (req.user.user_type === 'customer') {
      const { rows } = await db.query(
        `SELECT * FROM conversations WHERE customer_id = $1 ORDER BY started_at DESC`,
        [req.user.user_id]
      );
      return res.json(rows);
    }

    // Advisors/admins can filter
    let query, params;
    if (customer_id) {
      query = `SELECT co.*, c.first_name, c.last_name
               FROM conversations co
               JOIN customers c ON co.customer_id = c.id
               WHERE co.customer_id = $1 AND c.tenant_id = $2
               ORDER BY co.started_at DESC`;
      params = [customer_id, req.tenant_id];
    } else if (advisor_id) {
      query = `SELECT co.*, c.first_name, c.last_name
               FROM conversations co
               JOIN customers c ON co.customer_id = c.id
               JOIN advisor_customers ac ON c.id = ac.customer_id
               WHERE ac.advisor_id = $1 AND c.tenant_id = $2
               ORDER BY co.started_at DESC LIMIT 50`;
      params = [advisor_id, req.tenant_id];
    } else {
      // Admin: list all for tenant
      query = `SELECT co.*, c.first_name, c.last_name
               FROM conversations co
               JOIN customers c ON co.customer_id = c.id
               WHERE c.tenant_id = $1
               ORDER BY co.started_at DESC LIMIT 50`;
      params = [req.tenant_id];
    }

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/conversations — Start new conversation (customer only)
router.post('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { session_type } = req.body;

    // Determine customer_id: from JWT for customers, from body for advisors (testing)
    let customer_id;
    if (req.user.user_type === 'customer') {
      customer_id = req.user.user_id;
    } else {
      customer_id = req.body.customer_id;
      if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    }

    const { rows } = await db.query(
      `INSERT INTO conversations (customer_id, session_type)
       VALUES ($1, $2) RETURNING *`,
      [customer_id, session_type || 'chat']
    );

    await db.query('UPDATE customers SET last_interaction_at = NOW() WHERE id = $1', [customer_id]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/conversations/:id — Full conversation with messages
router.get('/:id', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { rows: convRows } = await db.query(
      `SELECT co.*, c.first_name, c.last_name, c.tenant_id
       FROM conversations co
       JOIN customers c ON co.customer_id = c.id
       WHERE co.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.tenant_id]
    );
    if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    // Customers can only view their own conversations
    if (req.user.user_type === 'customer' && convRows[0].customer_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Can only access your own conversations' });
    }

    const { rows: messages } = await db.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({ ...convRows[0], messages });
  } catch (err) { next(err); }
});

// PUT /api/conversations/:id/end — End a conversation
router.put('/:id/end', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { summary, topics_covered, sentiment } = req.body;
    const { rows } = await db.query(
      `UPDATE conversations SET
        status = 'ended', ended_at = NOW(),
        summary = $2, topics_covered = $3, sentiment = $4
       WHERE id = $1 RETURNING *`,
      [req.params.id, summary, JSON.stringify(topics_covered || []), sentiment]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });

    const memoryUpdate = await updateMemoryAfterSession(req.params.id);

    res.json({ ...rows[0], memory_updated: !!memoryUpdate });
  } catch (err) { next(err); }
});

// PUT /api/conversations/:id/review — Advisor reviews a conversation
router.put('/:id/review', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Only advisors can review conversations' });
    }

    const { notes } = req.body;
    const { rows } = await db.query(
      `UPDATE conversations SET
        advisor_reviewed = true, reviewed_at = NOW(),
        reviewed_by = $2, advisor_notes = $3
       WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.user_id, notes]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
