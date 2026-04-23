/**
 * SHENMAY AI — Authentication & Authorization Middleware
 *
 * Provides Express middleware for:
 *   - requireAuth()  — Validates JWT, attaches req.user
 *   - requireRole()  — Checks user role (customer, advisor, admin, etc.)
 *   - requireTenantScope() — Ensures requests only access own tenant data
 */

const { validateToken } = require('../services/authService');

/**
 * Require a valid JWT. Attaches decoded user to req.user.
 *
 * req.user shape:
 *   { user_id, tenant_id, user_type, role, email }
 */
function requireAuth() {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = validateToken(token);
      req.user = decoded;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

/**
 * Require specific role(s). Must be used AFTER requireAuth().
 *
 * Usage:
 *   requireRole('admin')
 *   requireRole('advisor', 'admin')    — either role works
 *   requireRole('customer')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role;

    // Admin always has access
    if (userRole === 'admin') {
      return next();
    }

    if (!roles.includes(userRole) && !roles.includes(req.user.user_type)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Enforce tenant isolation. Auto-injects req.tenant_id from JWT.
 * If a tenant_id is provided in query/body/params, validates it matches.
 *
 * Must be used AFTER requireAuth().
 */
function requireTenantScope() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userTenantId = req.user.tenant_id;

    // Check if request specifies a different tenant
    const requestTenantId = req.query.tenant_id || req.body.tenant_id || req.params.tenantId;
    if (requestTenantId && requestTenantId !== userTenantId) {
      return res.status(403).json({ error: 'Cannot access other tenant data' });
    }

    // Auto-inject the user's tenant_id for downstream use
    req.tenant_id = userTenantId;
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireTenantScope,
};
