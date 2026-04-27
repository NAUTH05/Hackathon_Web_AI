-- Combined migration: Apply all missing tables and columns for salary module
-- This fixes 500 errors on:
--   GET  /api/salary/table-config
--   GET  /api/salary/variables
--   POST /api/salary/calculate
--   GET  /api/salary/rules
--   GET  /api/salary/deduction-items
--
-- Run: mysql -u root -p chamcong < backend/src/db/migrate-all-missing.sql

-- ========== 1. payroll_table_config (for /api/salary/table-config) ==========
CREATE TABLE IF NOT EXISTS payroll_table_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL COMMENT 'User who owns this config',
    columns JSON NOT NULL COMMENT 'Array of column definitions',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX idx_payroll_config_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== 2. formula_variables (for /api/salary/variables) ==========
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

-- ========== 3. payroll_rules (for /api/salary/rules + calculate) ==========
CREATE TABLE IF NOT EXISTS payroll_rules (
    id VARCHAR(50) PRIMARY KEY,
    rule_type VARCHAR(50) NOT NULL COMMENT 'late_policy | min_hours_policy | repeat_late_policy | custom',
    name VARCHAR(100) NOT NULL,
    description TEXT,
    config JSON NOT NULL COMMENT 'Rule-specific configuration',
    priority INT DEFAULT 0 COMMENT 'Execution order (lower = first)',
    is_active TINYINT(1) DEFAULT 1,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default rules (only if not exists)
INSERT IGNORE INTO payroll_rules (id, rule_type, name, description, config, priority, is_active) VALUES
(
    'rule_late_policy',
    'late_policy',
    'Chính sách đi trễ',
    'Trừ giờ làm dựa trên số phút đi trễ. Có thời gian ân hạn (grace period).',
    JSON_OBJECT(
        'type', 'deduct_hours',
        'grace_minutes', 5,
        'conversion_rate', 1.0,
        'description_template', 'Trễ {late_minutes} phút → trừ {deducted_hours}h làm'
    ),
    10,
    1
),
(
    'rule_min_hours',
    'min_hours_policy',
    'Ngưỡng giờ làm tối thiểu',
    'Giảm lương nếu không đạt số giờ tối thiểu trong tháng.',
    JSON_OBJECT(
        'required_hours', 160,
        'penalty_rate', 0.7,
        'description_template', 'Chỉ làm {effective_hours}h / {required_hours}h → lương ×{penalty_rate}'
    ),
    20,
    0
),
(
    'rule_repeat_late',
    'repeat_late_policy',
    'Phạt tái phạm đi trễ',
    'Áp dụng phạt thêm khi số lần đi trễ vượt ngưỡng.',
    JSON_OBJECT(
        'max_late_count', 5,
        'penalty_type', 'fixed',
        'penalty_amount', 200000,
        'penalty_percentage', 0,
        'description_template', 'Đi trễ {late_count} lần (>{max_late_count}) → phạt {penalty_amount}đ'
    ),
    30,
    0
);

-- ========== 4. salary_deduction_items (for /api/salary/deduction-items + calculate) ==========
CREATE TABLE IF NOT EXISTS salary_deduction_items (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT 'Tên khoản trừ: Thuế TNCN, BHXH, ...',
    type VARCHAR(50) NOT NULL COMMENT 'tax | insurance | union_fee | custom',
    calc_type ENUM('fixed', 'percentage') NOT NULL DEFAULT 'fixed' COMMENT 'Cách tính: cố định hoặc % lương gross',
    amount DECIMAL(15,2) DEFAULT 0 COMMENT 'Số tiền cố định (nếu calc_type = fixed)',
    rate DECIMAL(8,4) DEFAULT 0 COMMENT 'Tỷ lệ % (nếu calc_type = percentage, VD: 0.105 = 10.5%)',
    description TEXT,
    priority INT DEFAULT 0 COMMENT 'Thứ tự hiển thị (nhỏ = trước)',
    is_active TINYINT(1) DEFAULT 1,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed common Vietnamese deduction items (all inactive by default)
INSERT IGNORE INTO salary_deduction_items (id, name, type, calc_type, amount, rate, description, priority, is_active) VALUES
('ded_bhxh', 'BHXH (8%)', 'insurance', 'percentage', 0, 0.08, 'Bảo hiểm xã hội: 8% lương gross', 10, 0),
('ded_bhyt', 'BHYT (1.5%)', 'insurance', 'percentage', 0, 0.015, 'Bảo hiểm y tế: 1.5% lương gross', 20, 0),
('ded_bhtn', 'BHTN (1%)', 'insurance', 'percentage', 0, 0.01, 'Bảo hiểm thất nghiệp: 1% lương gross', 30, 0),
('ded_tax', 'Thuế TNCN', 'tax', 'percentage', 0, 0.10, 'Thuế thu nhập cá nhân (tạm tính 10%)', 40, 0),
('ded_union', 'Phí công đoàn (1%)', 'union_fee', 'percentage', 0, 0.01, 'Phí công đoàn: 1% lương gross', 50, 0);

-- ========== 5. Add missing columns to salary_records (for calculate) ==========
-- Change present_days from INT to DECIMAL for fractional days (hours/8)
ALTER TABLE salary_records MODIFY COLUMN present_days DECIMAL(6,2) DEFAULT 0;

-- Add rule engine tracking columns
ALTER TABLE salary_records
    ADD COLUMN IF NOT EXISTS effective_hours DECIMAL(8,2) DEFAULT NULL COMMENT 'Working hours after late deduction',
    ADD COLUMN IF NOT EXISTS late_hours_deducted DECIMAL(6,2) DEFAULT 0 COMMENT 'Hours deducted due to late arrival',
    ADD COLUMN IF NOT EXISTS total_late_minutes INT DEFAULT 0 COMMENT 'Total late minutes in month',
    ADD COLUMN IF NOT EXISTS late_count INT DEFAULT 0 COMMENT 'Number of late days in month',
    ADD COLUMN IF NOT EXISTS min_hours_penalty_rate DECIMAL(4,2) DEFAULT NULL COMMENT 'Penalty rate applied (e.g. 0.7 = 30% reduction)',
    ADD COLUMN IF NOT EXISTS rule_details TEXT DEFAULT NULL COMMENT 'JSON array of applied rules with descriptions';

SELECT 'All migrations applied successfully!' AS status;
