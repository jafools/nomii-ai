/**
 * NOMII AI — Flag Routes
 * Escalation and alert management for advisors
 *
 * Advisors: can view/update flags assigned to them or in their tenant
 * Admins: full access within tenant
 * Customers: no direct flag access
 */

const router = require('express').Router();
const db = require('../db');
const { requireAuth, requireTenantScope } = require('../middleware/auth');

// GET /api/flags — All flags for tenant (advisor/admin only)
router.get('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Customers cannot access flags' });
    }

    const { status, advisor_id } = req.query;

    let conditions = [`c.tenant_id = $1`];
    let params = [req.tenant_id];
    let paramIndex = 2;

    if (status) {
      conditions.push(`f.status = $${paramIndex++}`);
      params.push(status);
    }
    if (advisor_id) {
      conditions.push(`f.assigned_advisor_id = $${paramIndex++}`);
      params.push(advisor_id);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const { rows } = await db.query(
      `SELECT f.*, c.first_name, c.last_name, a.name as assigned_advisor_name
       FROM flags f
       JOIN customers c ON f.customer_id = c.id
       LEFT JOIN advisors a ON f.assigned_advisor_id = a.id
       ${whereClause}
       ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
                f.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/flags — Create a new flag (advisor/admin)
router.post('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Customers cannot create flags' });
    }

    const { customer_id, conversation_id, flag_type, severity, description, assigned_advisor_id } = req.body;
    if (!customer_id || !flag_type || !description) {
      return res.status(400).json({ error: 'customer_id, flag_type, and description are required' });
    }

    const { rows } = await db.query(
      `INSERT INTO flags (customer_id, conversation_id, flag_type, severity, description, assigned_advisor_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [customer_id, conversation_id, flag_type, severity || 'medium', description, assigned_advisor_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/flags/:id — Update flag status (advisor/admin)
router.put('/:id', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Customers cannot update flags' });
    }

    const { status, resolution_notes, assigned_advisor_id } = req.body;
    const updates = [];
    const params = [req.params.id];
    let paramIndex = 2;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
      if (status === 'resolved') {
        updates.push(`resolved_at = NOW()`);
      }
    }
    if (resolution_notes) {
      updates.push(`resolution_notes = $${paramIndex++}`);
      params.push(resolution_notes);
    }
    if (assigned_advisor_id) {
      updates.push(`assigned_advisor_id = $${paramIndex++}`);
      params.push(assigned_advisor_id);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    const { rows } = await db.query(
      `UPDATE flags SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Flag not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
