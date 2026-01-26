-- =============================================================================
-- SoupFinance Test Data Seed Script
-- =============================================================================
-- PURPOSE: Create test users, agents, and roles for soupfinance integration tests
-- USAGE: Run this script in the soupbroker_soupfinance database
--
-- Run via LXC:
--   lxc exec soupmarkets-mariadb -- mysql -u soupbroker -psoupbroker soupbroker_soupfinance < seed-soupfinance-testdata.sql
--
-- Or via SSH:
--   ssh root@{mariadb-container-ip} mysql -u soupbroker -psoupbroker soupbroker_soupfinance < seed-soupfinance-testdata.sql
--
-- Or locally (if using local database):
--   mysql -u soupbroker -psoupbroker soupbroker < seed-soupfinance-testdata.sql
-- =============================================================================

-- Set consistent character set and collation (match existing database)
SET NAMES utf8mb3 COLLATE utf8mb3_unicode_ci;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- =============================================================================
-- STEP 1: Create SoupFinance Tenant (Account) if not exists
-- Note: account.id is VARCHAR(255)
-- =============================================================================
SET @SOUPFINANCE_TENANT_ID = 'soupfinance-demo-001';

INSERT INTO account (
    id, version, name, currency, country_of_origin,
    business_licence_category, designation,
    tenant_id, archived, disabled,
    date_created, last_updated
)
SELECT
    @SOUPFINANCE_TENANT_ID,
    0,
    'SoupFinance Demo',
    'GHS',
    'Ghana',
    'ASSET_MANAGER',
    'SoupFinance Demo Tenant',
    @SOUPFINANCE_TENANT_ID,
    0, 0,
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM account WHERE id = @SOUPFINANCE_TENANT_ID
);

-- Get actual tenant ID (use first available if SoupFinance doesn't exist)
SET @TENANT_ID = (
    SELECT COALESCE(
        (SELECT id FROM account WHERE id = @SOUPFINANCE_TENANT_ID),
        (SELECT id FROM account WHERE business_licence_category IS NOT NULL LIMIT 1)
    )
);

SELECT CONCAT('Using tenant: ', @TENANT_ID) AS 'INFO';

-- =============================================================================
-- STEP 2: Create Roles (if not exist)
-- Note: sb_role.id is BIGINT AUTO_INCREMENT
-- =============================================================================
INSERT INTO sb_role (version, authority)
SELECT 0, 'ROOT_ROOT'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROOT_ROOT');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_ADMIN_ROOT'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_ADMIN_ROOT');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_ADMIN'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_ADMIN');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_USER'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_USER');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_FINANCE_REPORTS'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_FINANCE_REPORTS');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_INVOICE'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_INVOICE');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_BILL'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_BILL');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_LEDGER_TRANSACTION'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_LEDGER_TRANSACTION');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_VENDOR'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_VENDOR');

INSERT INTO sb_role (version, authority)
SELECT 0, 'ROLE_LEDGER_ACCOUNT'
WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_LEDGER_ACCOUNT');

-- =============================================================================
-- STEP 3: Create Test Users (SbUser)
-- Note: sb_user.id is BIGINT AUTO_INCREMENT
-- Password: Soup@Enscript2023 (bcrypt hash from existing user)
-- =============================================================================

-- soup.support user (admin) - use existing if present
INSERT INTO sb_user (version, username, password, enabled, account_expired, account_locked, password_expired)
SELECT 0, 'soup.support', '{bcrypt}$2a$10$AANAdHbNlUlwqv7ig/UyvOIqjN9XvJdrxW2PIBGGQBtZGVkFDwxvy', 1, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM sb_user WHERE username = 'soup.support');

-- Enable soup.support if it was disabled
UPDATE sb_user SET enabled = 1, account_locked = 0 WHERE username = 'soup.support';

-- fui.nusenu user (demo) - password: fui.nusenu
INSERT INTO sb_user (version, username, password, enabled, account_expired, account_locked, password_expired)
SELECT 0, 'fui.nusenu', '{bcrypt}$2a$10$AANAdHbNlUlwqv7ig/UyvOIqjN9XvJdrxW2PIBGGQBtZGVkFDwxvy', 1, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM sb_user WHERE username = 'fui.nusenu');

-- test.agent user - password: TestAgent123
INSERT INTO sb_user (version, username, password, enabled, account_expired, account_locked, password_expired)
SELECT 0, 'test.agent', '{bcrypt}$2a$10$AANAdHbNlUlwqv7ig/UyvOIqjN9XvJdrxW2PIBGGQBtZGVkFDwxvy', 1, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM sb_user WHERE username = 'test.agent');

-- =============================================================================
-- STEP 4: Get User IDs
-- =============================================================================
SET @SOUP_SUPPORT_ID = (SELECT id FROM sb_user WHERE username = 'soup.support');
SET @FUI_NUSENU_ID = (SELECT id FROM sb_user WHERE username = 'fui.nusenu');
SET @TEST_AGENT_ID = (SELECT id FROM sb_user WHERE username = 'test.agent');

SELECT CONCAT('soup.support ID: ', IFNULL(@SOUP_SUPPORT_ID, 'NOT FOUND')) AS 'INFO';
SELECT CONCAT('fui.nusenu ID: ', IFNULL(@FUI_NUSENU_ID, 'NOT FOUND')) AS 'INFO';
SELECT CONCAT('test.agent ID: ', IFNULL(@TEST_AGENT_ID, 'NOT FOUND')) AS 'INFO';

-- =============================================================================
-- STEP 5: Assign Roles to Users
-- =============================================================================
-- soup.support roles: ROLE_ADMIN, ROLE_USER, ROOT_ROOT, ROLE_ADMIN_ROOT
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id)
SELECT @SOUP_SUPPORT_ID, id FROM sb_role WHERE authority = 'ROLE_ADMIN' AND @SOUP_SUPPORT_ID IS NOT NULL;

INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id)
SELECT @SOUP_SUPPORT_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @SOUP_SUPPORT_ID IS NOT NULL;

INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id)
SELECT @SOUP_SUPPORT_ID, id FROM sb_role WHERE authority = 'ROOT_ROOT' AND @SOUP_SUPPORT_ID IS NOT NULL;

INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id)
SELECT @SOUP_SUPPORT_ID, id FROM sb_role WHERE authority = 'ROLE_ADMIN_ROOT' AND @SOUP_SUPPORT_ID IS NOT NULL;

-- fui.nusenu roles: ROLE_USER
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id)
SELECT @FUI_NUSENU_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @FUI_NUSENU_ID IS NOT NULL;

-- test.agent roles: ROLE_USER
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id)
SELECT @TEST_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @TEST_AGENT_ID IS NOT NULL;

-- =============================================================================
-- STEP 6: Create Agents (link users to tenant)
-- Note: agent.id is VARCHAR(255), agent.user_Access_id is BIGINT
-- =============================================================================

-- soup.support Agent
INSERT INTO agent (id, version, first_name, last_name, user_Access_id, tenant_id, disabled, archived, date_created, last_updated)
SELECT
    CONCAT('sf-agent-', UUID()),
    0,
    'Soup',
    'Support',
    @SOUP_SUPPORT_ID,
    @TENANT_ID,
    0, 0,
    NOW(), NOW()
WHERE @SOUP_SUPPORT_ID IS NOT NULL
  AND @TENANT_ID IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent WHERE user_Access_id = @SOUP_SUPPORT_ID AND tenant_id = @TENANT_ID
);

-- fui.nusenu Agent
INSERT INTO agent (id, version, first_name, last_name, user_Access_id, tenant_id, disabled, archived, date_created, last_updated)
SELECT
    CONCAT('sf-agent-', UUID()),
    0,
    'Fui',
    'Nusenu',
    @FUI_NUSENU_ID,
    @TENANT_ID,
    0, 0,
    NOW(), NOW()
WHERE @FUI_NUSENU_ID IS NOT NULL
  AND @TENANT_ID IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent WHERE user_Access_id = @FUI_NUSENU_ID AND tenant_id = @TENANT_ID
);

-- test.agent Agent
INSERT INTO agent (id, version, first_name, last_name, user_Access_id, tenant_id, disabled, archived, date_created, last_updated)
SELECT
    CONCAT('sf-agent-', UUID()),
    0,
    'Test',
    'Agent',
    @TEST_AGENT_ID,
    @TENANT_ID,
    0, 0,
    NOW(), NOW()
WHERE @TEST_AGENT_ID IS NOT NULL
  AND @TENANT_ID IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent WHERE user_Access_id = @TEST_AGENT_ID AND tenant_id = @TENANT_ID
);

-- =============================================================================
-- STEP 7: Grant Agent Roles
-- =============================================================================
-- Get agent IDs
SET @SOUP_SUPPORT_AGENT_ID = (
    SELECT id FROM agent WHERE user_Access_id = @SOUP_SUPPORT_ID AND tenant_id = @TENANT_ID LIMIT 1
);

SELECT CONCAT('soup.support Agent ID: ', IFNULL(@SOUP_SUPPORT_AGENT_ID, 'NOT FOUND')) AS 'INFO';

-- Grant ROLE_ADMIN to soup.support agent
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id)
SELECT @SOUP_SUPPORT_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_ADMIN' AND @SOUP_SUPPORT_AGENT_ID IS NOT NULL;

INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id)
SELECT @SOUP_SUPPORT_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @SOUP_SUPPORT_AGENT_ID IS NOT NULL;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
SELECT '=== VERIFICATION RESULTS ===' AS '';

SELECT 'Tenant:' AS 'SECTION';
SELECT id, name, business_licence_category FROM account WHERE id = @TENANT_ID;

SELECT 'Users:' AS 'SECTION';
SELECT id, username, enabled FROM sb_user WHERE username IN ('soup.support', 'fui.nusenu', 'test.agent');

SELECT 'User Roles:' AS 'SECTION';
SELECT u.username, r.authority
FROM sb_user u
JOIN sb_user_sb_role ur ON u.id = ur.sb_user_id
JOIN sb_role r ON ur.sb_role_id = r.id
WHERE u.username IN ('soup.support', 'fui.nusenu', 'test.agent')
ORDER BY u.username, r.authority;

SELECT 'Agents:' AS 'SECTION';
SELECT a.id, a.first_name, a.last_name, a.tenant_id, u.username
FROM agent a
JOIN sb_user u ON a.user_Access_id = u.id
WHERE u.username IN ('soup.support', 'fui.nusenu', 'test.agent');

SELECT '=== SEED COMPLETE ===' AS '';

-- Restore foreign key checks
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
