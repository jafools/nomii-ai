/**
 * SHENMAY AI — Tenant Portal: Email Templates
 *
 * Sub-router mounted by ../portal.js at `/api/portal/email-templates`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   GET /api/portal/email-templates — current customization (from-name, reply-to, footer)
 *   PUT /api/portal/email-templates — update customization
 */

const router = require('express').Router();
const db = require('../../db');

// GET /api/portal/email-templates — current email customization for this tenant
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT email_from_name, email_reply_to, email_footer FROM tenants WHERE id = $1`,
      [req.portal.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json({
      email_from_name: rows[0].email_from_name || '',
      email_reply_to:  rows[0].email_reply_to  || '',
      email_footer:    rows[0].email_footer     || '',
    });
  } catch (err) { next(err); }
});

// PUT /api/portal/email-templates — update email customization
router.put('/', async (req, res, next) => {
  try {
    const { email_from_name, email_reply_to, email_footer } = req.body;

    // Validate reply-to looks like an email (if provided)
    const cleanReplyTo = (email_reply_to || '').trim().slice(0, 255);
    if (cleanReplyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanReplyTo)) {
      return res.status(400).json({ error: 'Invalid reply-to email address' });
    }

    const cleanFromName = (email_from_name || '').trim().slice(0, 100) || null;
    const cleanFooter   = (email_footer || '').trim().slice(0, 500) || null;

    await db.query(
      `UPDATE tenants SET
         email_from_name = $1,
         email_reply_to  = $2,
         email_footer    = $3
       WHERE id = $4`,
      [cleanFromName, cleanReplyTo || null, cleanFooter, req.portal.tenant_id]
    );

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
