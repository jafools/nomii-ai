/**
 * SHENMAY AI — Tenant Portal: Bell-icon Notifications
 *
 * Sub-router mounted by ../portal.js at `/api/portal/notifications`.
 * All requests have already passed `requirePortalAuth` (set by the parent),
 * so `req.portal` is populated.
 *
 *   GET   /api/portal/notifications              — 30 most recent + unread_count
 *   PATCH /api/portal/notifications/mark-read    — mark all or specific ids as read
 */

const router = require('express').Router();
const db = require('../../db');

// GET /api/portal/notifications — 30 most recent notifications for this tenant
// (newest first). unread_count lets the bell badge update without iterating.
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, type, title, body, resource_type, resource_id,
              customer_name, read_at, created_at
       FROM notifications
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.portal.tenant_id]
    );
    const unread_count = rows.filter(n => !n.read_at).length;
    res.json({ notifications: rows, unread_count });
  } catch (err) { next(err); }
});

// PATCH /api/portal/notifications/mark-read — body: { ids?: string[] }
//   ids omitted  → mark ALL unread notifications as read
//   ids provided → mark only those specific IDs as read
router.patch('/mark-read', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length > 0) {
      await db.query(
        `UPDATE notifications
         SET read_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
        [req.portal.tenant_id, ids]
      );
    } else {
      await db.query(
        `UPDATE notifications
         SET read_at = NOW()
         WHERE tenant_id = $1 AND read_at IS NULL`,
        [req.portal.tenant_id]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
