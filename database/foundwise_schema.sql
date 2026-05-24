-- ═══════════════════════════════════════════════════════════════
--  FoundWise — MySQL Database Schema
--  Run this in phpMyAdmin (http://localhost/phpmyadmin)
--  or via: mysql -u root -p < foundwise_schema.sql
-- ═══════════════════════════════════════════════════════════════

-- Create and select the database
CREATE DATABASE IF NOT EXISTS `foundwise`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `foundwise`;

-- ──────────────────────────────────────────────────────────────
--  TABLE: users
--  Stores registered users. is_verified flips to 1 after OTP.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `email`         VARCHAR(255)     NOT NULL,
  `name`          VARCHAR(150)     DEFAULT NULL,
  `password_hash` VARCHAR(255)     DEFAULT NULL              COMMENT 'bcrypt hash — NULL for Google-only accounts',
  `role`          ENUM('student','front_desk','admin') NOT NULL DEFAULT 'student',
  `is_verified`   TINYINT(1)       NOT NULL DEFAULT 0,
  `created_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  TABLE: otp_logs
--  Audit trail of every OTP send/verify attempt.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `otp_logs` (
  `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(255)  NOT NULL,
  `action`     ENUM('send','verify_success','verify_fail') NOT NULL,
  `ip_address` VARCHAR(45)   DEFAULT NULL,
  `user_agent` TEXT          DEFAULT NULL,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_otp_logs_email`      (`email`),
  KEY `idx_otp_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  TABLE: sessions
--  Stores session tokens issued after successful OTP verify.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sessions` (
  `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED  NOT NULL,
  `token`      CHAR(64)      NOT NULL,
  `expires_at` DATETIME      NOT NULL,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sessions_token` (`token`),
  KEY `idx_sessions_user_id`    (`user_id`),
  KEY `idx_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  Sample seed data (safe to delete in production)
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `users` (`email`, `name`, `role`, `password_hash`, `is_verified`) VALUES
  ('admin@foundwise.com', 'FoundWise Admin', 'admin',   '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 1),
  ('demo@foundwise.com',  'Demo User',       'student', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0);

-- ──────────────────────────────────────────────────────────────
--  TABLE: items
--  Lost-and-found items reported by users.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `items` (
  `id`             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `user_id`        INT UNSIGNED     NOT NULL            COMMENT 'FK → users.id — who reported this item',
  `item_name`      VARCHAR(255)     NOT NULL,
  `description`    TEXT             DEFAULT NULL,
  `category`       ENUM('Electronics','Documents','Personal','Clothing','Accessories','Other')
                                    NOT NULL DEFAULT 'Other',
  `location_found` VARCHAR(255)     DEFAULT NULL,
  `image_url`      VARCHAR(500)     DEFAULT NULL        COMMENT 'URL or relative path to item photo',
  `status`         ENUM('available','pending','claimed','returned')
                                    NOT NULL DEFAULT 'available',
  `claimer_name`   VARCHAR(150)     DEFAULT NULL                       COMMENT 'Name of student who claimed this item',
  `created_at`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_items_user_id`   (`user_id`),
  KEY `idx_items_status`    (`status`),
  KEY `idx_items_category`  (`category`),
  CONSTRAINT `fk_items_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  Sample items seed data (safe to delete in production)
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `items` (`user_id`, `item_name`, `description`, `category`, `location_found`, `image_url`, `status`) VALUES
  (1, 'MacBook Pro 14"',       'Space-gray, M3 chip, has a FoundWise sticker on the lid.',        'Electronics',  'Library — 2nd floor study area',  '/uploads/macbook_found.jpg',  'available'),
  (2, 'Student ID Card',       'University ID belonging to J. Smith, ID# 20240091.',               'Documents',    'Cafeteria entrance',              '/uploads/student_id.jpg',     'pending'),
  (1, 'Black Leather Wallet',  'Contains several cards, no cash. Found near vending machines.',    'Personal',     'Engineering Building B, Room 204','/uploads/wallet_found.jpg',   'claimed'),
  (2, 'Blue North Face Jacket','Medium-sized, zipper works, found draped over a bench.',           'Clothing',     'Outdoor quad, east side',          NULL,                         'available');

-- ──────────────────────────────────────────────────────────────
--  TABLE: reports
--  User-submitted reports for lost or found items.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `reports` (
  `id`              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `reporter_id`     INT UNSIGNED     NOT NULL            COMMENT 'FK → users.id — who filed the report',
  `type`            ENUM('lost','found')
                                     NOT NULL DEFAULT 'lost',
  `title`           VARCHAR(255)     NOT NULL,
  `description`     TEXT             DEFAULT NULL,
  `location`        VARCHAR(255)     DEFAULT NULL         COMMENT 'Where the item was lost or found',
  `status`          ENUM('open','resolved')
                                     NOT NULL DEFAULT 'open',
  `created_at`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reports_reporter_id` (`reporter_id`),
  KEY `idx_reports_type`        (`type`),
  KEY `idx_reports_status`      (`status`),
  CONSTRAINT `fk_reports_reporter`
    FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  TABLE: claims
--  Tracks claim requests made by users for found items.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `claims` (
  `id`              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `item_id`         INT UNSIGNED     NOT NULL            COMMENT 'FK → items.id — the item being claimed',
  `claimant_id`     INT UNSIGNED     NOT NULL            COMMENT 'FK → users.id — who is claiming the item',
  `proof_text`      TEXT             DEFAULT NULL         COMMENT 'Written description / evidence of ownership',
  `proof_image_url` VARCHAR(500)     DEFAULT NULL         COMMENT 'Photo proof of ownership',
  `status`          ENUM('pending','approved','rejected')
                                     NOT NULL DEFAULT 'pending',
  `created_at`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_claims_item_id`     (`item_id`),
  KEY `idx_claims_claimant_id` (`claimant_id`),
  KEY `idx_claims_status`      (`status`),
  CONSTRAINT `fk_claims_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_claims_claimant`
    FOREIGN KEY (`claimant_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  TABLE: returns
--  Records the final hand-off of a claimed item.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `returns` (
  `id`              INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `item_id`         INT UNSIGNED     NOT NULL            COMMENT 'FK → items.id — the item being returned',
  `claim_id`        INT UNSIGNED     NOT NULL            COMMENT 'FK → claims.id — the approved claim',
  `returned_to`     INT UNSIGNED     NOT NULL            COMMENT 'FK → users.id — who received the item',
  `returned_by`     INT UNSIGNED     NOT NULL            COMMENT 'FK → users.id — staff who processed it',
  `notes`           TEXT             DEFAULT NULL,
  `created_at`      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_returns_item_id`  (`item_id`),
  KEY `idx_returns_claim_id` (`claim_id`),
  CONSTRAINT `fk_returns_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_returns_claim`
    FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_returns_returned_to`
    FOREIGN KEY (`returned_to`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_returns_returned_by`
    FOREIGN KEY (`returned_by`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  TABLE: activity_logs
--  Centralised audit trail for every significant system event.
--  Displayed on the admin dashboard's "Activity Feed" and
--  "Activity Log" pages.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id`          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `user_id`     INT UNSIGNED     DEFAULT NULL              COMMENT 'FK → users.id — who triggered the event (NULL for system)',
  `action`      VARCHAR(50)      NOT NULL                  COMMENT 'Machine-readable action key, e.g. item_reported, claim_submitted',
  `description` TEXT             NOT NULL                  COMMENT 'Human-readable description shown in the UI',
  `entity_type` VARCHAR(30)      DEFAULT NULL              COMMENT 'Related entity: item, claim, report, user, etc.',
  `entity_id`   INT UNSIGNED     DEFAULT NULL              COMMENT 'PK of the related entity row',
  `color`       VARCHAR(20)      NOT NULL DEFAULT '#1C5C38' COMMENT 'Dot color for the activity timeline',
  `ip_address`  VARCHAR(45)      DEFAULT NULL,
  `created_at`  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_user_id`     (`user_id`),
  KEY `idx_activity_action`      (`action`),
  KEY `idx_activity_entity`      (`entity_type`, `entity_id`),
  KEY `idx_activity_created_at`  (`created_at`),
  CONSTRAINT `fk_activity_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────
--  Sample reports seed data
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `reports` (`reporter_id`, `type`, `title`, `description`, `location`, `status`) VALUES
  (2, 'lost',  'Lost AirPods Pro',   'White case, engraved initials "JS" on the lid.',          'Library — 1st floor',             'open'),
  (1, 'found', 'Found Student ID',   'University ID picked up near the cafeteria this morning.','Cafeteria entrance',              'resolved'),
  (2, 'lost',  'Missing Notebook',   'Blue spiral notebook with calculus notes.',                'Science Building, Lecture Hall 3', 'open');

-- ──────────────────────────────────────────────────────────────
--  Sample claims seed data
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `claims` (`item_id`, `claimant_id`, `proof_text`, `proof_image_url`, `status`) VALUES
  (1, 2, 'I can describe the sticker and show my Apple receipt.',           '/uploads/proof_macbook.jpg', 'pending'),
  (2, 2, 'The ID card has my name and photo on it.',                        NULL,                        'approved'),
  (3, 2, 'Wallet contains my bank cards — I can list the last 4 digits.',  '/uploads/proof_wallet.jpg',  'approved');

-- ──────────────────────────────────────────────────────────────
--  Sample returns seed data
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `returns` (`item_id`, `claim_id`, `returned_to`, `returned_by`, `notes`) VALUES
  (3, 3, 2, 1, 'Wallet returned at front desk. Owner confirmed all contents present.');

-- ──────────────────────────────────────────────────────────────
--  Sample activity_logs seed data
-- ──────────────────────────────────────────────────────────────
INSERT IGNORE INTO `activity_logs` (`user_id`, `action`, `description`, `entity_type`, `entity_id`, `color`) VALUES
  (1, 'item_reported',    'New item reported (found): MacBook Pro 14" at Library — 2nd floor study area',   'item',  1, '#1C5C38'),
  (2, 'item_reported',    'New item reported (found): Student ID Card at Cafeteria entrance',               'item',  2, '#1C5C38'),
  (1, 'item_reported',    'New item reported (found): Black Leather Wallet at Engineering Building B',      'item',  3, '#1C5C38'),
  (2, 'item_reported',    'New item reported (found): Blue North Face Jacket at Outdoor quad',              'item',  4, '#1C5C38'),
  (2, 'claim_submitted',  'Claim submitted for MacBook Pro 14"',                                             'claim', 1, '#d97706'),
  (2, 'claim_submitted',  'Claim submitted for Student ID Card',                                             'claim', 2, '#d97706'),
  (2, 'claim_submitted',  'Claim submitted for Black Leather Wallet',                                        'claim', 3, '#d97706'),
  (1, 'claim_approved',   'Claim approved — Student ID Card returned to Demo User',                          'claim', 2, '#0d9488'),
  (1, 'claim_approved',   'Claim approved — Black Leather Wallet returned to Demo User',                     'claim', 3, '#0d9488'),
  (1, 'item_returned',    'Black Leather Wallet returned at front desk. Owner confirmed all contents.',      'item',  3, '#16a34a');
