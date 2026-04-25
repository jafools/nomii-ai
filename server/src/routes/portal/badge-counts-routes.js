/**
 * SHENMAY AI — Tenant Portal: Badge Counts
 *
 * Sub-router mounted by ../portal.js at `/api/portal/badge-counts`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   GET /api/portal/badge-counts — unread badge counters for nav (Inbox / Concerns)
 */

const router = require('express').Router();
const db = require('../../db');

// GET /api/portal/badge-counts — unread badge counters for nav
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.unread = TRUE AND c.status != 'escalated') AS unread_conversations,
         COUNT(*) FILTER (WHERE c.status = 'escalated') AS open_concerns,
         COUNT(*) FILTER (WHERE c.status = 'escalated' AND c.unread = TRUE) AS unread_concerns
       FROM conversations c
       JOIN customers cu ON c.customer_id = cu.id
       WHERE cu.tenant_id = $1`,
      [req.portal.tenant_id]
    );
    res.json({
      unread_conversations: parseInt(rows[0].unread_conversations) || 0,
      open_concerns:        parseInt(rows[0].open_concerns)        || 0,
      unread_concerns:      parseInt(rows[0].unread_concerns)      || 0,
    });
  } catch (err) { next(err); }
});

module.exports = router;
