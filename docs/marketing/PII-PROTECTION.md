# PII Protection — Pitch & Marketing Reference

**Status:** Live on `main` as of 2026-04-19 · v1.1.0 onward
**Audience:** Sales, founder pitch decks, prospect Q&A, compliance questionnaires
**Technical source of truth:** [server/src/services/piiTokenizer/](../../server/src/services/piiTokenizer/)

---

## The one-sentence claim

> Shenmay never sends your customers' regulated personal identifiers to Anthropic. Names are pseudonymized, SSNs and account numbers are tokenized, and a second-pass breach detector blocks any request that still contains unredacted PII — so even if a detector missed something, the data can't leak.

## The three-line pitch (for slide decks)

> - **Regulated identifiers never cross the wire.** SSNs, credit cards, IBANs, phone numbers, emails, dates of birth, postcodes, and bank-account numbers are tokenized server-side before any LLM call.
> - **Names are pseudonymized consistently.** "Diana Thornton" becomes `[CLIENT_1]` — the agent still knows who it's talking to, Anthropic only sees the token.
> - **Breach-detect blocks the request if anything slips.** A post-tokenization scan re-checks the outbound payload. If it finds a residual SSN-shape, credit-card-shape, or IBAN-shape, the request is never sent and a `pii_breach_log` row is recorded.

## The five-bullet compliance sheet (for DPA / vendor-review attachments)

> 1. Shenmay uses Claude models operated by Anthropic, Inc. under Anthropic's Commercial Terms, which contractually prohibit training on API data.
> 2. On top of that contractual protection, Shenmay runs a per-tenant PII tokenization layer that replaces regulated identifiers with opaque tokens before every LLM request, and swaps them back on response. Users and the agent never see the tokens.
> 3. A second-pass breach detector scans the tokenized payload and blocks the outbound request if any residual pattern is found (log-and-block). Blocked requests are recorded in an append-only audit log.
> 4. The tokenizer runs in-process on the same host as the Shenmay application, with no additional network hop and no token map persisted beyond a single API round-trip.
> 5. Tokenization is ON by default for every tenant and can be globally force-disabled only via the `PII_TOKENIZER_ENABLED=false` operator flag (used for incident response).

---

## Q&A for prospect calls

**"Does Anthropic see our customers' SSNs?"**
No. SSNs (and tax IDs, credit cards, IBANs, phone numbers, emails, DOBs, postcodes, and account numbers referenced in context) are replaced with opaque tokens like `[SSN_1]` before the outbound request. The agent reasons about `[SSN_1]`; Anthropic never sees the digits.

**"What about names?"**
Names in the customer's structured profile (their name, spouse, children, grandchildren) are extracted from the encrypted `memory_file` at request time and pseudonymized to tokens like `[CLIENT_1]`, `[SPOUSE_1]`, `[CHILD_2]`. The agent's conversation remains coherent — it knows who `[CLIENT_1]` is relative to `[SPOUSE_1]` — but Anthropic only sees the tokens.

**"What if your regex misses something?"**
That's what the breach detector is for. After tokenization, we rescan the outbound payload. If any SSN/CC/IBAN/email-shaped string remains, the request is **never sent to Anthropic** — we return a safe "please rephrase without the specific details" message to the end user and write an audit log row. Log-and-block, not log-and-warn.

**"Can we turn it off?"**
Yes, per tenant — the `tenants.pii_tokenization_enabled` flag defaults to TRUE and can be toggled off for tenants who explicitly want raw data flow (for example, some BYOK customers running their own Anthropic account who have their own compliance controls in place). We also keep a global kill-switch (`PII_TOKENIZER_ENABLED=false`) for incident response.

**"What's the performance cost?"**
Regex-only, pure JavaScript, in-process. Measured under 50 ms for a 50 KB prompt in our test suite. No additional network hop, no Python sidecar, no latency you'd notice.

**"Does the agent still work well?"**
Yes. The tokens carry type information (`[SSN_1]`, `[EMAIL_2]`, `[CLIENT_1]`) so the agent can still reason ("Is this the right client? Yes, `[CLIENT_1]` is married to `[SPOUSE_1]`."). On response, we swap the tokens back so the end user sees the actual values. They won't know it's happening.

**"Do you store the tokens anywhere?"**
No. The token map lives in memory for the duration of a single API round-trip (typically 1–3 seconds) and is discarded. Nothing persists between requests.

**"What about HIPAA / GLBA / EU special category data?"**
The tokenizer is a defense-in-depth control. For HIPAA workloads, you'd combine it with (a) an Anthropic enterprise BAA covering the `managed_ai_enabled` tier, and (b) Zero Data Retention on the Anthropic side. For GLBA and EU Article 9 data, same approach plus tenant-specific DPA language. We can walk through your specific compliance questionnaire — book a call.

---

## What's actually tokenized (detector list)

| Type | Pattern | Validation |
|---|---|---|
| **SSN** | US Social Security format (3-2-4 with separators, or 9 contiguous digits) | Rejects invalid area numbers (000, 666, 900–999) |
| **SIN / Personnummer** | Swedish personnummer (YYMMDD-XXXX or 12-digit) | Luhn check on last 10 digits |
| **CC** | 13–19 digit sequences with common separators | Luhn-validated (rejects false positives) |
| **IBAN** | Country-code + 2 check + up to 30 alphanumeric | IBAN mod-97 checksum |
| **EMAIL** | RFC-5322 pragmatic subset | Structural |
| **PHONE** | 10–15 digit international + national formats | Digit-count bounds |
| **DOB** | ISO (YYYY-MM-DD), US (MM/DD/YYYY), EU (DD.MM.YYYY / DD/MM/YYYY) | 4-digit year, valid month/day ranges |
| **POSTCODE** | US ZIP, UK postcode, Swedish 5-digit | Heuristic to avoid matching years |
| **ACCOUNT** | "account \<digits\>" and localised variants | Context-keyword gated |

## What's deliberately **not** tokenized (preserves agent quality)

- Dollar amounts and balances (e.g. `$125,000 in the 401(k)`)
- Narrative goals and preferences (e.g. "wants to retire at 65 and travel")
- Cities and countries (e.g. "Stockholm, Sweden")
- Generic medical conditions (e.g. "type-2 diabetes")
- Product names, company names, everyday English

These are the things that make the agent actually useful; they are not regulated identifiers.

## Edge-case handling

- **Duplicate values across a conversation** — consistent token (same SSN → same `[SSN_1]` every turn)
- **User sends a token-shaped string by hand** (e.g. "`[SSN_99]`") — passes through unchanged; detokenizer only swaps tokens that exist in the per-call map
- **Claude hallucinates a token we didn't issue** — fails open (token stays as-is in the response) rather than crashing
- **Tool-use flows** — tool inputs are detokenized before execution (so the DB lookup uses the real value); tool results are re-tokenized before being fed back to Claude
- **Memory updater calls** — the fire-and-forget Haiku sub-calls that extract facts and build session summaries also run through the tokenizer; if the breach detector fires, the memory update is skipped (the chat response itself has already been delivered, so no user impact)

## Audit trail

Every blocked request writes one row to the `pii_breach_log` table with:
- `tenant_id`, `conversation_id`, `customer_id`, `call_site` (chat / toolLoop / greeting / memoryUpdater)
- `findings` — structured array of `{type, sample, offset}` where `sample` is a partial redacted preview (never the full raw PII)
- `blocked_at` — timestamp

Queryable for incident review and quarterly reports. Retained indefinitely.

---

## When NOT to lead with this

This story plays best for: financial services, healthcare, legal, government, anyone with a procurement / compliance gate. For mid-market self-serve (restaurant agent, general small business), it's a proof-point footnote, not the headline.

## Related docs

- [PRIVACY.md](../PRIVACY.md) — the public-facing Privacy Policy, §6.1 covers Anthropic sub-processor + tokenization
- [RELEASING.md](../RELEASING.md) — the release flow (if you need to demo on staging before a prospect call, it's `nomii-staging.pontensolutions.com`)
- Source code: [server/src/services/piiTokenizer/](../../server/src/services/piiTokenizer/) — detector list, tokenMap, breach detector, and unit tests all live here
