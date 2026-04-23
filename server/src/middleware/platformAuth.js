/**
 * SHENMAY AI — Platform Admin Authentication Middleware
 *
 * Separate from tenant auth. Platform admins have their own JWT payload:
 *   { platform_admin_id, user_type: 'platform_admin', email }
 *
 * They can manage tenants but cannot access tenant customer/advisor data.
 */

const { validateToken } = require('../services/authService');

/**
 * Require a valid platform admin JWT.
 * Attaches decoded payload to req.platformAdmin.
 */
function requirePlatformAuth() {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Platform authentication required' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = validateToken(token);

      if (decoded.user_type !== 'platform_admin') {
        return res.status(403).json({ error: 'Platform admin access required' });
      }

      req.platformAdmin = decoded;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

module.exports = { requirePlatformAuth };
