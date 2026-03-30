-- Migration 024: Conversation labels
-- Each tenant can define their own label palette (name + color).
-- Labels are many-to-many with conversations via conversation_labels.

CREATE TABLE IF NOT EXISTS labels (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       VARCHAR(50) NOT NULL,
  color      VARCHAR(7)  NOT NULL DEFAULT '#6B7585',  -- hex color
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS conversation_labels (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  label_id        UUID NOT NULL REFERENCES labels(id)        ON DELETE CASCADE,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_labels_tenant       ON labels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels_conv    ON conversation_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels_label   ON conversation_labels(label_id);
