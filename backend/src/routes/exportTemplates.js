const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOrSalaryRole } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray } = require('../helpers');

// GET /api/export-templates
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM export_templates ORDER BY is_default DESC, name ASC'
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get export templates error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/export-templates/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM export_templates WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mẫu' });
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Get export template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/export-templates
router.post('/', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    const { name, description, columnConfig } = req.body;
    if (!name || !columnConfig) return res.status(400).json({ error: 'Thiếu tên hoặc cấu hình cột' });

    const id = uuidv4();
    const configStr = typeof columnConfig === 'string' ? columnConfig : JSON.stringify(columnConfig);

    await pool.execute(
      'INSERT INTO export_templates (id, name, description, column_config, created_by) VALUES (?, ?, ?, ?, ?)',
      [id, name, description || '', configStr, req.user.id]
    );

    const [rows] = await pool.execute('SELECT * FROM export_templates WHERE id = ?', [id]);
    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create export template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/export-templates/:id
router.put('/:id', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    const { name, description, columnConfig } = req.body;
    const configStr = columnConfig
      ? (typeof columnConfig === 'string' ? columnConfig : JSON.stringify(columnConfig))
      : undefined;

    const sets = [];
    const params = [];
    if (name) { sets.push('name = ?'); params.push(name); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (configStr) { sets.push('column_config = ?'); params.push(configStr); }

    if (sets.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật' });

    params.push(req.params.id);
    await pool.execute(`UPDATE export_templates SET ${sets.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.execute('SELECT * FROM export_templates WHERE id = ?', [req.params.id]);
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update export template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/export-templates/:id
router.delete('/:id', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    // Don't allow deleting default presets
    const [check] = await pool.execute('SELECT is_default FROM export_templates WHERE id = ?', [req.params.id]);
    if (check.length > 0 && check[0].is_default) {
      return res.status(400).json({ error: 'Không thể xóa mẫu mặc định' });
    }
    await pool.execute('DELETE FROM export_templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa mẫu xuất' });
  } catch (err) {
    console.error('Delete export template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/export-templates/:id/set-default
router.put('/:id/set-default', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    // Clear all defaults
    await pool.execute('UPDATE export_templates SET is_default = 0');
    // Set this one as default
    await pool.execute('UPDATE export_templates SET is_default = 1 WHERE id = ?', [req.params.id]);
    const [rows] = await pool.execute('SELECT * FROM export_templates WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mẫu' });
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Set default template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
