const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray } = require('../helpers');

// GET /api/settings
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM system_settings');
    // Convert to a simple key-value object for easier frontend use
    const settings = {};
    rows.forEach(row => {
      settings[row.setting_key] = row.setting_value === 'true' ? true : row.setting_value === 'false' ? false : row.setting_value;
    });
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/settings
router.put('/', authenticate, adminOnly, async (req, res) => {
  try {
    const updates = req.body; // Expecting { key: value }
    
    for (const [key, value] of Object.entries(updates)) {
      await pool.execute(
        `INSERT INTO system_settings (setting_key, setting_value) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE setting_value = ?`,
        [key, String(value), String(value)]
      );
    }

    res.json({ message: 'Cập nhật cài đặt thành công' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
