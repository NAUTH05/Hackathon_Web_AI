-- Migration: Create formula_variables table for reusable custom formula variables
-- Run: mariadb -u [user] -p chamcong < backend/src/db/migrate-formula-variables.sql

CREATE TABLE IF NOT EXISTS formula_variables (
    id VARCHAR(50) PRIMARY KEY COMMENT 'Variable ID used in formulas, e.g. custom_thue',
    label VARCHAR(100) NOT NULL COMMENT 'Display name, e.g. Thuế TNCN',
    value DECIMAL(20,6) NOT NULL DEFAULT 0 COMMENT 'Numeric value, e.g. 0.02 for 2%',
    description VARCHAR(255) DEFAULT '' COMMENT 'Description shown in tooltip',
    created_by VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
