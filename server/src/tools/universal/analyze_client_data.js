/**
 * TOOL: analyze_client_data
 *
 * Universal tool — works across any industry.
 * Computes aggregate summaries from the client's customer_data records:
 * totals per category, monthly figures, data gaps, record counts.
 *
 * Returns structured numbers Claude can reason over directly —
 * so Claude doesn't have to do arithmetic from a text prompt.
 *
 * For a financial firm:  total retirement assets, monthly income vs expenses
 * For a lumber company:  total board-feet on order, spend by project
 * For healthcare:        active conditions count, medication total costs
 */

const name = 'analyze_client_data';

const defaultDescription =
  'Computes aggregate summaries of this client\'s structured records — ' +
  'totals, monthly figures, category breakdowns, and data completeness. ' +
  'Use before giving any data-driven guidance so you have accurate figures ' +
  'rather than estimating from memory.';

const inputSchema = {
  type: 'object',
  properties: {
    focus_category: {
      type: 'string',
      description:
        'Optional. Return detailed records only for this category in addition ' +
        'to the overall summary.',
    },
    include_details: {
      type: 'boolean',
      description:
        'If true, include every individual record in the response. ' +
        'Default false (summary only).',
    },
  },
  required: [],
};

async function handler({ focus_category, include_details = false } = {}, { db, customerId }) {
  const { rows } = await db.query(
    `SELECT category, value_type, label, metadata,
            value, secondary_value, recorded_at
     FROM customer_data
     WHERE customer_id = $1
     ORDER BY category, label`,
    [customerId]
  );

  if (rows.length === 0) {
    return {
      has_data: false,
      message: 'No structured records are on file for this client.',
    };
  }

  const categories = [...new Set(rows.map(r => r.category))];

  // Build per-category aggregates
  const totals_by_category    = {};
  const monthly_by_category   = {};
  const record_count_by_cat   = {};
  const all_records_by_cat    = {};

  for (const row of rows) {
    const cat = row.category;

    if (!totals_by_category[cat])  totals_by_category[cat]  = 0;
    if (!monthly_by_category[cat]) monthly_by_category[cat] = 0;
    if (!record_count_by_cat[cat]) record_count_by_cat[cat] = 0;
    if (!all_records_by_cat[cat])  all_records_by_cat[cat]  = [];

    record_count_by_cat[cat]++;

    // value and secondary_value are TEXT in the new schema — parse to number
    const numVal     = row.value           != null ? parseFloat(String(row.value).replace(/[^0-9.-]/g, ''))           : null;
    const numMonthly = row.secondary_value != null ? parseFloat(String(row.secondary_value).replace(/[^0-9.-]/g, '')) : null;

    if (numVal !== null && !isNaN(numVal)) {
      totals_by_category[cat] += numVal;
    }
    if (numMonthly !== null && !isNaN(numMonthly)) {
      monthly_by_category[cat] += numMonthly;
    }

    if (include_details || cat === focus_category) {
      all_records_by_cat[cat].push({
        label:    row.label,
        type:     row.value_type || null,
        value:    numVal !== null && !isNaN(numVal)     ? numVal     : null,
        monthly:  numMonthly !== null && !isNaN(numMonthly) ? numMonthly : null,
        metadata: row.metadata && Object.keys(row.metadata).length ? row.metadata : null,
      });
    }
  }

  const grand_total = Object.values(totals_by_category).reduce((a, b) => a + b, 0);
  const grand_monthly = Object.values(monthly_by_category).reduce((a, b) => a + b, 0);

  const result = {
    has_data:            true,
    total_records:       rows.length,
    categories_present:  categories,
    grand_total:         grand_total > 0    ? grand_total    : null,
    grand_monthly_total: grand_monthly > 0  ? grand_monthly  : null,
    totals_by_category,
    monthly_by_category,
    record_count_by_category: record_count_by_cat,
  };

  // Attach focused records if requested
  if (focus_category) {
    result.focused_category = focus_category;
    result.focused_records  = all_records_by_cat[focus_category] || [];
    result.focused_total    = totals_by_category[focus_category] || 0;
  }

  if (include_details) {
    result.all_records = all_records_by_cat;
  }

  return result;
}

module.exports = { name, defaultDescription, inputSchema, handler, category: 'data_analysis' };
