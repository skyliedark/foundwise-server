-- Migration: Add password_hash column and fix role ENUM on users table
USE foundwise;

-- Add password_hash column if it doesn't exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'foundwise' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash');

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL COMMENT ''bcrypt hash'' AFTER name',
    'SELECT ''password_hash column already exists'' AS status');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Fix role ENUM to include student, front_desk, admin
ALTER TABLE users MODIFY COLUMN role ENUM('user','student','front_desk','admin') NOT NULL DEFAULT 'student';

-- Update any existing 'user' roles to 'student'
UPDATE users SET role = 'student' WHERE role = 'user';

-- Show final table structure
DESCRIBE users;
