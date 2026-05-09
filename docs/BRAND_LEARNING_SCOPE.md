# Brand Learning — Anonymous-Visitor Loop

**Status:** SCOPED — awaiting Austin's decisions on §13 before code changes
**Author:** Austin + Claude
**Date:** 2026-05-09
**Target release:** v3.5.0 (Phase 1 only; Phase 2 follows as v3.5.x)

---

## 1. What we're building

The anonymous-visitor brand AI agent (the chatbot on a tenant's widget that
talks to people who have NOT logged in or identified themselves) currently
treats every conversation as throwaway. After a visitor closes the chat,
nothing it learned from them carries forward.

This feature changes that: the agent accumulates **business-relevant** memory
over time — common questions, repeated processes, recurring buyer pain
points, brand-specific phrasings the agent should adopt — without storing
anything that identifies an individual visitor.

Over weeks, the agent gets noticeably better at:

- Answering the questions it gets asked frequently
- Walking visitors through processes that visitors commonly ask about
- Speaking in the brand's voice
- Anticipating the kinds of objections / concerns its target audience raises

Critically: this learning is **per tenant**. One tenant's brand learning
never bleeds into another's.

## 2. What we are NOT building

Hard anti-goals. Any of these would make the feature unshippable:

- ❌ **Tracking individual visitors across sessions.** No fingerprinting, no
  cookies-for-learning, no IP correlation.
- ❌ **Storing PII.** No emails, phone numbers, names, order numbers,
  addresses, account numbers, or anything else that maps back to a specific
  person.
- ❌ **Cross-tenant learning.** Tenant A's chats never inform Tenant B's
  brand. Each tenant's learning is fully isolated.
- ❌ **Replacing human curation.** Tenants stay in charge of their brand
  voice; this augments, doesn't replace.
- ❌ **Real-time learning during a single conversation.** Today's session
  doesn't have to make tomorrow's visitor feel "watched."

## 3. Three learned artifacts

Mirroring the per-customer pattern (`customers.soul_file` +
`customers.memory_file`), we add **three** tenant-level JSONB columns to
`tenants`:

| Column | What it holds | Rough size cap | Updated by |
|---|---|---|---|
| `brand_soul` | Distilled, durable knowledge: canonical answers to FAQs, common processes, brand-voice cues | ~30KB | Worker, after frequency threshold met |
| `brand_memory` | Recent observations, rolling 30–60 day window — patterns the worker noticed but hasn't promoted | ~15KB | Worker, every run |
| `audience_profile` | Aggregate buyer-persona patterns: "common pain points = X, Y", "common objections = ...", "common request types = ..." | ~10KB | Worker, every run |

Only `brand_soul` is injected into the anon-widget system prompt. The other
two are working-state for the distillation loop and for the tenant review UI.

Sample shape (illustrative — final shape lands during build):

```json
{
  "brand_soul": {
    "faqs": [
      { "q": "Do you ship to Canada?", "a": "Yes, $9 flat-rate, 5–7 business days.", "promoted_at": "2026-05-15T...", "session_count": 7 }
    ],
    "processes": [
      { "name": "Return request", "steps": ["..."], "promoted_at": "...", "session_count": 4 }
    ],
    "voice_cues": [
      "casual but professional",
      "uses 'folks' instead of 'customers'"
    ]
  },
  "brand_memory": {
    "recent_observations": [
      { "observation": "3 visitors asked about international warranties this week", "first_seen": "2026-05-08", "session_count": 3 }
    ]
  },
  "audience_profile": {
    "common_pain_points": ["pricing transparency", "shipping speed"],
    "common_request_types": ["product comparison", "compatibility check"]
  }
}
```

## 4. Data flow

```
anon visitor types message
    ↓
POST /api/widget/chat  (server/src/routes/widget.js:1038 — UNCHANGED)
    ↓
INSERT into messages (conversation_id, role='customer', content)
    ↓
[NEW: nothing happens at chat time — just a row in messages]
    ↓
        ... time passes, visitor leaves ...
    ↓
[NIGHTLY 03:00 UTC] brandLearningWorker runs
    ↓
For each tenant where brand_learning_enabled=true:
   1. Fetch ANON conversations (customer.email ~ '^anon_')
      with messages_at > tenants.brand_learning_processed_at
   2. Pre-scrub each message via piiTokenizer.tokenize()
      — already strips email/phone/SSN/CC/IBAN/postcode/account-#/DOB
   3. LLM distill (Haiku, ~$0.0002/conversation):
        - candidate FAQ patterns
        - candidate process patterns
        - candidate audience cues
   4. Frequency-promote: a candidate becomes a "fact" only if observed
      in ≥ tenants.brand_learning_min_sessions distinct sessions (default 3)
   5. Outbound audit: piiTokenizer.auditOutbound() before any DB write.
      If BreachError → abort write, log to brand_learning_incidents.
   6. Update tenants.brand_soul / brand_memory / audience_profile
      (JSONB, encrypted via cryptoService — same pattern as soul_file)
   7. Set tenants.brand_learning_processed_at = NOW()
    ↓
Next morning, a new anon visitor opens the widget
    ↓
agent system prompt now includes a render of brand_soul
    ↓
Tenant logs into dashboard (Phase 2), sees Brand Learning page
    ↓
Reviews learned facts, edits/deletes anything they don't like
    ↓
Optional: kill-switch flag to wipe brand_soul + disable learning
```

## 5. PII strategy — defense in depth

The hardest requirement Austin gave: nothing identifying a person ever lands
in `brand_soul`. Six layers:

**Layer 1 — Pre-distillation regex scrub.** Use the existing
`Tokenizer.tokenize()` from `server/src/services/piiTokenizer/`. Strips
emails, phones, SSNs, CCs, IBANs, postcodes, account numbers, dates of birth.
Replaces with token placeholders before the LLM sees them.

**Layer 2 — LLM-prompt anti-extraction.** The distillation system prompt
explicitly instructs:

> "Extract only business-relevant patterns. Do NOT return any sentence
> containing a name, address, order number, phone, email, date of birth, or
> any identifier that could map to a specific person. If a candidate
> observation contains identifying detail, generalize it ('customer wanted to
> change shipping address') or skip it. Return JSON with structured
> observations only."

**Layer 3 — Outbound audit.** Before writing any update, run
`Tokenizer.auditOutbound(brandSoulSnapshot)`. If it throws `BreachError`,
abort the write and log to `brand_learning_incidents` table for tenant
inspection.

**Layer 4 — Frequency promotion.** A candidate fact only enters `brand_soul`
if at least N (default 3) distinct sessions surfaced it. One visitor's
accidental data leak can't, by itself, push anything durable into the brand.

**Layer 5 — Tenant review UI** (Phase 2). Every promoted fact is visible to
the tenant in their dashboard; they can delete any line. With an audit log
showing when each fact was added.

**Layer 6 — Tenant kill-switch.** One-click "wipe brand learning + disable"
button. Resets `brand_soul`, `brand_memory`, `audience_profile` to NULL and
flips `brand_learning_enabled=false`. Logged in `brand_learning_incidents`
for audit trail.

## 6. Adversarial defense

| Attack | Defense |
|---|---|
| Poison the brand brain ("our return policy is 1000 days") | Layer 4 (frequency promotion) defeats single-session attempts. Layer 5 (tenant review) catches multi-session efforts. |
| Inject prompt-injection payloads ("ignore previous instructions...") | Layer 2 (LLM is told to extract observations, not follow embedded instructions). Same defense pattern is already used for customer-memory distillation. |
| Drown the brand in junk ("aaaaaaa...") | Existing per-session/per-tenant rate limits in widget.js + minimum-content-length filter in worker. |
| Drift the brand over time | Diff each weekly digest against previous week's; flag drift > X% for tenant review. (Phase 3.) |
| Cross-tenant infiltration via shared-NAT visitor | Per-tenant data isolation in the worker query — `WHERE tenant_id = $1` is the only join key. |

## 7. Tenant controls

| Control | Where | What it does | Default |
|---|---|---|---|
| Feature toggle | Settings → Brand Learning | `tenants.brand_learning_enabled` | OFF |
| Frequency threshold | Settings → Brand Learning | `tenants.brand_learning_min_sessions` | 3 |
| Auto-apply gate | Settings → Brand Learning | `tenants.brand_learning_auto_apply` — if false, weekly digest emailed for explicit approval | TRUE |
| Review UI | Dashboard → Brand Learning | Read-only view of brand_soul, edit any line, delete any line | — |
| Kill switch | Settings → Brand Learning | One-click wipe + disable | — |
| Export | Dashboard → Brand Learning | Download JSON of all 3 artifacts | — |

## 8. Privacy policy implications

`docs/PRIVACY.md` and the public privacy policy on shenmay.ai need a new
clause:

> "When you chat with our anonymous AI assistant, the content of your
> messages may be used to improve the assistant's understanding of common
> questions and processes for this brand. We never store your IP address,
> name, email, phone number, or any other information that could identify
> you personally in our brand-learning records. Aggregated, de-identified
> patterns are kept; individual messages are deleted from the
> brand-learning pipeline after distillation."

Also update the widget's opening message to be transparent. Light copy:

> *"By chatting, you help me get better at helping people like you. I never
> remember who you are."*

(Subject to copy review — Austin's call on whether to surface this at all
or keep it in the privacy policy only.)

## 9. Phase 1 — MVP (~2–3 sessions)

### New migration

`server/db/migrations/040_brand_learning.sql`:

```sql
-- Tenant-level brand learning columns
ALTER TABLE tenants
  ADD COLUMN brand_learning_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN brand_learning_min_sessions INT DEFAULT 3,
  ADD COLUMN brand_learning_auto_apply BOOLEAN DEFAULT TRUE,
  ADD COLUMN brand_soul JSONB DEFAULT NULL,
  ADD COLUMN brand_memory JSONB DEFAULT NULL,
  ADD COLUMN audience_profile JSONB DEFAULT NULL,
  ADD COLUMN brand_learning_processed_at TIMESTAMPTZ DEFAULT NULL;

-- Audit table for incidents (PII breaches caught at outbound, drift, etc.)
CREATE TABLE brand_learning_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pii_breach', 'drift_detected', 'promotion_blocked', 'kill_switch_used')),
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_brand_learning_incidents_tenant ON brand_learning_incidents(tenant_id, created_at DESC);
```

### New code

| File | Purpose |
|---|---|
| `server/src/services/brandLearning/distill.js` | Main distillation function. Mirrors `memoryUpdater.extractFactsFromExchange`'s shape but operates on conversation batches and returns brand-level observations. |
| `server/src/services/brandLearning/scrub.js` | Wraps `piiTokenizer.tokenize` with brand-context-specific rules. Pre-distillation only. |
| `server/src/services/brandLearning/promote.js` | Frequency-threshold promotion logic. Inputs: candidate observation list. Outputs: subset that meets threshold. |
| `server/src/workers/brandLearningWorker.js` | Cron entry point. Iterates eligible tenants, calls distill → scrub → promote → audit → write. Logs to `brand_learning_incidents` on failure. |
| `server/src/routes/portal/brandLearning.js` | Tenant API: `GET /api/portal/brand-learning` (read all 3 artifacts), `PATCH` (edit/delete), `POST /:action/kill-switch`. |

### Modified code

| File | Change |
|---|---|
| `server/src/routes/widget.js` (~line 1100, system-prompt construction) | Inject `tenant.brand_soul` rendered as text into the anon-only system prompt. Identified-customer prompts unchanged. |
| `server/index.js` | Register `routes/portal/brandLearning.js` sub-router. |
| `server/src/cron/index.js` (or wherever crons live) | Schedule `brandLearningWorker` at 03:00 UTC daily. |

### No client UI in Phase 1

Tenant manages via DB or API only. This isolates risk: we verify the worker
is sane and produces clean `brand_soul` output before exposing UI. The
canary tenant (Austin's choice) gets API access for inspection.

## 10. Phase 2 — Tenant UI + approval gate (~2 sessions)

| File | Purpose |
|---|---|
| `client/src/pages/dashboard/ShenmayBrandLearning.jsx` | Main review page — see all 3 artifacts, edit/delete any line, download JSON, kill-switch button. |
| `client/src/pages/dashboard/ShenmaySettings.jsx` (modify) | Add toggle for `brand_learning_enabled`, slider for `brand_learning_min_sessions`, switch for `brand_learning_auto_apply`. |
| `client/src/lib/shenmayApi.js` (modify) | Add `brandLearningApi.{get, patch, delete, killSwitch}`. |
| `server/src/services/email/templates/brandLearningWeeklyDigest.js` | Weekly approval-gate email when `auto_apply=false`. |
| `client/src/pages/dashboard/ShenmayBrandLearningIncidents.jsx` | Audit log view: PII breaches blocked, drift events, kill-switch invocations. |

## 11. Phase 3 — Quality signals & advanced (separate scope)

Not for first release. Captured here so we don't lose the thread:

- **Conversion signals.** Visitor signed up after chatting → that
  conversation was high-value, weight learnings from it more.
- **Cross-conversation pattern detection.** "12 visitors this week asked
  about X" → suggest tenant adds X to their company profile (separate from
  `brand_soul` — proactive nudge).
- **Vector retrieval at chat time.** Store distilled Q&A pairs in AgentDB
  HNSW for semantic retrieval; agent looks up the most relevant 3 past
  Q&As per visitor message instead of (or in addition to) prompt-injection.
- **Tone-drift detection.** Compare current `brand_soul` voice cues against
  previous week's; flag if shift > X%.
- **Multi-language handling.** First version assumes English; multi-locale
  brand-soul partitions are Phase 3+.

## 12. Testing strategy

This is where we don't cut corners.

| Test | Asserts |
|---|---|
| `tests/unit/brandLearning/scrub.test.js` | Feed a payload with embedded email/phone/SSN/name/order-#, assert all redacted before LLM call. |
| `tests/unit/brandLearning/promote.test.js` | N-1 sessions saying same fact → no promotion. N sessions → promotion. |
| `tests/integration/brandLearning/end-to-end.test.js` | Seed 5 anon conversations, run worker, assert brand_soul updated, assert no PII in result. |
| `tests/integration/brandLearning/pii-fuzz.test.js` | 100 synthetic conversations with diverse PII shapes (emails, phones, full names, SSNs, addresses, order numbers, DOBs). After distillation, assert `brand_soul` matches zero PII regex patterns from the source. |
| `tests/integration/brandLearning/adversarial.test.js` | 10 sessions with prompt-injection payloads. Assert worker returns observations, not injected content. |
| `tests/integration/brandLearning/cross-tenant.test.js` | Seed conversations to Tenant A, run worker. Assert Tenant B's `brand_soul` is unchanged. |
| `tests/integration/brandLearning/kill-switch.test.js` | After kill-switch, all 3 artifacts NULL, `brand_learning_enabled=false`, incident logged. |
| `tests/e2e/13-brand-learning-anon.spec.js` | E2E: 3 anon sessions → run worker → 4th session sees a brand_soul-derived answer that earlier sessions didn't get. |

**Release gate.** Per CLAUDE.md, the e2e spec joins the
`e2e-repeatability.yml` 5×5 matrix. Reliability-critical because it touches
auth-free customer-facing surface and writes to tenant rows that affect
every visitor.

## 13. Open decisions for Austin

These are the things I want explicit yes/no on before I write code. Default
recommendations marked **★**.

**Decision 1 — Distillation cadence.**
- **A ★** Nightly batch worker (03:00 UTC). Cheaper (~$0.0002/conversation
  × N conversations × 1 run/night), creates a clean review window, easier
  to roll back if something goes wrong.
- B Per-exchange like the customer flow. More "live" but expensive at
  scale (~$0.0002 × N visitor messages/day) and blocks tenant review
  ergonomics.

**Decision 2 — Auto-apply default.**
- **A ★** `brand_learning_auto_apply=true`: worker writes directly to
  `brand_soul`, tenant reviews after-the-fact via UI. Faster learning,
  lower friction.
- B `auto_apply=false`: worker stages changes, tenant must approve via
  weekly email digest before applying. Safer, slower-learning, higher
  ongoing tenant cognitive load.

**Decision 3 — Three artifacts vs one combined JSONB.**
- **A ★** Three columns (`brand_soul` + `brand_memory` + `audience_profile`)
  for symmetry with the customers schema (`soul_file` + `memory_file`) and
  clarity in the review UI.
- B One `brand_learning` JSONB with sub-keys. Fewer columns, but lumpier in
  the UI.

**Decision 4 — Frequency threshold default.**
- **A ★** N=3 sessions before a fact promotes. Balances safety vs.
  learning speed; tenants can tune.
- B N=5 (more conservative).
- C N=2 (faster learning, weaker against single-actor poisoning).

**Decision 5 — Anon visitor identifies mid-session: pull or exclude?**
- **A ★** Pull in. Their just-finished anon turn rows are eligible for
  distillation up to the moment of identification. After that, the
  conversation flips to identified-mode and exits the brand-learning
  pipeline.
- B Exclude entirely. Any conversation that ever became identified is
  ignored. Cleaner, but loses signal — the early anon turns may be the
  most representative ones.

**Decision 6 — Customer-managed-AI mode interaction.**
Per memory, BYOK customers without `managed_ai_enabled` use their own LLM
key. The distillation pass also needs an LLM. Options:
- **A ★** Use the BYOK customer's key for distillation too. They're paying
  for it; we don't subsidize. If no key set → brand learning silently
  skipped (logged in incidents table).
- B Use the platform key for distillation regardless. We eat the cost as
  a "service feature." Simpler UX but we pay.
- C Distillation runs only for tenants with `managed_ai_enabled=true`
  (paid SaaS tier) and self-hosted. BYOK customers don't get brand
  learning. Simplest, but a feature-gate limit.

**Decision 7 — Default ON for new tenants?**
- A ON by default for new tenants (they implicitly opt in at signup).
- **B ★** OFF by default. Add Settings UI in Phase 2 with a clear marketing
  pitch: "Your AI gets smarter the more it talks." Flip to default-ON
  after 3+ months of clean operation.

If you sign off on the **★** defaults across the board, the scope is fully
locked and I can start Phase 1.

## 14. Effort & risk

| Phase | Effort | Primary risk |
|---|---|---|
| Phase 1 (MVP — worker, no UI) | 2–3 sessions | PII fuzz tests revealing leak paths in the LLM-distillation step |
| Phase 2 (UI + approval gate) | 2 sessions | Standard UI work; low risk |
| Phase 3 (quality signals, advanced) | Separate scope | TBD |

Total to GA: ~5–7 sessions if no major surprises in PII fuzz testing.

## 15. Rollout plan

1. **Phase 1 ships behind flag**, default OFF. Invisible to all existing
   tenants.
2. **Canary on one Austin-controlled test tenant** for 1 week. Manually
   inspect `brand_soul` daily. Iterate.
3. **Friendly-customer canary** (Austin's dad's business if applicable, or
   a beta tenant) for 2 weeks.
4. **GA opt-in**. Add the Settings toggle (Phase 2). Marketing pitch lands.
5. **Default-ON for new tenants** — only after 3+ months of clean
   operation in the wild.

## 16. References

- Per-customer pattern: `server/src/engine/memoryUpdater.js`
  (`extractFactsFromExchange`, `FACT_EXTRACTION_SYSTEM`)
- PII utilities: `server/src/services/piiTokenizer/` (`Tokenizer.tokenize`,
  `Tokenizer.auditOutbound`, `breachDetector.scan`)
- Anon-widget chat handler: `server/src/routes/widget.js:1038`
- Anonymous-customer creation: `server/src/routes/widget.js:146`
- Tenants schema: `server/db/migrations/001_initial_schema.sql:13`
- Existing related migrations: 031 (`pii_tokenization`), 036
  (`anonymous_only_mode`)
- Memory: `feedback_platform_fallback_chain_leaks.md` (informs Decision 6)
