-- Fix: payroll_table_config uses 'global' as user_id but FK references users(id)
-- Since table config is shared across all users, remove the FK constraint

-- Step 1: Find and drop the FK constraint
-- The constraint name may vary; this handles the common auto-generated name
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payroll_table_config' 
      AND COLUMN_NAME = 'user_id' 
      AND REFERENCED_TABLE_NAME = 'users'
    LIMIT 1
);

SET @sql = IF(@fk_name IS NOT NULL,
    CONCAT('ALTER TABLE payroll_table_config DROP FOREIGN KEY ', @fk_name),
    'SELECT "No FK constraint found on payroll_table_config.user_id" AS status'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Also drop the unique index and recreate without FK dependency
-- (the unique index idx_payroll_config_user is fine to keep)

SELECT 'payroll_table_config FK constraint removed successfully!' AS status;
