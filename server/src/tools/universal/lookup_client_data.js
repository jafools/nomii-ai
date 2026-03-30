/**
 * TOOL: lookup_client_data
 *
 * Universal tool — works across any industry.
 * Fetches the client's structured data records from customer_data,
 * grouped by category, so Claude can reason over them naturally.
 *
 * For a financial firm:     returns accounts, balances, income sources
 * For a lumber company:     returns projects, order history, material specs
 * For a healthcare firm:    returns conditions, medications, care history
 *
 * The meaning is defined by the tenant's tool_configs description —
 * the code is identical for every industry.
 */

const name = 'lookup_client_data';

const defaultDescription =
  'Retrieves this client\'s structured records on file — any data that has ' +
  'been imported or captured about them (accounts, orders, history, profiles, etc.). ' +
  'Use when the client references their specific data or when you need to know ' +
  'what information is available before answering a detailed question.';

const inputSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      description:
        'Optional. Filter records to a specific category ' +
        '(e.g. "retirement_accounts", "current_orders"). ' +
        'Omit to return all categories.',
    },
  },
  required: [],
};

async function handler({ category } = {}, { db, customerId }) {
  const query = category
    ? `SELECT category, label, value, secondary_value, value_type, metadata, recorded_at
       FROM customer_data
       WHERE customer_id = $1 AND category = $2
       ORDER BY label`
    : `SELECT category, label, value, secondary_value, value_type, metadata, recorded_at
       FROM customer_data
       WHERE customer_id = $1
       ORDER BY category, label`;

  const params = category ? [customerId, category] : [customerId];
  const { rows } = await db.query(query, params);

  if (rows.length === 0) {
    return {
      found: false,
      message:
        'No structured data records are on file for this client yet. ' +
        'You can only work with what they share in conversation.',
    };
  }

  // Group records by category
  const grouped = {};
  let grandTotal = 0;

  for (const row of rows) {
    const cat = row.category;
    if (!grouped[cat]) grouped[cat] = { records: [], category_total: 0 };

    const record = {
      label:        row.label,
      value_type:   row.value_type || null,
      metadata:     row.metadata && Object.keys(row.metadata).length ? row.metadata : null,
      last_updated: row.recorded_at
        ? new Date(row.recorded_at).toLocaleDateString('en-US')
        : null,
    };

    if (row.value !== null && row.value !== undefined) {
      record.value = row.value;
      // Accumulate numeric totals for currency fields
      if (row.value_type === 'currency') {
        const num = parseFloat(row.value.replace(/[^0-9.-]/g, ''));
        if (!isNaN(num)) {
          grouped[cat].category_total += num;
          grandTotal += num;
        }
      }
    }
    if (row.secondary_value !== null && row.secondary_value !== undefined) {
      record.secondary_value = row.secondary_value;
    }

    grouped[cat].records.push(record);
  }

  return {
    found:         true,
    total_records: rows.length,
    grand_total:   grandTotal > 0 ? grandTotal : null,
    categories:    grouped,
  };
}

module.exports = { name, defaultDescription, inputSchema, handler, category: 'data_access' };
