/**
 * NOMII AI — Customer Routes
 * CRUD for customers + Soul/Memory management (industry-agnostic)
 *
 * Customers: can access own profile only
 * Advisors: can access all customers in their tenant
 * Admins: full access within tenant
 */

const router = require('express').Router();
const db = require('../db');
const { hashPassword } = require('../services/authService');
const { requireAuth, requireTenantScope, requireCustomerOwnership } = require('../middleware/auth');
const { encryptJson, safeDecryptJson } = require('../services/cryptoService');

// ─── CSV utility ─────────────────────────────────────────────────────────────
// Parses a CSV string into an array of row objects.
// Handles quoted fields (commas/newlines inside quotes, escaped quotes).
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  function splitLine(line) {
    const cols = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  }

  const headers = splitLine(lines[0]).map(
    h => h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  );
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// Canonical field name aliases
const FIELD_ALIASES = {
  firstname: 'first_name', first_name: 'first_name',
  lastname: 'last_name', last_name: 'last_name',
  email: 'email', emailaddress: 'email', email_address: 'email',
  phone: 'phone', phonenumber: 'phone', phone_number: 'phone', mobile: 'phone',
  dateofbirth: 'date_of_birth', date_of_birth: 'date_of_birth',
  dob: 'date_of_birth', birthdate: 'date_of_birth', birth_date: 'date_of_birth',
  location: 'location', city: 'location', address: 'location',
  advisor_email: 'advisor_email', advisoremail: 'advisor_email',
  onboarding_status: 'onboarding_status',
  password: 'password',
};

// Financial column detection suffixes
const FINANCIAL_SUFFIXES = ['_balance', '_monthly', '_value', '_income', '_payment', '_amount'];

// ============================================================
// POST /api/customers — Create a single customer (admin only)
// ============================================================
router.post('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (!['admin'].includes(req.user.role) && req.user.user_type !== 'advisor') {
      return res.status(403).json({ error: 'Only advisors and admins can create customers' });
    }

    const {
      first_name, last_name, email, phone,
      date_of_birth, location, advisor_email,
      onboarding_status = 'pending', password,
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }

    // Resolve advisor
    let assigned_advisor_id = req.body.assigned_advisor_id || null;
    if (!assigned_advisor_id && advisor_email) {
      const { rows: adv } = await db.query(
        'SELECT id FROM advisors WHERE email = $1 AND tenant_id = $2',
        [advisor_email, req.tenant_id]
      );
      if (adv.length > 0) assigned_advisor_id = adv[0].id;
    }

    // Hash password if provided, otherwise null (user will be invited later)
    const password_hash = password ? await hashPassword(password) : null;

    const { rows } = await db.query(
      `INSERT INTO customers
         (tenant_id, first_name, last_name, email, phone, date_of_birth,
          location, assigned_advisor_id, onboarding_status, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, tenant_id, first_name, last_name, email, phone,
                 onboarding_status, assigned_advisor_id, created_at`,
      [
        req.tenant_id, first_name, last_name,
        email || null, phone || null,
        date_of_birth || null, location || null,
        assigned_advisor_id, onboarding_status, password_hash,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});


// ============================================================
// POST /api/customers/import — Bulk CSV import (admin only)
//
// Accepts { csv_text: "...", default_password: "..." } in JSON body.
// The frontend reads the file via FileReader and sends the string.
// Returns { created, skipped, errors } summary.
// ============================================================
router.post('/import', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can bulk import customers' });
    }

    const { csv_text, default_password } = req.body;
    if (!csv_text || typeof csv_text !== 'string') {
      return res.status(400).json({ error: 'csv_text (string) is required' });
    }

    const rows = parseCSV(csv_text);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV is empty or has no data rows' });
    }

    // Load tenant config for data_categories
    const { rows: tenantRows } = await db.query(
      'SELECT vertical_config FROM tenants WHERE id = $1',
      [req.tenant_id]
    );
    const dataCategories = tenantRows[0]?.vertical_config?.data_categories || [];

    // Pre-load all advisors for this tenant (for advisor_email lookup)
    const { rows: advisors } = await db.query(
      'SELECT id, email FROM advisors WHERE tenant_id = $1',
      [req.tenant_id]
    );
    const advisorByEmail = {};
    advisors.forEach(a => { advisorByEmail[a.email.toLowerCase()] = a.id; });

    const defaultPasswordHash = default_password
      ? await hashPassword(default_password)
      : null;

    const created = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, +1 for header row

      try {
        // Map aliased headers to canonical names
        const mapped = {};
        const extra = {};
        Object.entries(row).forEach(([rawKey, val]) => {
          const canonical = FIELD_ALIASES[rawKey];
          if (canonical) {
            mapped[canonical] = val;
          } else {
            extra[rawKey] = val;
          }
        });

        // Require at minimum a first or last name
        const firstName = mapped.first_name || '';
        const lastName  = mapped.last_name  || '';
        if (!firstName && !lastName) {
          errors.push({ row: rowNum, reason: 'Missing first_name and last_name', data: row });
          continue;
        }

        // Skip if email already exists for this tenant
        if (mapped.email) {
          const { rows: existing } = await db.query(
            'SELECT id FROM customers WHERE email = $1 AND tenant_id = $2',
            [mapped.email, req.tenant_id]
          );
          if (existing.length > 0) {
            skipped.push({ row: rowNum, email: mapped.email, reason: 'Email already exists' });
            continue;
          }
        }

        // Resolve advisor
        let assigned_advisor_id = null;
        if (mapped.advisor_email) {
          assigned_advisor_id = advisorByEmail[mapped.advisor_email.toLowerCase()] || null;
        }

        // Per-row password takes priority over default
        const rowPasswordHash = mapped.password
          ? await hashPassword(mapped.password)
          : defaultPasswordHash;

        // Validate onboarding_status
        const validStatuses = ['pending', 'in_progress', 'complete'];
        const onboardingStatus = validStatuses.includes(mapped.onboarding_status)
          ? mapped.onboarding_status
          : 'pending';

        // Insert customer
        const { rows: inserted } = await db.query(
          `INSERT INTO customers
             (tenant_id, first_name, last_name, email, phone, date_of_birth,
              location, assigned_advisor_id, onboarding_status, password_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id, first_name, last_name, email`,
          [
            req.tenant_id,
            firstName || 'Unknown',
            lastName  || 'Unknown',
            mapped.email    || null,
            mapped.phone    || null,
            mapped.date_of_birth || null,
            mapped.location || null,
            assigned_advisor_id,
            onboardingStatus,
            rowPasswordHash,
          ]
        );

        const customer = inserted[0];

        // ── Parse financial data columns ──────────────────────────────
        // Build customer_data records from columns matching financial patterns
        const financialEntries = [];

        Object.entries(extra).forEach(([col, val]) => {
          if (!val) return;

          // Try to detect category and type from column name
          // Pattern: {category}_balance, {category}_monthly, etc.
          const numericVal = parseFloat(val.toString().replace(/[$,]/g, ''));
          if (isNaN(numericVal)) return; // Skip non-numeric values in financial cols

          let category = null;
          let valueField = 'value_primary';
          let dataType = 'account';

          // Check financial suffix
          for (const suf of FINANCIAL_SUFFIXES) {
            if (col.endsWith(suf)) {
              category = col.slice(0, col.length - suf.length);
              if (suf === '_monthly' || suf === '_income' || suf === '_payment') {
                valueField = 'value_monthly';
                dataType = suf === '_payment' ? 'debt' : 'income_source';
              }
              break;
            }
          }

          // Also match known data categories directly
          if (!category) {
            const matchedCat = dataCategories.find(c =>
              col.startsWith(c.replace(/_/g, '').toLowerCase()) ||
              col === c.toLowerCase()
            );
            if (matchedCat) category = matchedCat;
          }

          if (!category) return; // Skip unrecognized columns

          financialEntries.push({
            category: category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            category_key: category,
            data_type: dataType,
            label: col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            value: numericVal,
            value_field: valueField,
          });
        });

        // Insert customer_data records
        for (const entry of financialEntries) {
          await db.query(
            `INSERT INTO customer_data
               (customer_id, data_category, data_type, label, ${entry.value_field}, source)
             VALUES ($1,$2,$3,$4,$5,'csv_import')`,
            [customer.id, entry.category_key, entry.data_type, entry.label, entry.value]
          );
        }

        // Store any remaining extra columns in soul_file.import_data
        const nonFinancialExtra = {};
        Object.entries(extra).forEach(([col, val]) => {
          const isFinancial = financialEntries.some(f => f.label.toLowerCase().replace(/\s+/g, '_') === col);
          if (!isFinancial && val) nonFinancialExtra[col] = val;
        });

        if (Object.keys(nonFinancialExtra).length > 0) {
          // Read → decrypt → modify → encrypt → write (avoids jsonb_set on encrypted column)
          const { rows: soulRows } = await db.query(
            `SELECT soul_file FROM customers WHERE id = $1`,
            [customer.id]
          );
          const soul = safeDecryptJson(soulRows[0]?.soul_file);
          soul.import_data = nonFinancialExtra;
          await db.query(
            `UPDATE customers SET soul_file = $1 WHERE id = $2`,
            [JSON.stringify(encryptJson(soul)), customer.id]
          );
        }

        created.push({
          id: customer.id,
          name: `${customer.first_name} ${customer.last_name}`,
          email: customer.email,
          financial_records_created: financialEntries.length,
        });
      } catch (rowErr) {
        errors.push({ row: rowNum, reason: rowErr.message, data: row });
      }
    }

    res.status(207).json({
      summary: {
        total_rows: rows.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created,
      skipped,
      errors,
    });
  } catch (err) { next(err); }
});


// GET /api/customers — List customers for the authenticated tenant
router.get('/', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    // Customers shouldn't list all customers — only advisors/admins
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Customers cannot list all customers' });
    }

    const { rows } = await db.query(
      `SELECT c.id, c.first_name, c.last_name, c.email, c.location,
              c.onboarding_status, c.last_interaction_at, c.created_at,
              a.name as advisor_name, a.id as advisor_id
       FROM customers c
       LEFT JOIN advisors a ON c.assigned_advisor_id = a.id
       WHERE c.tenant_id = $1 AND c.is_active = true
       ORDER BY c.last_name, c.first_name`,
      [req.tenant_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/customers/:id — Full customer profile
router.get('/:id', requireAuth(), requireTenantScope(), requireCustomerOwnership(), async (req, res, next) => {
  try {
    const { rows: customerRows } = await db.query(
      `SELECT c.*, a.name as advisor_name, a.email as advisor_email,
              t.name as tenant_name, t.agent_name, t.vertical, t.vertical_config
       FROM customers c
       LEFT JOIN advisors a ON c.assigned_advisor_id = a.id
       LEFT JOIN tenants t ON c.tenant_id = t.id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [req.params.id, req.tenant_id]
    );
    if (customerRows.length === 0) return res.status(404).json({ error: 'Customer not found' });

    const customer = customerRows[0];

    // Get customer data
    const { rows: customerData } = await db.query(
      'SELECT * FROM customer_data WHERE customer_id = $1 ORDER BY data_category, label',
      [req.params.id]
    );

    // Get recent flags
    const { rows: flags } = await db.query(
      `SELECT f.*, a.name as assigned_advisor_name
       FROM flags f
       LEFT JOIN advisors a ON f.assigned_advisor_id = a.id
       WHERE f.customer_id = $1
       ORDER BY f.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    // Get conversation count
    const { rows: convStats } = await db.query(
      'SELECT COUNT(*) as total_conversations FROM conversations WHERE customer_id = $1',
      [req.params.id]
    );

    // Strip password_hash from response; decrypt encrypted columns
    delete customer.password_hash;
    customer.soul_file   = safeDecryptJson(customer.soul_file);
    customer.memory_file = safeDecryptJson(customer.memory_file);

    res.json({
      ...customer,
      customer_data: customerData,
      recent_flags: flags,
      total_conversations: parseInt(convStats[0].total_conversations),
    });
  } catch (err) { next(err); }
});

// PUT /api/customers/:id/soul — Update Soul file (advisor/admin only)
router.put('/:id/soul', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Customers cannot edit Soul files' });
    }
    const { soul_file } = req.body;
    const { rows } = await db.query(
      'UPDATE customers SET soul_file = $2 WHERE id = $1 AND tenant_id = $3 RETURNING id, first_name, last_name, soul_file',
      [req.params.id, JSON.stringify(encryptJson(soul_file)), req.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const result = rows[0];
    result.soul_file = safeDecryptJson(result.soul_file);
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /api/customers/:id/memory — Update Memory file (advisor/admin only)
router.put('/:id/memory', requireAuth(), requireTenantScope(), async (req, res, next) => {
  try {
    if (req.user.user_type === 'customer') {
      return res.status(403).json({ error: 'Customers cannot edit Memory files' });
    }
    const { memory_file } = req.body;
    const { rows } = await db.query(
      'UPDATE customers SET memory_file = $2 WHERE id = $1 AND tenant_id = $3 RETURNING id, first_name, last_name, memory_file',
      [req.params.id, JSON.stringify(encryptJson(memory_file)), req.tenant_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const result = rows[0];
    result.memory_file = safeDecryptJson(result.memory_file);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/customers/:id/data — Customer data records
router.get('/:id/data', requireAuth(), requireTenantScope(), requireCustomerOwnership(), async (req, res, next) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM customer_data WHERE customer_id = $1';
    const params = [req.params.id];
    if (category) {
      query += ' AND data_category = $2';
      params.push(category);
    }
    query += ' ORDER BY data_category, label';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
