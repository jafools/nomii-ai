-- 009: Add chat_bubble_name to tenants + password reset columns to tenant_admins
--
-- chat_bubble_name: Customisable text for the embed.js launcher button (e.g. "Chat with Steve")
-- password_reset_token / _expires: Standard forgot-password flow

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS chat_bubble_name VARCHAR(100);

ALTER TABLE tenant_admins
  ADD COLUMN IF NOT EXISTS password_reset_token   VARCHAR(128),
  ADD COLUMN IF NOT EXISTS password_reset_expires  TIMESTAMPTZ;
