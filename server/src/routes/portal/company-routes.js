/**
 * SHENMAY AI — Tenant Portal: Company Profile
 *
 * Sub-router mounted by ../portal.js at `/api/portal/company`.
 * `requirePortalAuth` already ran on the parent so `req.portal` is populated.
 *
 *   PUT /api/portal/company — update tenant identity (name, agent name, branding, etc.)
 *
 * If a key identity field changes (name / agent_name / vertical / description),
 * the agent soul is auto-regenerated in the background as a fire-and-forget
 * side-effect — the response returns immediately.
 */

const router = require('express').Router();
const db = require('../../db');
const { markStepComplete } = require('../../utils/onboarding');

router.put('/', async (req, res, next) => {
  try {
    const {
      name, agent_name, vertical, primary_color, secondary_color,
      website_url, company_description, logo_url, chat_bubble_name,
    } = req.body;

    await db.query(
      `UPDATE tenants SET
         name                = COALESCE($1, name),
         agent_name          = COALESCE($2, agent_name),
         vertical            = COALESCE($3, vertical),
         primary_color       = COALESCE($4, primary_color),
         secondary_color     = COALESCE($5, secondary_color),
         website_url         = COALESCE($6, website_url),
         company_description = COALESCE($7, company_description),
         logo_url            = COALESCE($8, logo_url),
         chat_bubble_name    = COALESCE($9, chat_bubble_name)
       WHERE id = $10`,
      [name, agent_name, vertical, primary_color, secondary_color,
       website_url, company_description, logo_url, chat_bubble_name, req.portal.tenant_id]
    );

    await markStepComplete(req.portal.tenant_id, 'company');

    // Auto-regenerate soul in background if key identity fields changed
    // (don't await — fire and forget, no need to block the response)
    if (name || agent_name || vertical || company_description) {
      setImmediate(async () => {
        try {
          const { generateAgentSoul } = require('../../engine/soulGenerator');
          const { rows } = await db.query(
            `SELECT name, agent_name, vertical, company_description, website_url,
                    api_key_encrypted, llm_provider FROM tenants WHERE id = $1`,
            [req.portal.tenant_id]
          );
          if (!rows[0]) return;
          const tenant = rows[0];
          let apiKey = null;
          if (tenant.api_key_encrypted) {
            const { decrypt } = require('../../services/apiKeyService');
            try { apiKey = decrypt(tenant.api_key_encrypted); } catch { /* use platform key */ }
          }
          const soul = await generateAgentSoul(tenant, apiKey);
          await db.query(
            `UPDATE tenants SET agent_soul_template = $1 WHERE id = $2`,
            [JSON.stringify(soul), req.portal.tenant_id]
          );
          console.log(`[SoulGenerator] Soul auto-regenerated for tenant ${req.portal.tenant_id}`);
        } catch (err) {
          console.error('[SoulGenerator] Auto-regenerate failed:', err.message);
        }
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
