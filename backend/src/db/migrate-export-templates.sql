-- Create export_templates table
CREATE TABLE IF NOT EXISTS export_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    column_config JSON NOT NULL COMMENT 'Cấu hình cột: [{field, header, width, format}]',
    created_by VARCHAR(50),
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed 3 default presets
INSERT IGNORE INTO export_templates (id, name, description, column_config, is_default) VALUES
('tpl-basic', 'Payroll Basic', 'Bảng lương cơ bản — chỉ thông tin chính', 
 '{"columns":[{"field":"stt","header":"STT","width":6,"format":"number"},{"field":"employee_code","header":"Mã NV","width":14,"format":"text"},{"field":"employee_name","header":"Họ tên","width":28,"format":"text"},{"field":"department","header":"Phòng ban","width":20,"format":"text"},{"field":"net_salary","header":"Lương ròng","width":18,"format":"currency"}]}',
 1),

('tpl-finance', 'Payroll Finance', 'Cho phòng kế toán — đầy đủ số liệu tài chính',
 '{"columns":[{"field":"stt","header":"STT","width":6,"format":"number"},{"field":"employee_code","header":"Mã NV","width":14,"format":"text"},{"field":"employee_name","header":"Họ tên","width":28,"format":"text"},{"field":"department","header":"Phòng ban","width":20,"format":"text"},{"field":"base_salary","header":"Lương CB","width":16,"format":"currency"},{"field":"present_days","header":"Ngày công","width":12,"format":"number"},{"field":"allowances","header":"Phụ cấp","width":16,"format":"currency"},{"field":"insurance","header":"BHXH","width":14,"format":"currency"},{"field":"deductions","header":"Khấu trừ","width":16,"format":"currency"},{"field":"gross_salary","header":"Lương gross","width":16,"format":"currency"},{"field":"net_salary","header":"Lương ròng","width":18,"format":"currency"}]}',
 0),

('tpl-full', 'Payroll Full', 'Đầy đủ tất cả 21 cột thông tin',
 '{"columns":[{"field":"stt","header":"STT","width":6,"format":"number"},{"field":"employee_code","header":"Mã NV","width":14,"format":"text"},{"field":"employee_name","header":"Họ tên","width":28,"format":"text"},{"field":"department","header":"Phòng ban","width":20,"format":"text"},{"field":"position","header":"Chức vụ","width":18,"format":"text"},{"field":"preset_name","header":"Mẫu lương","width":16,"format":"text"},{"field":"base_salary","header":"Lương CB","width":16,"format":"currency"},{"field":"total_work_days","header":"Tổng ngày","width":12,"format":"number"},{"field":"present_days","header":"Ngày đi làm","width":12,"format":"number"},{"field":"ot_hours","header":"Giờ OT","width":10,"format":"number"},{"field":"ot_pay","header":"Tiền OT","width":14,"format":"currency"},{"field":"night_shift_pay","header":"Ca đêm","width":14,"format":"currency"},{"field":"holiday_pay","header":"Tiền lễ","width":14,"format":"currency"},{"field":"allowances","header":"Phụ cấp","width":14,"format":"currency"},{"field":"insurance","header":"BHXH","width":14,"format":"currency"},{"field":"health_insurance","header":"BHYT","width":14,"format":"currency"},{"field":"deductions","header":"Khấu trừ","width":14,"format":"currency"},{"field":"dedication","header":"Chuyên cần","width":14,"format":"currency"},{"field":"late_penalty","header":"Phạt trễ","width":14,"format":"currency"},{"field":"gross_salary","header":"Lương gross","width":16,"format":"currency"},{"field":"net_salary","header":"Lương ròng","width":18,"format":"currency"}]}',
 0);
