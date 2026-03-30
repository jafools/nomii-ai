/**
 * NOMII AI — Advisor Routes
 * Human advisor management
 *
 * Advisors: can view own profile and assigned customers
 * Admins: can list/create/update/delete advisors
 */

const router = require('express').Router();
const db = require('../db');
const { requireAuth, requireRole, requireTenantScope } = require('../middleware/auth');

// GET /api/advisors — List advisors for tenant (advisor/admin)
router.get('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.name, a.email, a.role, a.is_active, a.created_at,
              (SELECT COUNT(*) FROM advisor_customers ac WHERE ac.advisor_id = a.id AND ac.is_primary = true) as primary_customer_count
       FROM advisors a
       WHERE a.tenant_id = $1 AND a.is_active = true
       ORDER BY a.name`,
      [req.tenant_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/advisors/:id — Advisor details with assigned customers
router.get('/:id', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    // Advisors can only view their own profile (unless admin)
    if (req.user.user_type === 'advisor' && req.user.role !== 'admin' && req.params.id !== req.user.user_id) {
      return res.status(403).json({ error: 'Can only view your own advisor profile' });
    }

    const { rows: advisorRows } = await db.query(
      'SELECT id, name, email, role, tenant_id, is_active, created_at FROM advisors WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenant_id]
    );
    if (advisorRows.length === 0) return res.status(404).json({ error: 'Advisor not found' });

    const { rows: customers } = await db.query(
      `SELECT c.id, c.first_name, c.last_name, c.onboarding_status, c.last_interaction_at, ac.is_primary
       FROM advisor_customers ac
       JOIN customers c ON ac.customer_id = c.id
       WHERE ac.advisor_id = $1 AND c.is_active = true
       ORDER BY ac.is_primary DESC, c.last_name`,
      [req.params.id]
    );

    const { rows: flags } = await db.query(
      `SELECT f.*, c.first_name, c.last_name
       FROM flags f
       JOIN customers c ON f.customer_id = c.id
       WHERE f.assigned_advisor_id = $1 AND f.status IN ('open', 'in_review')
       ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, f.created_at DESC`,
      [req.params.id]
    );

    res.json({
      ...advisorRows[0],
      customers,
      open_flags: flags,
    });
  } catch (err) { next(err); }
});

// POST /api/advisors — Create new advisor (admin only)
router.post('/', requireAuth(), requireRole('admin'), requireTenantScope(), async (req, res, next) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email are required' });
    }

    // Check if email already exists for this tenant
    const { rows: existing } = await db.query(
      'SELECT id FROM advisors WHERE email = $1 AND tenant_id = $2',
      [email, req.tenant_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered as advisor in this tenant' });
    }

    const { rows } = await db.query(
      `INSERT INTO advisors (tenant_id, name, email, role)
       VALUES ($1, $2, $3, $4) RETURNING id, tenant_id, name, email, role, created_at`,
      [req.tenant_id, name, email, role || 'advisor']
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/advisors/:id — Update advisor (admin only)
router.put('/:id', requireAuth(), requireRole('admin'), requireTenantScope(), async (req, res, next) => {
  try {
    const { name, email, role, is_active } = req.body;
    const updates = [];
    const params = [req.params.id, req.tenant_id];
    let paramIndex = 3;

    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); params.push(name); }
    if (email !== undefined) { updates.push(`email = $${paramIndex++}`); params.push(email); }
    if (role !== undefined) { updates.push(`role = $${paramIndex++}`); params.push(role); }
    if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); params.push(is_active); }

    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    const { rows } = await db.query(
      `UPDATE advisors SET ${updates.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING id, name, email, role, is_active`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Advisor not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
