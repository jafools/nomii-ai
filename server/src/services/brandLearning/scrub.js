/**
 * SHENMAY AI — Brand Learning · PII Scrub
 *
 * Pre-distillation PII pass for the anonymous-visitor brand-learning worker.
 *
 * Wraps the existing `piiTokenizer.Tokenizer` (which already strips email,
 * phone, SSN, CC, IBAN, postcode, account-#, DOB via regex detectors) with
 * brand-context-specific defaults:
 *
 *   - No `memoryFile` / `soulFile` name hints. Brand learning operates over
 *     an unbounded population of anonymous strangers; we have no per-visitor
 *     name list to pseudonymize, so we lean entirely on regex + LLM prompt.
 *
 *   - Reduces a conversation transcript to a tokenized digest the LLM
 *     distiller can safely read. Returns the tokenized text + the count of
 *     replacements made (telemetry — high-replacement conversations are
 *     suspicious and worth flagging).
 *
 * This module is the *first* of six PII layers (see scope §5). The
 * `auditOutbound` step in the worker is the LAST — it re-scans the
 * already-scrubbed-and-distilled output and aborts the DB write if any
 * residual pattern made it through.
 */

'use strict';

const { Tokenizer } = require('../piiTokenizer');

/**
 * Scrub an array of {role, content} messages to a tokenized form safe to
 * feed into the brand-learning distillation LLM call.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {{ scrubbedText: string, replacementCount: number }}
 *   `scrubbedText` is a single newline-delimited transcript with PII
 *   replaced by tokens (`[EMAIL_1]`, `[PHONE_2]`, ...).
 *   `replacementCount` is the number of distinct PII matches across the
 *   whole transcript — useful for telemetry and for promoting suspicious
 *   conversations into the audit log.
 */
function scrubMessagesForDistillation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { scrubbedText: '', replacementCount: 0 };
  }

  // No memoryFile / soulFile — see module header for rationale.
  const tokenizer = new Tokenizer({});

  // Build one transcript so the same TokenMap is reused across all
  // messages — keeps the same email/phone consistently tokenized to the
  // same placeholder across the conversation.
  const lines = [];
  let map = null;

  for (const msg of messages) {
    if (!msg || typeof msg.content !== 'string') continue;
    if (!msg.content.trim()) continue;

    const role = msg.role === 'customer' ? 'visitor' : (msg.role || 'agent');
    const tok = tokenizer.tokenize(msg.content, map);
    map = tok.map;
    lines.push(`${role}: ${tok.text}`);
  }

  const scrubbedText = lines.join('\n');
  const stats = map && typeof map.stats === 'function' ? map.stats() : { totalTokens: 0, byType: {} };

  return {
    scrubbedText,
    replacementCount: stats.totalTokens || 0,
    replacementsByType: stats.byType || {},
  };
}

/**
 * Quick lightweight check: does the given string LOOK like it contains
 * unscrubbed PII? Used after distillation as a belt-and-braces guard
 * BEFORE handing the result to the worker's auditOutbound() pass.
 *
 * Returns array of finding types; empty array means clean.
 *
 * Implementation: just runs the same Tokenizer on the candidate text. If
 * any regex detector fires, the text contained PII the LLM didn't strip.
 */
function quickScanForResidualPii(text) {
  if (!text || typeof text !== 'string') return [];
  const tokenizer = new Tokenizer({});
  const before = text;
  const { text: after, map } = tokenizer.tokenize(before);
  if (after === before) return [];

  // Surface the kinds of PII detected, not the values themselves.
  const stats = (map && typeof map.stats === 'function') ? map.stats() : { byType: {} };
  const types = Object.keys(stats.byType || {});
  return types.length > 0 ? types : ['UNKNOWN'];
}

module.exports = {
  scrubMessagesForDistillation,
  quickScanForResidualPii,
};
