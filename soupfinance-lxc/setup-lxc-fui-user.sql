-- =============================================================================
-- Setup TAS Tenant and fui@techatscale.io User for LXC Development
-- =============================================================================
-- PURPOSE: Create TAS tenant with SERVICES business type and add fui user
-- TARGET: Local LXC soupbroker_soupfinance database
--
-- Run via LXC:
--   lxc exec soupmarkets-mariadb -- mysql -u soupbroker -psoupbroker soupbroker_soupfinance < setup-lxc-fui-user.sql
-- =============================================================================

SET NAMES utf8mb3 COLLATE utf8mb3_unicode_ci;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- =============================================================================
-- STEP 1: Create TAS Tenant (Tech At Scale)
-- =============================================================================
SET @TAS_TENANT_ID = 'tas-tenant-001';

SELECT 'Creating TAS tenant...' AS 'INFO';

INSERT INTO account (
    id, version, name, currency, country_of_origin,
    business_licence_category, designation,
    tenant_id, archived, disabled,
    date_created, last_updated
)
SELECT
    @TAS_TENANT_ID,
    0,
    'Tech At Scale Ltd',
    'GHS',
    'Ghana',
    'SERVICES',
    'Tech At Scale - SoupFinance Demo',
    @TAS_TENANT_ID,
    0, 0,
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM account WHERE id = @TAS_TENANT_ID
);

-- Update if already exists
UPDATE account
SET business_licence_category = 'SERVICES',
    name = 'Tech At Scale Ltd',
    last_updated = NOW()
WHERE id = @TAS_TENANT_ID;

SELECT 'TAS Tenant ID:' AS 'INFO', @TAS_TENANT_ID AS 'VALUE';

-- =============================================================================
-- STEP 2: Create User fui@techatscale.io
-- =============================================================================
-- Password: fui@techatscale.io (bcrypt hash)

SELECT 'Creating user fui@techatscale.io...' AS 'INFO';

-- Get next available user ID
SET @NEXT_USER_ID = (SELECT COALESCE(MAX(id), 0) + 1 FROM sb_user);

INSERT INTO sb_user (id, version, username, password, enabled, account_expired, account_locked, password_expired)
SELECT @NEXT_USER_ID, 0, 'fui@techatscale.io', '{bcrypt}$2b$10$r/FfvEHflz49KjFa.JYA1.cXrY0awLxDPkD8qOSCuPJ0kWNeX0hK.', 1, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM sb_user WHERE username = 'fui@techatscale.io');

-- Ensure user is enabled
UPDATE sb_user
SET enabled = 1,
    account_locked = 0,
    password = '{bcrypt}$2b$10$r/FfvEHflz49KjFa.JYA1.cXrY0awLxDPkD8qOSCuPJ0kWNeX0hK.'
WHERE username = 'fui@techatscale.io';

SET @FUI_USER_ID = (SELECT id FROM sb_user WHERE username = 'fui@techatscale.io');
SELECT 'User ID:' AS 'INFO', @FUI_USER_ID AS 'VALUE';

-- =============================================================================
-- STEP 3: Verify Roles Exist (they should already be seeded)
-- =============================================================================
SELECT 'Verifying roles exist...' AS 'INFO';

-- Roles are already seeded in soupbroker_soupfinance, no need to create them
SELECT COUNT(*) AS 'Total Roles' FROM sb_role;

-- =============================================================================
-- STEP 4: Assign Roles to User
-- =============================================================================
SELECT 'Assigning roles...' AS 'INFO';

INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_ADMIN' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_FINANCE_REPORTS' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_INVOICE' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_BILL' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_LEDGER_TRANSACTION' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_VENDOR' AND @FUI_USER_ID IS NOT NULL;
INSERT IGNORE INTO sb_user_sb_role (sb_user_id, sb_role_id) SELECT @FUI_USER_ID, id FROM sb_role WHERE authority = 'ROLE_LEDGER_ACCOUNT' AND @FUI_USER_ID IS NOT NULL;

-- =============================================================================
-- STEP 5: Create Agent (Staff) Record
-- =============================================================================
SELECT 'Creating agent...' AS 'INFO';

SET @FUI_AGENT_ID = CONCAT('agent-fui-', UUID());

INSERT INTO agent (id, version, first_name, last_name, user_Access_id, tenant_id, disabled, archived, date_created, last_updated)
SELECT
    @FUI_AGENT_ID,
    0,
    'Fui',
    'Nusenu',
    @FUI_USER_ID,
    @TAS_TENANT_ID,
    0, 0,
    NOW(), NOW()
WHERE @FUI_USER_ID IS NOT NULL
  AND @TAS_TENANT_ID IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent WHERE user_Access_id = @FUI_USER_ID AND tenant_id = @TAS_TENANT_ID
);

SET @FUI_AGENT_ID = (SELECT id FROM agent WHERE user_Access_id = @FUI_USER_ID AND tenant_id = @TAS_TENANT_ID LIMIT 1);
SELECT 'Agent ID:' AS 'INFO', @FUI_AGENT_ID AS 'VALUE';

-- =============================================================================
-- STEP 6: Grant Agent Roles
-- =============================================================================
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_ADMIN' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_FINANCE_REPORTS' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_INVOICE' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_BILL' AND @FUI_AGENT_ID IS NOT NULL;

-- =============================================================================
-- STEP 7: Create AccountPerson (Owner)
-- =============================================================================
SELECT 'Creating AccountPerson...' AS 'INFO';

SET @FUI_ACCOUNT_PERSON_ID = CONCAT('ap-fui-', UUID());

INSERT INTO account_person (
    id, version, first_name, surname, other_names,
    job_title, key_contact, director, signatory,
    account_id, tenant_id,
    archived, date_created, last_updated
)
SELECT
    @FUI_ACCOUNT_PERSON_ID,
    0,
    'Fui',
    'Nusenu',
    'Owner',
    'Chief Executive Officer',
    1, 1, 1,
    @TAS_TENANT_ID,
    @TAS_TENANT_ID,
    0,
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM account_person
    WHERE account_id = @TAS_TENANT_ID
      AND first_name = 'Fui'
      AND surname = 'Nusenu'
);

SET @FUI_ACCOUNT_PERSON_ID = (
    SELECT id FROM account_person
    WHERE account_id = @TAS_TENANT_ID AND first_name = 'Fui' AND surname = 'Nusenu'
    LIMIT 1
);
SELECT 'AccountPerson ID:' AS 'INFO', @FUI_ACCOUNT_PERSON_ID AS 'VALUE';

-- =============================================================================
-- STEP 8: Create Email Contact
-- =============================================================================
SELECT 'Creating email contact...' AS 'INFO';

SET @FUI_EMAIL_CONTACT_ID = CONCAT('ec-fui-', UUID());

INSERT INTO email_contact (
    id, version, email, tenant_id,
    archived, date_created, last_updated
)
SELECT
    @FUI_EMAIL_CONTACT_ID,
    0,
    'fui@techatscale.io',
    @TAS_TENANT_ID,
    0,
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM email_contact
    WHERE email = 'fui@techatscale.io'
      AND tenant_id = @TAS_TENANT_ID
);

SET @FUI_EMAIL_CONTACT_ID = (
    SELECT id FROM email_contact
    WHERE email = 'fui@techatscale.io' AND tenant_id = @TAS_TENANT_ID
    LIMIT 1
);
SELECT 'Email Contact ID:' AS 'INFO', @FUI_EMAIL_CONTACT_ID AS 'VALUE';

INSERT IGNORE INTO account_person_email_contact (
    account_person_email_contacts_id,
    email_contact_id,
    email_contacts_idx
)
SELECT @FUI_ACCOUNT_PERSON_ID, @FUI_EMAIL_CONTACT_ID, 0
WHERE @FUI_ACCOUNT_PERSON_ID IS NOT NULL
  AND @FUI_EMAIL_CONTACT_ID IS NOT NULL;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
SELECT '=== VERIFICATION ===' AS '';

SELECT 'Tenant:' AS 'SECTION';
SELECT id, name, business_licence_category FROM account WHERE id = @TAS_TENANT_ID;

SELECT 'User:' AS 'SECTION';
SELECT id, username, enabled+0 as enabled FROM sb_user WHERE username = 'fui@techatscale.io';

SELECT 'User Roles:' AS 'SECTION';
SELECT u.username, GROUP_CONCAT(r.authority ORDER BY r.authority) AS roles
FROM sb_user u
JOIN sb_user_sb_role ur ON u.id = ur.sb_user_id
JOIN sb_role r ON ur.sb_role_id = r.id
WHERE u.username = 'fui@techatscale.io'
GROUP BY u.username;

SELECT 'Agent:' AS 'SECTION';
SELECT a.id, a.first_name, a.last_name, u.username
FROM agent a
JOIN sb_user u ON a.user_Access_id = u.id
WHERE u.username = 'fui@techatscale.io';

SELECT '=== DONE ===' AS '';
SELECT 'Login: fui@techatscale.io / fui@techatscale.io' AS '';
SELECT 'LXC URL: http://localhost:5173 (dev mode)' AS '';

SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
