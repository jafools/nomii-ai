-- Migration 027: Per-tenant email template customization
--
-- Allows tenants to customize the From name, Reply-To address, and footer
-- text on transactional emails sent to their customers and team members.
-- NULL values fall back to the platform defaults in emailService.js.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS email_from_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS email_reply_to   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_footer     VARCHAR(500);
