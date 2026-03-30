/**
 * NOMII AI — Auth Routes
 *
 * POST /api/auth/detect-tenant — Step 1 login: find tenant from email
 * POST /api/auth/register      — Create a new customer or advisor account
 * POST /api/auth/login         — Authenticate and receive JWT (tenant_id optional)
 * GET  /api/auth/me            — Get current user from JWT
 */

const router = require('express').Router();
const db = require('../db');
const { hashPassword, verifyPassword, generateToken, validatePasswordStrength } = require('../services/authService');
const { requireAuth } = require('../middleware/auth');
const { writeAuditLog } = require('../middleware/auditLog');

// ============================================================
// POST /api/auth/detect-tenant
// Step 1 of two-step login: look up which tenant an email belongs to.
// Returns tenant branding so the login page can update its UI.
// Does NOT require password — just email lookup.
// ============================================================
router.post('/detect-tenant', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Search customers first, then advisors
    const { rows: customerRows } = await db.query(
      `SELECT t.id, t.name, t.slug, t.primary_color, t.secondary_color, t.logo_url, t.agent_name
       FROM customers c JOIN tenants t ON t.id = c.tenant_id
       WHERE c.email = $1 AND t.is_active = true
       LIMIT 1`,
      [email]
    );

    if (customerRows.length > 0) {
      return res.json({ found: true, tenant: customerRows[0], user_type: 'customer' });
    }

    const { rows: advisorRows } = await db.query(
      `SELECT t.id, t.name, t.slug, t.primary_color, t.secondary_color, t.logo_url, t.agent_name
       FROM advisors a JOIN tenants t ON t.id = a.tenant_id
       WHERE a.email = $1 AND t.is_active = true
       LIMIT 1`,
      [email]
    );

    if (advisorRows.length > 0) {
      return res.json({ found: true, tenant: advisorRows[0], user_type: 'advisor' });
    }

    // Not found — return generic response (don't leak existence)
    return res.json({ found: false, tenant: null });
  } catch (err) { next(err); }
});

// ============================================================
// POST /api/auth/register
// ============================================================
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, user_type, tenant_id, phone } = req.body;

    // Validate required fields
    if (!email || !password || !first_name || !last_name || !user_type || !tenant_id) {
      return res.status(400).json({
        error: 'Missing required fields: email, password, first_name, last_name, user_type, tenant_id',
      });
    }

    // Validate user_type
    if (!['customer', 'advisor'].includes(user_type)) {
      return res.status(400).json({ error: 'user_type must be "customer" or "advisor"' });
    }

    // Validate password strength
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    // Verify tenant exists
    const { rows: tenantRows } = await db.query('SELECT id FROM tenants WHERE id = $1', [tenant_id]);
    if (tenantRows.length === 0) {
      return res.status(400).json({ error: 'Tenant not found' });
    }

    // Check if email already registered in this tenant
    const table = user_type === 'customer' ? 'customers' : 'advisors';
    const { rows: existing } = await db.query(
      `SELECT id FROM ${table} WHERE email = $1 AND tenant_id = $2`,
      [email, tenant_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered for this tenant' });
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Insert user
    let user;
    if (user_type === 'customer') {
      const { rows } = await db.query(
        `INSERT INTO customers (tenant_id, first_name, last_name, email, phone, password_hash, onboarding_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, tenant_id, first_name, last_name, email, onboarding_status`,
        [tenant_id, first_name, last_name, email, phone || null, password_hash]
      );
      user = rows[0];
      user.user_type = 'customer';
      user.role = 'customer';
    } else {
      // Default advisor role is 'advisor' — admin can promote later
      const role = req.body.role || 'advisor';
      const { rows } = await db.query(
        `INSERT INTO advisors (tenant_id, name, email, role, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, name, email, role`,
        [tenant_id, `${first_name} ${last_name}`, email, role, password_hash]
      );
      user = rows[0];
      user.user_type = 'advisor';
    }

    // Generate JWT
    const token = generateToken({
      user_id: user.id,
      tenant_id: user.tenant_id,
      user_type: user.user_type,
      role: user.role,
      email: user.email,
    });

    res.status(201).json({ token, user });
  } catch (err) { next(err); }
});


// ============================================================
// POST /api/auth/login
// ============================================================
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    // tenant_id is optional — if not provided, auto-detect from email
    let { tenant_id } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // Try to find user in customers first, then advisors
    let user = null;
    let userType = null;

    if (tenant_id) {
      // Fast path: tenant_id provided, search within that tenant only
      const { rows: customerRows } = await db.query(
        `SELECT id, tenant_id, first_name, last_name, email, password_hash, onboarding_status
         FROM customers WHERE email = $1 AND tenant_id = $2`,
        [email, tenant_id]
      );
      if (customerRows.length > 0) {
        user = customerRows[0];
        userType = 'customer';
        user.role = 'customer';
      }

      if (!user) {
        const { rows: advisorRows } = await db.query(
          `SELECT id, tenant_id, name, email, role, password_hash
           FROM advisors WHERE email = $1 AND tenant_id = $2`,
          [email, tenant_id]
        );
        if (advisorRows.length > 0) {
          user = advisorRows[0];
          userType = 'advisor';
        }
      }
    } else {
      // Auto-detect: search across all tenants
      const { rows: customerRows } = await db.query(
        `SELECT c.id, c.tenant_id, c.first_name, c.last_name, c.email,
                c.password_hash, c.onboarding_status
         FROM customers c
         JOIN tenants t ON t.id = c.tenant_id
         WHERE c.email = $1 AND t.is_active = true
         LIMIT 1`,
        [email]
      );
      if (customerRows.length > 0) {
        user = customerRows[0];
        userType = 'customer';
        user.role = 'customer';
        tenant_id = user.tenant_id;
      }

      if (!user) {
        const { rows: advisorRows } = await db.query(
          `SELECT a.id, a.tenant_id, a.name, a.email, a.role, a.password_hash
           FROM advisors a
           JOIN tenants t ON t.id = a.tenant_id
           WHERE a.email = $1 AND t.is_active = true
           LIMIT 1`,
          [email]
        );
        if (advisorRows.length > 0) {
          user = advisorRows[0];
          userType = 'advisor';
          tenant_id = user.tenant_id;
        }
      }
    }

    if (!user) {
      // Audit: failed login — unknown email
      writeAuditLog({
        actorType   : 'customer',
        actorEmail  : email,
        tenantId    : tenant_id || null,
        eventType   : 'auth.login.failed',
        description : `Login failed — email not found: ${email}`,
        req,
        success     : false,
        errorMessage: 'Unknown email',
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // User exists but no password set (legacy/seeded data without auth)
    if (!user.password_hash) {
      writeAuditLog({
        actorType   : user.user_type || 'customer',
        actorId     : user.id,
        actorEmail  : email,
        tenantId    : user.tenant_id,
        eventType   : 'auth.login.failed',
        description : `Login failed — no password set for account: ${email}`,
        req,
        success     : false,
        errorMessage: 'No password configured',
      });
      return res.status(401).json({ error: 'Account requires password setup. Please register.' });
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      // Audit: failed login — wrong password
      writeAuditLog({
        actorType   : userType || 'customer',
        actorId     : user.id,
        actorEmail  : email,
        tenantId    : user.tenant_id,
        eventType   : 'auth.login.failed',
        description : `Login failed — incorrect password for: ${email}`,
        req,
        success     : false,
        errorMessage: 'Incorrect password',
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = generateToken({
      user_id: user.id,
      tenant_id: user.tenant_id,
      user_type: userType,
      role: user.role,
      email: user.email,
    });

    // Audit: successful login
    writeAuditLog({
      actorType   : userType,
      actorId     : user.id,
      actorEmail  : email,
      tenantId    : user.tenant_id,
      eventType   : 'auth.login.success',
      description : `Successful login for ${userType}: ${email}`,
      req,
      success     : true,
    });

    // Strip password_hash from response
    delete user.password_hash;
    user.user_type = userType;

    res.json({ token, user });
  } catch (err) { next(err); }
});


// ============================================================
// GET /api/auth/me — Return current user from JWT
// ============================================================
router.get('/me', requireAuth(), async (req, res, next) => {
  try {
    const { user_id, user_type, tenant_id } = req.user;

    let user;
    if (user_type === 'customer') {
      const { rows } = await db.query(
        `SELECT id, tenant_id, first_name, last_name, email, phone, onboarding_status,
                soul_file->'base_identity'->>'customer_given_name' as agent_name
         FROM customers WHERE id = $1 AND tenant_id = $2`,
        [user_id, tenant_id]
      );
      user = rows[0];
      if (user) {
        user.user_type = 'customer';
        user.role = 'customer';
      }
    } else {
      const { rows } = await db.query(
        'SELECT id, tenant_id, name, email, role FROM advisors WHERE id = $1 AND tenant_id = $2',
        [user_id, tenant_id]
      );
      user = rows[0];
      if (user) user.user_type = 'advisor';
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Also fetch tenant info for branding
    const { rows: tenantRows } = await db.query(
      'SELECT id, name, slug, vertical, agent_name, primary_color, secondary_color, logo_url FROM tenants WHERE id = $1',
      [tenant_id]
    );

    res.json({ user, tenant: tenantRows[0] || null });
  } catch (err) { next(err); }
});


module.exports = router;
