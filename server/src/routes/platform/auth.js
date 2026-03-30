/**
 * NOMII AI — Platform Admin Auth Routes
 *
 * POST /api/platform/auth/login   — Authenticate platform admin, get JWT
 * GET  /api/platform/auth/me      — Get current platform admin from JWT
 * POST /api/platform/auth/setup   — Create first platform admin (one-time, only if none exist)
 */

const router = require('express').Router();
const db = require('../../db');
const { hashPassword, verifyPassword, generateToken, validatePasswordStrength } = require('../../services/authService');
const { requirePlatformAuth } = require('../../middleware/platformAuth');

// ============================================================
// POST /api/platform/auth/setup
// One-time setup: create the first platform admin.
// Blocked once any platform admin exists.
// ============================================================
router.post('/setup', async (req, res, next) => {
  try {
    // Only allowed if no platform admins exist yet
    const { rows: existing } = await db.query('SELECT id FROM platform_admins LIMIT 1');
    if (existing.length > 0) {
      return res.status(403).json({
        error: 'Platform admin already exists. Use /login to authenticate.',
      });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.message });
    }

    const password_hash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO platform_admins (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, password_hash]
    );

    const admin = rows[0];
    const token = generateToken({
      platform_admin_id: admin.id,
      user_type: 'platform_admin',
      email: admin.email,
    });

    res.status(201).json({ token, admin });
  } catch (err) { next(err); }
});


// ============================================================
// POST /api/platform/auth/login
// ============================================================
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await db.query(
      'SELECT id, name, email, password_hash, is_active FROM platform_admins WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const admin = rows[0];

    if (!admin.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const valid = await verifyPassword(password, admin.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      platform_admin_id: admin.id,
      user_type: 'platform_admin',
      email: admin.email,
    });

    delete admin.password_hash;
    res.json({ token, admin });
  } catch (err) { next(err); }
});


// ============================================================
// GET /api/platform/auth/me
// ============================================================
router.get('/me', requirePlatformAuth(), async (req, res, next) => {
  try {
    const { platform_admin_id } = req.platformAdmin;
    const { rows } = await db.query(
      'SELECT id, name, email, is_active, created_at FROM platform_admins WHERE id = $1',
      [platform_admin_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ admin: rows[0] });
  } catch (err) { next(err); }
});


module.exports = router;
