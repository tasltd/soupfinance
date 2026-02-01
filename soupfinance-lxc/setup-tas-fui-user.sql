-- =============================================================================
-- Setup TAS Tenant and fui@techatscale.io User
-- =============================================================================
-- PURPOSE: Configure TAS tenant as SERVICES business type and add fui user
-- TARGET: tas.soupmarkets.com production database (soupbroker)
--
-- Run via SSH to production:
--   ssh root@140.82.32.141
--   mysql -u soupbroker -p'Dominus@soupbroker.2020' soupbroker < setup-tas-fui-user.sql
-- =============================================================================

SET NAMES utf8mb3 COLLATE utf8mb3_unicode_ci;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- =============================================================================
-- STEP 1: Set TAS Tenant ID (Known from database)
-- =============================================================================
SET @TAS_TENANT_ID = '21f29983-f6d4-11f0-8b8a-56000369dfc9';

SELECT 'TAS Tenant ID:' AS 'INFO', @TAS_TENANT_ID AS 'VALUE';

-- Show current tenant details
SELECT id, name, business_licence_category FROM account WHERE id = @TAS_TENANT_ID;

-- Update business_licence_category to SERVICES
UPDATE account
SET business_licence_category = 'SERVICES',
    last_updated = NOW()
WHERE id = @TAS_TENANT_ID;

SELECT 'Updated TAS tenant to SERVICES business type' AS 'INFO';

-- =============================================================================
-- STEP 2: Create User fui@techatscale.io
-- =============================================================================
-- Password: fui@techatscale.io (bcrypt hash)

SELECT 'Creating user fui@techatscale.io...' AS 'INFO';

INSERT INTO sb_user (version, username, password, enabled, account_expired, account_locked, password_expired)
SELECT 0, 'fui@techatscale.io', '{bcrypt}$2b$10$r/FfvEHflz49KjFa.JYA1.cXrY0awLxDPkD8qOSCuPJ0kWNeX0hK.', 1, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM sb_user WHERE username = 'fui@techatscale.io');

-- Ensure user is enabled if it already existed
UPDATE sb_user
SET enabled = 1,
    account_locked = 0,
    password = '{bcrypt}$2b$10$r/FfvEHflz49KjFa.JYA1.cXrY0awLxDPkD8qOSCuPJ0kWNeX0hK.'
WHERE username = 'fui@techatscale.io';

SET @FUI_USER_ID = (SELECT id FROM sb_user WHERE username = 'fui@techatscale.io');
SELECT 'fui@techatscale.io User ID:' AS 'INFO', @FUI_USER_ID AS 'VALUE';

-- =============================================================================
-- STEP 3: Create/Update Roles
-- =============================================================================
SELECT 'Setting up roles...' AS 'INFO';

INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_ADMIN' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_ADMIN');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_USER' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_USER');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_FINANCE_REPORTS' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_FINANCE_REPORTS');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_INVOICE' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_INVOICE');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_BILL' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_BILL');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_LEDGER_TRANSACTION' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_LEDGER_TRANSACTION');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_VENDOR' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_VENDOR');
INSERT INTO sb_role (version, authority) SELECT 0, 'ROLE_LEDGER_ACCOUNT' WHERE NOT EXISTS (SELECT 1 FROM sb_role WHERE authority = 'ROLE_LEDGER_ACCOUNT');

-- =============================================================================
-- STEP 4: Assign Roles to fui@techatscale.io
-- =============================================================================
SELECT 'Assigning roles to user...' AS 'INFO';

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
SELECT 'Creating agent (staff) record...' AS 'INFO';

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

-- Get actual agent ID (in case it already existed)
SET @FUI_AGENT_ID = (SELECT id FROM agent WHERE user_Access_id = @FUI_USER_ID AND tenant_id = @TAS_TENANT_ID LIMIT 1);
SELECT 'Agent ID:' AS 'INFO', @FUI_AGENT_ID AS 'VALUE';

-- =============================================================================
-- STEP 6: Grant Agent Roles
-- =============================================================================
SELECT 'Granting agent roles...' AS 'INFO';

INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_ADMIN' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_USER' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_FINANCE_REPORTS' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_INVOICE' AND @FUI_AGENT_ID IS NOT NULL;
INSERT IGNORE INTO agent_sb_role (agent_authorities_id, sb_role_id) SELECT @FUI_AGENT_ID, id FROM sb_role WHERE authority = 'ROLE_BILL' AND @FUI_AGENT_ID IS NOT NULL;

-- =============================================================================
-- STEP 7: Create AccountPerson (Owner of TAS Account)
-- =============================================================================
SELECT 'Creating AccountPerson record (owner)...' AS 'INFO';

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
    1,    -- key_contact = true
    1,    -- director = true
    1,    -- signatory = true
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

-- Get actual account_person ID
SET @FUI_ACCOUNT_PERSON_ID = (
    SELECT id FROM account_person
    WHERE account_id = @TAS_TENANT_ID
      AND first_name = 'Fui'
      AND surname = 'Nusenu'
    LIMIT 1
);
SELECT 'AccountPerson ID:' AS 'INFO', @FUI_ACCOUNT_PERSON_ID AS 'VALUE';

-- =============================================================================
-- STEP 8: Create Email Contact for AccountPerson
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

-- Get actual email_contact ID
SET @FUI_EMAIL_CONTACT_ID = (
    SELECT id FROM email_contact
    WHERE email = 'fui@techatscale.io'
      AND tenant_id = @TAS_TENANT_ID
    LIMIT 1
);
SELECT 'Email Contact ID:' AS 'INFO', @FUI_EMAIL_CONTACT_ID AS 'VALUE';

-- Link email to account_person
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
SELECT '=== VERIFICATION RESULTS ===' AS '';

SELECT 'TAS Tenant (Updated):' AS 'SECTION';
SELECT id, name, business_licence_category FROM account WHERE id = @TAS_TENANT_ID;

SELECT 'User Created:' AS 'SECTION';
SELECT id, username, enabled, account_locked FROM sb_user WHERE username = 'fui@techatscale.io';

SELECT 'User Roles:' AS 'SECTION';
SELECT u.username, GROUP_CONCAT(r.authority ORDER BY r.authority) AS roles
FROM sb_user u
JOIN sb_user_sb_role ur ON u.id = ur.sb_user_id
JOIN sb_role r ON ur.sb_role_id = r.id
WHERE u.username = 'fui@techatscale.io'
GROUP BY u.username;

SELECT 'Agent Record:' AS 'SECTION';
SELECT a.id, a.first_name, a.last_name, a.tenant_id, u.username
FROM agent a
JOIN sb_user u ON a.user_Access_id = u.id
WHERE u.username = 'fui@techatscale.io';

SELECT 'AccountPerson (Owner):' AS 'SECTION';
SELECT ap.id, ap.first_name, ap.surname, ap.job_title, ap.key_contact, ap.director, ap.signatory, ap.account_id
FROM account_person ap
WHERE ap.id = @FUI_ACCOUNT_PERSON_ID;

SELECT 'Email Contact:' AS 'SECTION';
SELECT ec.id, ec.email, ec.tenant_id
FROM email_contact ec
WHERE ec.id = @FUI_EMAIL_CONTACT_ID;

SELECT '=== SETUP COMPLETE ===' AS '';
SELECT '' AS '';
SELECT 'Login credentials:' AS '';
SELECT '  Username: fui@techatscale.io' AS '';
SELECT '  Password: fui@techatscale.io' AS '';
SELECT '  URL: https://app.soupfinance.com' AS '';

-- Restore foreign key checks
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
