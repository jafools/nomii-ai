/**
 * SHENMAY AI — Tenant Portal: BYOK API Key Management
 *
 * Sub-router mounted by ../portal.js at `/api/portal/api-key`.
 * All requests have already passed `requirePortalAuth` (set by the parent),
 * so `req.portal` is populated.
 *
 *   POST   /api/portal/api-key       — save + validate a BYOK API key
 *   DELETE /api/portal/api-key       — remove stored key
 *   POST   /api/portal/api-key/test  — test existing stored key
 *
 * On a successful POST, kicks off a fire-and-forget agent-soul auto-generation
 * (only if no soul exists yet) so the very first validated-key moment also
 * seeds the personality template — saves the operator from running the
 * generator manually.
 */

const router  = require('express').Router();
const db      = require('../../db');
const { encrypt, decrypt, getLast4 } = require('../../services/apiKeyService');
const { validateApiKey }             = require('../../services/llmService');
const { markStepComplete }           = require('../../utils/onboarding');

// POST /api/portal/api-key  — save + validate a BYOK API key
router.post('/', async (req, res, next) => {
  try {
    const { api_key, provider } = req.body;
    if (!api_key || !api_key.trim()) {
      return res.status(400).json({ error: 'api_key is required' });
    }

    const prov = (provider || 'anthropic').toLowerCase();
    const key  = api_key.trim();

    // 1. Validate the key with a test call
    const validation = await validateApiKey(key, prov);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'api_key_invalid',
        message: validation.error,
      });
    }

    // 2. Encrypt and store
    const { encrypted, iv } = encrypt(key);
    const last4 = getLast4(key);

    await db.query(
      `UPDATE tenants SET
         llm_api_key_encrypted = $1,
         llm_api_key_iv        = $2,
         llm_api_key_provider  = $3,
         llm_api_key_validated = true,
         llm_api_key_last4     = $4,
         llm_provider          = $3
       WHERE id = $5`,
      [encrypted, iv, prov, last4, req.portal.tenant_id]
    );

    // 3. Mark onboarding step complete
    await markStepComplete(req.portal.tenant_id, 'api_key');

    // 4. Auto-generate soul in background — this is the first moment we have
    //    a validated API key, so kick off soul generation now if not yet done.
    //    Fire-and-forget: don't block the response.
    setImmediate(async () => {
      try {
        const { generateAgentSoul } = require('../../engine/soulGenerator');
        const { rows } = await db.query(
          `SELECT name, agent_name, vertical, company_description, website_url,
                  agent_soul_template
           FROM tenants WHERE id = $1`,
          [req.portal.tenant_id]
        );
        if (!rows[0]) return;
        const tenant = rows[0];

        // Only auto-generate if no soul exists yet (don't overwrite a manually regenerated one)
        if (tenant.agent_soul_template) {
          console.log(`[SoulGenerator] Soul already exists for tenant ${req.portal.tenant_id} — skipping auto-generate`);
          return;
        }

        const soul = await generateAgentSoul(tenant, key);
        await db.query(
          `UPDATE tenants SET agent_soul_template = $1 WHERE id = $2`,
          [JSON.stringify(soul), req.portal.tenant_id]
        );
        console.log(`[SoulGenerator] Soul auto-generated on API key save for tenant ${req.portal.tenant_id}`);
      } catch (err) {
        console.error('[SoulGenerator] Auto-generate on API key save failed:', err.message);
      }
    });

    res.json({
      ok: true,
      provider: prov,
      last4,
      validated: true,
    });
  } catch (err) { next(err); }
});

// DELETE /api/portal/api-key  — remove stored key
router.delete('/', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE tenants SET
         llm_api_key_encrypted = NULL,
         llm_api_key_iv        = NULL,
         llm_api_key_validated = false,
         llm_api_key_last4     = NULL
       WHERE id = $1`,
      [req.portal.tenant_id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/portal/api-key/test  — test existing stored key
router.post('/test', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT llm_api_key_encrypted, llm_api_key_iv, llm_api_key_provider FROM tenants WHERE id = $1',
      [req.portal.tenant_id]
    );
    const t = rows[0];
    if (!t || !t.llm_api_key_encrypted) {
      return res.status(400).json({ error: 'No API key stored' });
    }

    const key = decrypt(t.llm_api_key_encrypted, t.llm_api_key_iv);
    const result = await validateApiKey(key, t.llm_api_key_provider || 'anthropic');

    if (result.valid) {
      await db.query('UPDATE tenants SET llm_api_key_validated = true WHERE id = $1', [req.portal.tenant_id]);
    } else {
      await db.query('UPDATE tenants SET llm_api_key_validated = false WHERE id = $1', [req.portal.tenant_id]);
    }

    res.json({ valid: result.valid, error: result.error || null });
  } catch (err) { next(err); }
});

module.exports = router;
