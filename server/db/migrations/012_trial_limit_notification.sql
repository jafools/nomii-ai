-- Migration 012: Add limit notification tracking to subscriptions
-- Prevents the "trial limit reached" email from firing more than once per tenant.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS limit_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN subscriptions.limit_notified_at IS
  'Timestamp when the trial-limit-reached email was sent. NULL = not yet sent.';
