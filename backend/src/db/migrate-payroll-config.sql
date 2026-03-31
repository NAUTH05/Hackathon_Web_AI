-- Migration: present_days to DECIMAL + payroll_table_config
-- Run: mysql -u root chamcong < migrate-payroll-config.sql

-- 1. Change present_days from INT to DECIMAL for fractional days (hours/8)
ALTER TABLE salary_records MODIFY COLUMN present_days DECIMAL(6,2) DEFAULT 0;

-- 2. Payroll table column config (per user or global)
CREATE TABLE IF NOT EXISTS payroll_table_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL COMMENT 'User who owns this config',
    columns JSON NOT NULL COMMENT 'Array of column definitions',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_payroll_config_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
