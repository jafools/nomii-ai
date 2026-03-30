/**
 * NOMII AI — Prompt Builder Engine
 * 
 * Assembles the system prompt that gives the agent its identity and knowledge.
 * This is the core of Nomii: before every conversation, the agent reads its
 * Soul (who it is), Memory (what it knows), and Financial Context (the data).
 * 
 * Usage:
 *   const prompt = buildSystemPrompt({ tenant, customer, financialAccounts });
 *   // Pass this as the system message to Claude/OpenAI/etc.
 */

// ============================================================
// MAIN PROMPT BUILDER
// ============================================================

function buildSystemPrompt({ tenant, customer, financialAccounts, currentDate }) {
  const date = currentDate || new Date().toISOString().split('T')[0];
  const soul = customer.soul_file;
  const memory = customer.memory_file;

  return `${buildIdentityBlock(soul, tenant)}

${buildComplianceBlock(tenant)}

${buildCommunicationBlock(soul)}

${buildMemoryBlock(memory)}

${buildFinancialBlock(memory, financialAccounts)}

${buildLifePlanBlock(memory)}

${buildConversationHistoryBlock(memory)}

${buildAgentNotesBlock(memory)}

${buildSessionRulesBlock(customer, date)}`;
}


// ============================================================
// PROMPT SECTIONS
// ============================================================

function buildIdentityBlock(soul, tenant) {
  const identity = soul.base_identity || {};
  return `## YOUR IDENTITY

You are "${identity.agent_name || tenant.agent_name}", a retirement planning assistant for ${identity.organization || tenant.name}.

Your role: ${identity.role || 'Retirement planning assistant providing educational and informational guidance.'}

You are NOT a generic chatbot. You are a persistent, personalized agent for this specific customer. You remember everything about them. You pick up where you left off. You know their fears, their dreams, their family, their financial situation. Every interaction should feel like talking to an advisor who truly knows them.

CRITICAL: You provide EDUCATIONAL and INFORMATIONAL guidance only. You do not give specific financial advice, tax advice, legal counsel, or product recommendations. Frame everything as "here's what many people consider" or "one approach worth exploring is" — never "you should" or "I recommend."`;
}


function buildComplianceBlock(tenant) {
  const config = tenant.compliance_config || {};
  const disclaimers = (config.disclaimers || []).map(d => `- ${d}`).join('\n');
  const restricted = (config.restricted_topics || []).map(t => `- ${t}`).join('\n');
  const escalation = (config.escalation_triggers || []).map(t => `- ${t}`).join('\n');

  return `## COMPLIANCE RULES (NON-NEGOTIABLE)

Required disclaimers (include naturally when giving educational information):
${disclaimers}

Topics you CANNOT provide guidance on (refer to human advisor):
${restricted}

Automatic escalation triggers (flag for human advisor review):
${escalation}`;
}


function buildCommunicationBlock(soul) {
  const comm = soul.communication_profile || {};
  const rules = (soul.behavioral_rules?.personality_rules || []).map(r => `- ${r}`).join('\n');

  return `## HOW TO COMMUNICATE WITH THIS CUSTOMER

Tone: ${comm.tone || 'warm & reassuring'}
Complexity Level: ${comm.complexity_level || 3}/5
Pace: ${comm.pace || 'moderate'}
Emotional Awareness: ${comm.emotional_awareness || 'high'}
Language: ${comm.language || 'plain English'}

${comm.notes ? `Special notes: ${comm.notes}` : ''}

Communication rules:
${rules}

Framing approach: ${soul.behavioral_rules?.framing || 'Always frame advice as educational, never prescriptive.'}`;
}


function buildMemoryBlock(memory) {
  const profile = memory.personal_profile || {};
  const family = profile.family || {};

  let familyText = '';
  if (family.marital_status) {
    familyText += `Marital Status: ${family.marital_status}\n`;
  }
  if (family.spouse) {
    familyText += `Spouse: ${family.spouse.name} (age ${family.spouse.age})${family.spouse.health_notes ? ` — ${family.spouse.health_notes}` : ''}\n`;
  }
  if (family.late_spouse) {
    familyText += `Late Spouse: ${family.late_spouse.name} (passed ${family.late_spouse.passed})${family.late_spouse.notes ? ` — ${family.late_spouse.notes}` : ''}\n`;
  }
  if (family.children) {
    familyText += `Children:\n${family.children.map(c => 
      `  - ${c.name} (age ${c.age}), ${c.location}${c.children ? ` — grandchildren: ${c.children.join(', ')}` : ''}${c.notes ? ` — ${c.notes}` : ''}`
    ).join('\n')}\n`;
  }

  return `## WHO THIS CUSTOMER IS

Name: ${profile.name || 'Unknown'}
Age: ${profile.age || 'Unknown'}
Location: ${profile.location || 'Unknown'}
Career: ${profile.career || 'Not specified'}
Tech Comfort: ${profile.tech_comfort || 'moderate'}
Communication Preference: ${profile.communication_preference || 'Not specified'}

Family:
${familyText}`;
}


function buildFinancialBlock(memory, financialAccounts) {
  const snapshot = memory.financial_snapshot || {};
  
  let accountsText = '';
  if (financialAccounts && financialAccounts.length > 0) {
    accountsText = financialAccounts.map(acct => {
      let line = `- ${acct.account_name} (${acct.account_type})`;
      if (acct.balance) line += `: $${Number(acct.balance).toLocaleString()}`;
      if (acct.monthly_income) line += `: $${Number(acct.monthly_income).toLocaleString()}/month`;
      if (acct.institution) line += ` at ${acct.institution}`;
      return line;
    }).join('\n');
  }

  return `## FINANCIAL PICTURE (Last Updated: ${snapshot.last_updated || 'Unknown'})

Total Estimated Assets: $${(snapshot.total_estimated_assets || 0).toLocaleString()}
Monthly Income: $${(snapshot.monthly_income || 0).toLocaleString()}
Monthly Expenses: $${(snapshot.monthly_expenses || 0).toLocaleString()}
${snapshot.income_gap_notes ? `Note: ${snapshot.income_gap_notes}` : ''}
${snapshot.surplus_notes ? `Note: ${snapshot.surplus_notes}` : ''}

Accounts:
${accountsText}

Debts: ${typeof snapshot.debts === 'string' ? snapshot.debts : `$${(snapshot.debts?.total || 0).toLocaleString()}`}

IMPORTANT: You know these numbers. Reference them naturally in conversation — don't ask the customer to re-state what you already know. But always verify if something may have changed: "Last time we talked, your 401(k) was around $485,000 — has anything changed?"`;
}


function buildLifePlanBlock(memory) {
  const plan = memory.life_plan || {};
  
  let sections = [];
  
  if (plan.travel) {
    sections.push(`### Travel
Dreams: ${plan.travel.dreams || 'Not discussed'}
Budget: $${(plan.travel.budget_target || 0).toLocaleString()}/year
Timeline: ${plan.travel.timeline || 'Not specified'}
${plan.travel.specifics ? `Details: ${plan.travel.specifics}` : ''}`);
  }

  if (plan.healthcare) {
    sections.push(`### Healthcare
Coverage: ${plan.healthcare.current_coverage || 'Not specified'}
Concerns: ${(plan.healthcare.concerns || []).join(', ')}
LTC Insurance: ${plan.healthcare.ltc_insurance || 'Not discussed'}`);
  }

  if (plan.housing) {
    sections.push(`### Housing
Plan: ${plan.housing.current_plan || 'Not discussed'}
${plan.housing.future_considerations ? `Future: ${plan.housing.future_considerations}` : ''}`);
  }

  if (plan.legacy) {
    sections.push(`### Legacy & Family
${Object.entries(plan.legacy).map(([key, val]) => `${key}: ${val}`).join('\n')}`);
  }

  if (plan.hobbies) {
    const activities = Array.isArray(plan.hobbies.activities) 
      ? plan.hobbies.activities.join(', ')
      : typeof plan.hobbies === 'object' 
        ? Object.entries(plan.hobbies).filter(([k]) => k !== 'budget' && k !== 'notes').map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
        : 'Not discussed';
    sections.push(`### Hobbies & Lifestyle
Activities: ${activities}
Budget: $${(plan.hobbies.budget || 0).toLocaleString()}/month`);
  }

  return `## LIFE PLAN — What Matters to This Customer

${sections.join('\n\n')}

IMPORTANT: Reference their life plan naturally. If they're worried about healthcare costs, connect it to what you know about their coverage and concerns. If they mention travel, you already know their dreams. This is what makes you different from a generic chatbot.`;
}


function buildConversationHistoryBlock(memory) {
  const history = memory.conversation_history || [];
  
  if (history.length === 0) {
    return `## CONVERSATION HISTORY\n\nThis is your first conversation with this customer. Focus on making them comfortable and beginning the onboarding interview.`;
  }

  const summaries = history.map(session => {
    let text = `### Session ${session.session} — ${session.date} (${session.type})
${session.summary}`;
    if (session.flags && session.flags.length > 0) {
      text += `\nFlags: ${session.flags.map(f => `[${f.type}] ${f.description}`).join('; ')}`;
    }
    return text;
  }).join('\n\n');

  return `## CONVERSATION HISTORY (${history.length} previous sessions)

${summaries}

IMPORTANT: You remember all of this. Reference previous conversations naturally: "Last time we talked about your 401(k) withdrawal options..." Never ask the customer to repeat something you already know.`;
}


function buildAgentNotesBlock(memory) {
  const notes = memory.agent_notes || [];
  
  if (notes.length === 0) return '';

  return `## YOUR PERSONAL NOTES ABOUT THIS CUSTOMER

${notes.map(n => `- ${n}`).join('\n')}

These are observations you've made. Use them to communicate more effectively.`;
}


function buildSessionRulesBlock(customer, date) {
  const isOnboarding = customer.onboarding_status !== 'complete';
  const completedCategories = customer.onboarding_categories_completed || [];
  
  const allCategories = [
    'personal_background', 'financial_overview', 'retirement_dreams',
    'travel', 'healthcare', 'housing', 'legacy', 'hobbies',
    'risk_tolerance', 'communication_preferences'
  ];
  const remaining = allCategories.filter(c => !completedCategories.includes(c));

  let onboardingInstructions = '';
  if (isOnboarding && remaining.length > 0) {
    onboardingInstructions = `
## ONBOARDING — CATEGORIES STILL TO COVER

This customer's onboarding is not complete. You still need to cover:
${remaining.map(c => `- ${c.replace(/_/g, ' ')}`).join('\n')}

Already covered: ${completedCategories.map(c => c.replace(/_/g, ' ')).join(', ')}

APPROACH: Cover these naturally through conversation. Do NOT present them as a checklist. Ask open-ended questions that flow from one topic to the next. If the customer wants to end early, that's fine — pick up remaining topics next time.`;
  }

  return `## SESSION RULES

Today's date: ${date}
Session type: ${isOnboarding ? 'Onboarding (in progress)' : 'Regular conversation'}

${onboardingInstructions}

End-of-session behavior:
- When the customer indicates they're done, summarize key points discussed
- Note any action items or follow-ups
- If any flags were triggered during the session, they will be automatically reviewed by the human advisor

Remember: You are this customer's persistent advisor. Be warm, be knowledgeable, be helpful. Make every interaction feel like picking up a conversation with someone who truly knows them.`;
}


// ============================================================
// MOCK LLM RESPONSE (for development before API key)
// ============================================================

function generateMockResponse(customerName, messageContent) {
  const lowerMsg = messageContent.toLowerCase();

  // Context-aware mock responses
  if (lowerMsg.includes('hello') || lowerMsg.includes('hi') || lowerMsg.includes('hey')) {
    return `Welcome back, ${customerName.split(' ')[0]}! It's great to hear from you. How have things been since we last spoke? Is there anything specific on your mind today, or shall we pick up where we left off?`;
  }
  
  if (lowerMsg.includes('withdraw') || lowerMsg.includes('take out') || lowerMsg.includes('need money')) {
    return `I understand you're thinking about accessing some of your savings. Before we explore the options, can you tell me a bit about what you're planning to use the funds for and roughly how much you're considering? That will help me walk you through the different approaches and what to keep in mind with each one.\n\n*Note: This is educational information. For specific withdrawal decisions, I'd recommend discussing the details with your advisor.*`;
  }

  if (lowerMsg.includes('worried') || lowerMsg.includes('scared') || lowerMsg.includes('anxious') || lowerMsg.includes('concern')) {
    return `I hear you, and those feelings are completely valid. Many people in retirement have similar concerns. Let's talk through what's on your mind — sometimes just laying it out and looking at the numbers together can help things feel more manageable. What's weighing on you the most right now?`;
  }

  if (lowerMsg.includes('travel') || lowerMsg.includes('trip') || lowerMsg.includes('vacation')) {
    return `I love that you're thinking about travel! Based on what we've discussed about your goals, this is clearly important to you. Let's think through it together — what kind of trip are you considering, and would you like to talk through how it fits into your overall budget?`;
  }

  if (lowerMsg.includes('advisor') || lowerMsg.includes('human') || lowerMsg.includes('speak to someone')) {
    return `Absolutely — I'll connect you with your advisor right away. They'll be able to help with more specific guidance on this. Is there anything you'd like me to pass along to them so they have context when they reach out?`;
  }

  // Default thoughtful response
  return `That's a great question, ${customerName.split(' ')[0]}. Let me think through this with you. Based on what I know about your situation, here are some things to consider...\n\nCould you tell me a bit more about what prompted this? That will help me give you more relevant information.\n\n*As always, for specific financial decisions, your advisor is available to discuss the details with you.*`;
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  buildSystemPrompt,
  generateMockResponse,
  // Export individual builders for testing
  buildIdentityBlock,
  buildComplianceBlock,
  buildCommunicationBlock,
  buildMemoryBlock,
  buildFinancialBlock,
  buildLifePlanBlock,
  buildConversationHistoryBlock,
  buildAgentNotesBlock,
  buildSessionRulesBlock
};
