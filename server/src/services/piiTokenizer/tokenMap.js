/**
 * TokenMap — bidirectional mapping between original values and opaque tokens,
 * scoped to a single tokenization pass (i.e. one Claude API call).
 *
 * Guarantees:
 *   - Deterministic: same input → same token (within one map instance)
 *   - Reversible: every token has a unique original value
 *   - Type-prefixed: tokens carry a type hint (`[SSN_1]`, `[EMAIL_2]`, etc.)
 *     so Claude can reason about them (e.g. "the SSN ends in 3456" still
 *     works when Claude only sees `[SSN_1]`).
 *   - Never persisted: lives for one API round-trip then is discarded.
 */

'use strict';

class TokenMap {
  constructor() {
    // Forward:  originalValue → token
    this._forward = new Map();
    // Reverse:  token → originalValue
    this._reverse = new Map();
    // Per-type counters for numbering (SSN_1, SSN_2, ...)
    this._counters = new Map();
  }

  /**
   * Look up or allocate a token for a given original value + type.
   * Returns the token string (e.g. `[SSN_1]`).
   */
  tokenFor(original, type) {
    const key = `${type}::${original}`;
    if (this._forward.has(key)) {
      return this._forward.get(key);
    }

    const n = (this._counters.get(type) || 0) + 1;
    this._counters.set(type, n);

    const token = `[${type}_${n}]`;
    this._forward.set(key, token);
    this._reverse.set(token, original);
    return token;
  }

  /**
   * Look up the original value for a token. Returns undefined if not found
   * (e.g. Claude hallucinated a token we never issued — caller should
   * leave it as-is rather than throwing).
   */
  originalFor(token) {
    return this._reverse.get(token);
  }

  /**
   * Apply reverse mapping to a text blob. Replaces every `[TYPE_N]` token
   * that exists in this map; leaves unknown tokens untouched.
   */
  detokenize(text) {
    if (!text) return text;
    // Match any `[A-Z]+_\d+` token and try to swap it back.
    return text.replace(/\[([A-Z]+)_(\d+)\]/g, (match) => {
      const original = this._reverse.get(match);
      return original !== undefined ? original : match;
    });
  }

  /**
   * Debug / audit helper — returns a shallow copy of the mappings for
   * inclusion in structured logs. Never log the forward map in production
   * without scrubbing: it contains the raw PII.
   */
  stats() {
    const byType = {};
    for (const [key] of this._forward.entries()) {
      const type = key.split('::')[0];
      byType[type] = (byType[type] || 0) + 1;
    }
    return { totalTokens: this._forward.size, byType };
  }

  /**
   * Returns the reverse map as an array of [token, originalValue] pairs.
   * Used by tests and breach detector.
   */
  entries() {
    return Array.from(this._reverse.entries());
  }

  size() {
    return this._forward.size;
  }
}

module.exports = { TokenMap };
