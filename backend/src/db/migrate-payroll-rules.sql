-- Migration: Create payroll_rules table for configurable rule engine
-- Run: mariadb -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < backend/src/db/migrate-payroll-rules.sql

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

-- Add columns to salary_records to track rule adjustments
ALTER TABLE salary_records
    ADD COLUMN IF NOT EXISTS effective_hours DECIMAL(8,2) DEFAULT NULL COMMENT 'Working hours after late deduction',
    ADD COLUMN IF NOT EXISTS late_hours_deducted DECIMAL(6,2) DEFAULT 0 COMMENT 'Hours deducted due to late arrival',
    ADD COLUMN IF NOT EXISTS total_late_minutes INT DEFAULT 0 COMMENT 'Total late minutes in month',
    ADD COLUMN IF NOT EXISTS late_count INT DEFAULT 0 COMMENT 'Number of late days in month',
    ADD COLUMN IF NOT EXISTS min_hours_penalty_rate DECIMAL(4,2) DEFAULT NULL COMMENT 'Penalty rate applied (e.g. 0.7 = 30% reduction)',
    ADD COLUMN IF NOT EXISTS rule_details TEXT DEFAULT NULL COMMENT 'JSON array of applied rules with descriptions';

-- Insert default rules
INSERT INTO payroll_rules (id, rule_type, name, description, config, priority, is_active) VALUES
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
