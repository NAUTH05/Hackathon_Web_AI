-- Migration: Create salary_deduction_items table for configurable tax/insurance/deductions
-- Run: mariadb -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < backend/src/db/migrate-deduction-items.sql

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
