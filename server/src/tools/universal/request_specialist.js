/**
 * TOOL: request_specialist
 *
 * Universal tool — works across any industry.
 * Creates a flag in the database so a human specialist is notified
 * that this client needs personal attention. The conversation is
 * optionally escalated depending on urgency.
 *
 * For a financial firm:  advisor review, investment question, tax concern
 * For a lumber company:  custom order specialist, project consultant
 * For healthcare:        care coordinator, physician follow-up
 *
 * The tool description in tool_configs is what makes it feel
 * native to each industry — the underlying flag/escalation logic
 * is identical everywhere.
 */

const name = 'request_specialist';

const defaultDescription =
  'Notifies a human specialist that this client needs personal attention. ' +
  'Use when the client asks a question beyond the scope of educational guidance, ' +
  'explicitly requests to speak with a person, or when their situation clearly ' +
  'requires professional judgement. Always use this rather than making up answers ' +
  'to questions that require a qualified human.';

const inputSchema = {
  type: 'object',
  properties: {
    reason: {
      type: 'string',
      description:
        'Clear, specific reason why a specialist is needed. ' +
        'This is shown directly to the human specialist, so be concise and factual.',
    },
    urgency: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description:
        'low    = general follow-up, no time pressure\n' +
        'medium = should be addressed within 1-2 business days\n' +
        'high   = client has an urgent or time-sensitive need',
    },
    context_summary: {
      type: 'string',
      description:
        'Optional. 1-3 sentence summary of what was discussed in this session ' +
        'that the specialist should know before reaching out.',
    },
  },
  required: ['reason', 'urgency'],
};

async function handler(
  { reason, urgency, context_summary },
  { db, customerId, conversationId }
) {
  const severityMap = { low: 'low', medium: 'medium', high: 'high' };
  const severity = severityMap[urgency] || 'medium';

  const fullDescription = context_summary
    ? `${reason}\n\nSession context: ${context_summary}`
    : reason;

  // Insert flag for dashboard notification
  await db.query(
    `INSERT INTO flags
       (customer_id, conversation_id, flag_type, severity, description, status)
     VALUES ($1, $2, 'advisor_requested', $3, $4, 'open')`,
    [customerId, conversationId, severity, fullDescription]
  );

  // Escalate conversation if high urgency so dashboard badge turns red
  if (urgency === 'high') {
    await db.query(
      `UPDATE conversations SET status = 'escalated' WHERE id = $1`,
      [conversationId]
    );
  }

  const clientMessages = {
    low:    "I've let our team know you'd like to connect. Someone will be in touch soon.",
    medium: "I've flagged this for our team and they'll follow up with you within 1-2 business days.",
    high:   "I've flagged this as urgent. Our team will be in touch as soon as possible.",
  };

  return {
    success:          true,
    urgency,
    flag_created:     true,
    escalated:        urgency === 'high',
    client_message:   clientMessages[urgency] || clientMessages.medium,
    specialist_notified: true,
  };
}

module.exports = { name, defaultDescription, inputSchema, handler, category: 'escalation' };
