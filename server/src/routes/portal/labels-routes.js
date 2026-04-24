/**
 * SHENMAY AI — Tenant Portal: Labels
 *
 * Sub-router mounted by ../portal.js at `/api/portal/labels`.
 * All requests have already passed `requirePortalAuth` (set by the parent),
 * so `req.portal` is populated.
 *
 *   GET    /api/portal/labels      — list all labels for this tenant
 *   POST   /api/portal/labels      — create
 *   PUT    /api/portal/labels/:id  — update name / color
 *   DELETE /api/portal/labels/:id  — delete (cascade removes assignments)
 *
 * The `POST/DELETE /api/portal/conversations/:id/labels/:labelId` routes
 * that attach / detach labels to conversations live alongside the other
 * conversation routes in the parent portal.js — they use `/conversations`
 * as their path prefix so they can't cleanly mount under `/labels` here.
 */

const router = require('express').Router();
const db = require('../../db');

// GET /api/portal/labels — list all labels for this tenant
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, color, created_at FROM labels WHERE tenant_id = $1 ORDER BY name`,
      [req.portal.tenant_id]
    );
    res.json({ labels: rows });
  } catch (err) { next(err); }
});

// POST /api/portal/labels — create a label
router.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const cleanName  = name.trim().slice(0, 50);
    const cleanColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#6B7585';

    const { rows } = await db.query(
      `INSERT INTO labels (tenant_id, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO NOTHING
       RETURNING id, name, color, created_at`,
      [req.portal.tenant_id, cleanName, cleanColor]
    );
    if (rows.length === 0) return res.status(409).json({ error: 'A label with that name already exists' });
    res.status(201).json({ label: rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/portal/labels/:id — update name / color
router.put('/:id', async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
    const cleanName  = name.trim().slice(0, 50);
    const cleanColor = /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#6B7585';

    const { rows } = await db.query(
      `UPDATE labels SET name = $1, color = $2
       WHERE id = $3 AND tenant_id = $4
       RETURNING id, name, color`,
      [cleanName, cleanColor, req.params.id, req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Label not found' });
    res.json({ label: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/portal/labels/:id — delete (cascade removes conversation_label rows)
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `DELETE FROM labels WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [req.params.id, req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Label not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
