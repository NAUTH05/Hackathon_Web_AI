-- Create user_roles table for multi-role support
CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(50),
    role_name VARCHAR(50) NOT NULL COMMENT 'salary_manager, etc.',
    granted_by VARCHAR(50),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Grant salary_manager role to existing admin users
-- (run this to avoid breaking existing admin workflow)
INSERT IGNORE INTO user_roles (user_id, role_name)
SELECT id, 'salary_manager' FROM users WHERE role = 'admin';

-- Create daily_timesheet_locks table
CREATE TABLE IF NOT EXISTS daily_timesheet_locks (
    date DATE PRIMARY KEY,
    locked_by VARCHAR(100),
    locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
