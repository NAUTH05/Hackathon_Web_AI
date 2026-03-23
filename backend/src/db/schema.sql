-- =============================================
-- CHAMCONG DATABASE SCHEMA - 21 Tables (MariaDB)
-- Updated: 2026-03-14 - Meeting requirements
-- =============================================

-- 1. Phong ban (with parent_id for tree structure)
CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    manager_id VARCHAR(50),
    parent_id VARCHAR(50) COMMENT 'For tree structure - references another department',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Nhan vien (with attendance_score for diligence system)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    department_id VARCHAR(50),
    position VARCHAR(100),
    role_level TINYINT NOT NULL DEFAULT 5 COMMENT '1=Admin, 2=TGD/GD, 3=TP/PP, 4=To truong, 5=Nhan vien',
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    avatar LONGTEXT,
    face_descriptor LONGBLOB,
    face_image LONGTEXT,
    attendance_score DECIMAL(5,2) DEFAULT 100.00 COMMENT 'Diem chuyen can (0-100)',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tai khoan
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role ENUM('admin','user') DEFAULT 'user',
    role_level TINYINT NOT NULL DEFAULT 5 COMMENT '1=Admin, 2=TGD/GD, 3=TP/PP, 4=To truong, 5=Nhan vien',
    department VARCHAR(100),
    avatar LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Ca lam viec
CREATE TABLE IF NOT EXISTS shifts (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    color VARCHAR(10),
    allow_late_minutes INT DEFAULT 15,
    allow_early_leave_minutes INT DEFAULT 10,
    break_start_time TIME,
    break_end_time TIME,
    is_overnight TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Phan ca
CREATE TABLE IF NOT EXISTS shift_assignments (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    shift_id VARCHAR(50),
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    effective_from DATE NOT NULL,
    effective_to DATE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Cham cong (daily attendance = "bang cong ngay")
CREATE TABLE IF NOT EXISTS attendance_records (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    date DATE NOT NULL,
    shift_id VARCHAR(50),
    shift_name VARCHAR(100),
    check_in_time TIMESTAMP NULL,
    check_out_time TIMESTAMP NULL,
    check_in_image LONGTEXT,
    check_out_image LONGTEXT,
    status ENUM('on-time','late','early-leave','absent','pending'),
    late_minutes INT DEFAULT 0,
    early_leave_minutes INT DEFAULT 0,
    working_hours DECIMAL(5,2) DEFAULT 0,
    is_night_shift TINYINT(1) DEFAULT 0 COMMENT 'Ca dem',
    is_holiday TINYINT(1) DEFAULT 0 COMMENT 'Ngay le',
    is_weekend TINYINT(1) DEFAULT 0 COMMENT 'Cuoi tuan',
    note TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance_records(employee_id, date);

-- 7. Yeu cau OT
CREATE TABLE IF NOT EXISTS ot_requests (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    date DATE NOT NULL,
    shift_id VARCHAR(50),
    start_time TIME,
    end_time TIME,
    hours DECIMAL(4,1),
    multiplier DECIMAL(3,1),
    reason TEXT,
    status ENUM('pending','approved','rejected','auto-rejected') DEFAULT 'pending',
    approved_by VARCHAR(100),
    approved_at TIMESTAMP NULL,
    auto_rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Nghi phep (with hourly leave support)
CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type ENUM('annual','sick','personal','maternity','unpaid','hourly'),
    hours DECIMAL(4,1) COMMENT 'For hourly leave type',
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    approved_by VARCHAR(100),
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Phat / Canh cao (with attendance_deduction type)
CREATE TABLE IF NOT EXISTS penalties (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    date DATE,
    type ENUM('warning','deduction','attendance_deduction') COMMENT 'attendance_deduction = tru chuyen can',
    reason TEXT,
    amount DECIMAL(12,0),
    attendance_points DECIMAL(5,2) DEFAULT 0 COMMENT 'Diem chuyen can bi tru',
    description TEXT,
    is_auto_generated TINYINT(1) DEFAULT 0,
    status ENUM('active','appealed','resolved') DEFAULT 'active',
    appeal_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Mau phat
CREATE TABLE IF NOT EXISTS penalty_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    type ENUM('warning','deduction','attendance_deduction'),
    reason TEXT,
    description TEXT,
    amount DECIMAL(12,0),
    attendance_points DECIMAL(5,2) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. Nhat ky
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(30),
    performed_by VARCHAR(100),
    target_employee VARCHAR(100),
    details TEXT,
    old_value TEXT,
    new_value TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(timestamp DESC);

-- 12. Sua gio
CREATE TABLE IF NOT EXISTS time_corrections (
    id VARCHAR(50) PRIMARY KEY,
    attendance_id VARCHAR(50),
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    date DATE,
    field ENUM('checkInTime','checkOutTime'),
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP NULL,
    FOREIGN KEY (attendance_id) REFERENCES attendance_records(id),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. Doi ca
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id VARCHAR(50) PRIMARY KEY,
    requester_id VARCHAR(50),
    requester_name VARCHAR(100),
    target_id VARCHAR(50),
    target_name VARCHAR(100),
    date DATE,
    requester_shift_id VARCHAR(50),
    target_shift_id VARCHAR(50),
    reason TEXT,
    status ENUM('pending','accepted','rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_id) REFERENCES employees(id),
    FOREIGN KEY (target_id) REFERENCES employees(id),
    FOREIGN KEY (requester_shift_id) REFERENCES shifts(id),
    FOREIGN KEY (target_shift_id) REFERENCES shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. Ngay le (with salary multiplier)
CREATE TABLE IF NOT EXISTS holidays (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    date DATE NOT NULL,
    type ENUM('public','company'),
    salary_multiplier DECIMAL(3,1) DEFAULT 2.0 COMMENT 'He so luong ngay le'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. Bang cong thang (aggregated from daily attendance)
CREATE TABLE IF NOT EXISTS monthly_timesheets (
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    month VARCHAR(7) NOT NULL,
    total_work_days INT,
    present_days INT,
    absent_days INT,
    late_days INT,
    early_leave_days INT,
    total_working_hours DECIMAL(6,2),
    total_ot_hours DECIMAL(6,2),
    night_shift_hours DECIMAL(6,2) DEFAULT 0 COMMENT 'Gio ca dem',
    holiday_hours DECIMAL(6,2) DEFAULT 0 COMMENT 'Gio lam ngay le',
    weekend_hours DECIMAL(6,2) DEFAULT 0 COMMENT 'Gio lam cuoi tuan',
    total_weighted_hours DECIMAL(8,2) DEFAULT 0 COMMENT 'Tong gio x he so',
    leave_days INT,
    on_time_rate DECIMAL(5,2),
    is_locked TINYINT(1) DEFAULT 0,
    locked_at TIMESTAMP NULL,
    locked_by VARCHAR(100),
    PRIMARY KEY (employee_id, month),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. Vi tri GPS
CREATE TABLE IF NOT EXISTS company_locations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    address TEXT,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    radius INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. Mau luong
CREATE TABLE IF NOT EXISTS salary_presets (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    description TEXT,
    base_salary DECIMAL(15,0),
    formula_type ENUM('standard','custom'),
    custom_formula TEXT,
    allowances DECIMAL(15,0),
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. Gan mau luong
CREATE TABLE IF NOT EXISTS employee_salary_assignments (
    employee_id VARCHAR(50) PRIMARY KEY,
    preset_id VARCHAR(50),
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (preset_id) REFERENCES salary_presets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. Bang luong
CREATE TABLE IF NOT EXISTS salary_records (
    id VARCHAR(50) PRIMARY KEY,
    employee_id VARCHAR(50),
    employee_name VARCHAR(100),
    month VARCHAR(7),
    preset_id VARCHAR(50),
    preset_name VARCHAR(100),
    base_salary DECIMAL(15,0),
    total_work_days INT,
    present_days INT,
    ot_hours DECIMAL(6,2),
    ot_pay DECIMAL(15,0),
    night_shift_pay DECIMAL(15,0) DEFAULT 0,
    holiday_pay DECIMAL(15,0) DEFAULT 0,
    allowances DECIMAL(15,0),
    allowances_detail TEXT COMMENT 'JSON: {name: amount,...}',
    insurance DECIMAL(15,0),
    health_insurance DECIMAL(15,0),
    deductions DECIMAL(15,0),
    deductions_detail TEXT COMMENT 'JSON: {name: amount,...}',
    dedication DECIMAL(15,0) COMMENT 'Chuyen can (replaces late penalties)',
    late_penalty DECIMAL(15,0),
    gross_salary DECIMAL(15,0) COMMENT 'Pre-tax salary',
    net_salary DECIMAL(15,0),
    is_locked TINYINT(1) DEFAULT 0,
    locked_at TIMESTAMP NULL,
    locked_by VARCHAR(100),
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (preset_id) REFERENCES salary_presets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. He so luong (Salary Coefficients)
CREATE TABLE IF NOT EXISTS salary_coefficients (
    id VARCHAR(50) PRIMARY KEY,
    type ENUM('overtime','night_shift','weekend','holiday','dedication') COMMENT 'loai he so',
    multiplier DECIMAL(3,1) NOT NULL COMMENT 'he so nhan (vi du: 1.5, 2.0)',
    description VARCHAR(255),
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. Cau hinh quyen tinh luong (Salary Calculation Rights)
CREATE TABLE IF NOT EXISTS salary_permissions (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),
    can_calculate TINYINT(1) DEFAULT 0,
    can_view_all_salary TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. Mau xuat Excel (Export Templates)
CREATE TABLE IF NOT EXISTS export_templates (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    column_config JSON NOT NULL COMMENT 'Cấu hình cột: [{field, header, width, format}]',
    created_by VARCHAR(50),
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23. Vai trò bổ sung (Multi-role support)
CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(50),
    role_name VARCHAR(50) NOT NULL COMMENT 'salary_manager, etc.',
    granted_by VARCHAR(50),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24. Khóa bảng công ngày
CREATE TABLE IF NOT EXISTS daily_timesheet_locks (
    date DATE PRIMARY KEY,
    locked_by VARCHAR(100),
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
