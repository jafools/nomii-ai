/**
 * TOOL: generate_report
 *
 * Universal tool — works across any industry.
 * Assembles a structured report object from the agent's current analysis.
 * The report can be rendered, displayed, or queued for email delivery.
 *
 * For a financial firm:  account summary, withdrawal plan, retirement projection
 * For a lumber company:  order summary, material estimate, project spec sheet
 * For healthcare:        care plan summary, medication review, intake summary
 *
 * NOTE: This version returns the report as structured data.
 * Email delivery is handled by the send_document tool (coming next sprint).
 */

const name = 'generate_report';

const defaultDescription =
  'Generates a structured summary report based on the current conversation ' +
  'and the client\'s data on file. Use when the client asks for something in ' +
  'writing, wants a summary they can share with someone, or when a clear ' +
  'formatted overview would be more useful than a chat message.';

const inputSchema = {
  type: 'object',
  properties: {
    report_type: {
      type: 'string',
      description:
        'The type or title of the report. Be specific and industry-appropriate ' +
        '(e.g. "Account Summary", "Withdrawal Sequencing Overview", ' +
        '"Project Material Estimate", "Intake Summary").',
    },
    executive_summary: {
      type: 'string',
      description:
        '2-4 sentence plain-English summary of the key findings or takeaways ' +
        'from this session. This appears at the top of the report.',
    },
    sections: {
      type: 'array',
      description:
        'The body sections of the report. Each section has a title and content.',
      items: {
        type: 'object',
        properties: {
          title:   { type: 'string', description: 'Section heading.' },
          content: { type: 'string', description: 'Section body text.' },
        },
        required: ['title', 'content'],
      },
    },
    next_steps: {
      type: 'array',
      description:
        'Optional list of recommended next steps or action items for the client ' +
        'or their advisor.',
      items: { type: 'string' },
    },
    disclaimer: {
      type: 'string',
      description:
        'Optional custom disclaimer to append. If omitted, a standard ' +
        'informational disclaimer is added automatically.',
    },
  },
  required: ['report_type', 'executive_summary', 'sections'],
};

async function handler(
  { report_type, executive_summary, sections, next_steps, disclaimer },
  { db, customerId, customer }
) {
  const customerName = `${customer.first_name} ${customer.last_name}`.trim();
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Fetch a quick data snapshot for the report footer
  const { rows: dataRows } = await db.query(
    `SELECT category, COUNT(*) as count
     FROM customer_data
     WHERE customer_id = $1
     GROUP BY category
     ORDER BY category`,
    [customerId]
  );

  const dataSourcesNote =
    dataRows.length > 0
      ? `Based on ${dataRows.reduce((s, r) => s + parseInt(r.count), 0)} data records across: ` +
        dataRows.map(r => r.category.replace(/_/g, ' ')).join(', ') + '.'
      : 'Based on information shared during conversation.';

  const report = {
    title:             report_type,
    prepared_for:      customerName,
    prepared_on:       today,
    executive_summary,
    sections:          sections || [],
    next_steps:        next_steps && next_steps.length > 0 ? next_steps : null,
    data_sources_note: dataSourcesNote,
    disclaimer:
      disclaimer ||
      'This report is for informational and educational purposes only. ' +
      'It does not constitute professional advice. Please consult a qualified ' +
      'professional before making any decisions based on this information.',
  };

  // Store a lightweight record that a report was generated this session
  // (uses the details JSONB field on a synthetic customer_data record so
  //  advisors can see it in the dashboard without a new table)
  try {
    await db.query(
      `INSERT INTO customer_data
         (customer_id, category, label, value, value_type, metadata, source)
       VALUES ($1, 'generated_reports', $2, $3, 'text', $4::jsonb, 'portal')
       ON CONFLICT (customer_id, category, label) DO UPDATE SET
         value      = EXCLUDED.value,
         metadata   = EXCLUDED.metadata,
         recorded_at = NOW()`,
      [
        customerId,
        report_type,
        today,
        JSON.stringify({ generated_on: today, section_count: sections.length }),
      ]
    );
  } catch (_) {
    // Non-fatal: report still returns even if logging fails
  }

  return {
    success: true,
    report,
    message:
      `Report "${report_type}" has been prepared for ${customerName}. ` +
      'I can describe the key findings now, or it can be sent to the email address on file.',
  };
}

module.exports = { name, defaultDescription, inputSchema, handler, category: 'document_generation' };
