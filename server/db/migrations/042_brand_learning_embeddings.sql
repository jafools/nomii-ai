-- 042_brand_learning_embeddings.sql
--
-- Brand Learning — Phase 3 Semantic Dedup (v3.5.6)
--
-- Adds a table to store embeddings for `brand_soul` / `brand_memory`
-- canonical_keys so the worker can do semantic-similarity dedup at distill
-- time (replacing the v3.5.3 Szymkiewicz–Simpson token-overlap heuristic for
-- the cases that needed transitive / synonym matching).
--
-- Design constraints:
--   - **No pgvector required.** pgvector isn't installed on either Hetzner
--     prod or Proxmox staging (and on-prem customers would need to upgrade
--     their postgres image to get it). We store embeddings as `jsonb`
--     (array of 1536 floats) and compute cosine similarity in JS. Brand
--     learning's per-tenant scale (~200 canonical_keys per bucket) makes
--     brute-force cosine sub-millisecond — HNSW is unnecessary at this
--     volume. Revisit when any tenant approaches 10k vectors.
--   - **No new env var required.** Embeddings are computed via the tenant's
--     existing BYOK (OpenAI key) resolved by `resolveApiKey(tenant)`. If
--     the tenant's key isn't OpenAI-compatible (Anthropic-only), the
--     embedding pass is skipped silently and the v3.5.3 token-overlap
--     heuristic kicks in — opt-in is never blocked by missing embeddings.
--   - **Idempotent.** CHECK constraint wrapped in DO-block per PG ≤16
--     limitation (`feedback_pg_add_constraint_no_if_not_exists`).
--   - **PK on (tenant_id, bucket, canonical_key)** ensures one embedding
--     per concept; UPSERT pattern in worker.

CREATE TABLE IF NOT EXISTS brand_learning_embeddings (
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bucket        TEXT         NOT NULL,
  canonical_key TEXT         NOT NULL,
  embedding     JSONB        NOT NULL,
  model         TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, bucket, canonical_key)
);

CREATE INDEX IF NOT EXISTS idx_brand_learning_embeddings_tenant_bucket
  ON brand_learning_embeddings(tenant_id, bucket);

-- Bucket whitelist. Mirrors the conceptual buckets in promote.js — note
-- that brand_soul.faqs and brand_memory.candidate_faqs share the SAME
-- conceptual bucket here (`faqs`) because we want similarity across both
-- soul + memory in a single embedding lookup.
--
-- DO-block because PG ≤16 has no `ADD CONSTRAINT IF NOT EXISTS` (see
-- migration 040 + 041 — same idempotency pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_learning_embeddings_bucket_check'
      AND conrelid = 'brand_learning_embeddings'::regclass
  ) THEN
    ALTER TABLE brand_learning_embeddings
      ADD CONSTRAINT brand_learning_embeddings_bucket_check
      CHECK (bucket IN (
        'faqs',
        'processes',
        'voice_cues',
        'audience_pain_points',
        'audience_objections',
        'audience_request_types'
      ));
  END IF;
END $$;

COMMENT ON TABLE brand_learning_embeddings IS
  'v3.5.6: per-tenant per-bucket embeddings of brand-learning canonical_keys, used for semantic-similarity dedup at distill time. JSONB float-array storage (no pgvector dependency); cosine similarity computed in JS.';
COMMENT ON COLUMN brand_learning_embeddings.bucket IS
  'Conceptual bucket — shared across brand_soul + brand_memory rows for the same concept type.';
COMMENT ON COLUMN brand_learning_embeddings.embedding IS
  'JSONB array of floats (text-embedding-3-small produces 1536 dims).';
COMMENT ON COLUMN brand_learning_embeddings.model IS
  'Model used to produce the embedding — informational, for future rebuild if we change models.';
