-- ============================================================
-- SHENMAY AI — Clean All Test Data
-- Run this once to wipe all test accounts and start fresh
-- ============================================================
-- This deletes in dependency order to respect foreign keys.

-- 1. Delete all flags (depends on conversations + customers)
DELETE FROM flags;

-- 2. Delete all messages (depends on conversations)
DELETE FROM messages;

-- 3. Delete all conversations (depends on customers)
DELETE FROM conversations;

-- 4. Delete all customer data records
DELETE FROM customer_data;

-- 5. Delete all customers
DELETE FROM customers;

-- 6. Delete all products
DELETE FROM tenant_products;

-- 7. Delete all advisors
DELETE FROM advisors;

-- 8. Delete all tenant admins (login accounts)
DELETE FROM tenant_admins;

-- 9. Delete all tenants
DELETE FROM tenants;

-- Verify everything is clean
SELECT 'tenants' AS table_name, COUNT(*) AS rows FROM tenants
UNION ALL SELECT 'tenant_admins', COUNT(*) FROM tenant_admins
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL SELECT 'messages', COUNT(*) FROM messages;
