-- Migration: Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Initialize chatbot_enabled setting
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('chatbot_enabled', 'false', 'Enable/Disable the AI Guide Chatbot globally')
ON DUPLICATE KEY UPDATE description = VALUES(description);
