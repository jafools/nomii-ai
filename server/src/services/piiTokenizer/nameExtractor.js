/**
 * Name Extractor — harvests known person names from structured memory data
 * so we can pseudonymize them in the system prompt without NLP.
 *
 * Rationale: Claude's agent persona needs to know who "Diana" is, but
 * Anthropic's servers don't need her real name. By extracting names from
 * the structured `memory_file` and `soul_file`, we build a deterministic
 * map of real names to pseudonyms (`Diana` → `[PERSON_1]`), which we then
 * apply to the full prompt via literal string replacement.
 *
 * This is more reliable than regex-based name detection because we know
 * with certainty that these fields contain names.
 */

'use strict';

/**
 * Extract all person names from a memory_file + soul_file pair.
 * Returns an array of { original, type } entries, sorted by length
 * descending so longer names (e.g. "Diana Smith") are replaced before
 * shorter substrings (e.g. "Diana").
 *
 * @param {object} memoryFile  — decrypted memory blob
 * @param {object} soulFile    — decrypted soul blob
 * @returns {Array<{original: string, type: string}>}
 */
function extractNames(memoryFile = {}, soulFile = {}) {
  const names = new Set();

  // Customer primary name
  const profile = memoryFile.personal_profile || {};
  if (profile.name) names.add(['CLIENT', profile.name]);

  // Soul file's customer given name (legacy + new schema)
  const baseIdentity = (soulFile && soulFile.base_identity) || {};
  if (baseIdentity.customer_full_name) names.add(['CLIENT', baseIdentity.customer_full_name]);

  // Family members
  const family = profile.family || {};
  if (family.spouse && family.spouse.name) names.add(['SPOUSE', family.spouse.name]);
  if (family.late_spouse && family.late_spouse.name) names.add(['LATE_SPOUSE', family.late_spouse.name]);

  if (Array.isArray(family.children)) {
    for (const child of family.children) {
      if (child && child.name) names.add(['CHILD', child.name]);
      if (Array.isArray(child && child.children)) {
        for (const grand of child.children) {
          if (typeof grand === 'string') names.add(['GRANDCHILD', grand]);
          else if (grand && grand.name) names.add(['GRANDCHILD', grand.name]);
        }
      }
    }
  }

  if (Array.isArray(family.siblings)) {
    for (const sib of family.siblings) {
      if (sib && sib.name) names.add(['SIBLING', sib.name]);
    }
  }

  if (Array.isArray(family.parents)) {
    for (const p of family.parents) {
      if (p && p.name) names.add(['PARENT', p.name]);
    }
  }

  // Convert to array, split multi-token names into individual-name entries
  // so replacements match both the full name and the first-name-only usage
  // (e.g. "Diana Smith" and "Diana" should both tokenize consistently).
  const entries = [];
  for (const entry of names) {
    const [type, fullName] = entry;
    const trimmed = String(fullName).trim();
    if (!trimmed || trimmed.length < 2) continue;

    entries.push({ original: trimmed, type });

    // Also add first-name-only version if it's a multi-word name
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1 && parts[0].length >= 2) {
      entries.push({ original: parts[0], type });
    }
  }

  // Sort by length descending to avoid substring collisions.
  entries.sort((a, b) => b.original.length - a.original.length);

  // De-dupe same-original entries — keep the first (which is the longer-context one).
  const seen = new Set();
  const deduped = [];
  for (const e of entries) {
    if (seen.has(e.original)) continue;
    seen.add(e.original);
    deduped.push(e);
  }

  return deduped;
}

module.exports = { extractNames };
