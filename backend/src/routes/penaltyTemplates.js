const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray } = require('../helpers');

// GET /api/penalty-templates
router.get('/', authenticate, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM penalty_templates ORDER BY created_at DESC');
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get penalty templates error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/penalty-templates
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, type, reason, description, amount, isActive } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO penalty_templates (id, name, type, reason, description, amount, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, type, reason || null, description || null, amount || 0, isActive !== false ? 1 : 0]
    );
    const [rows] = await pool.execute('SELECT * FROM penalty_templates WHERE id = ?', [id]);

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create penalty template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/penalty-templates/:id
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, type, reason, description, amount, isActive } = req.body;

    await pool.execute(
      `UPDATE penalty_templates SET
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        reason = COALESCE(?, reason),
        description = COALESCE(?, description),
        amount = COALESCE(?, amount),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, type, reason, description, amount, isActive, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM penalty_templates WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mẫu phạt' });
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update penalty template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/penalty-templates/:id
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM penalty_templates WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mẫu phạt' });
    await pool.execute('DELETE FROM penalty_templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa mẫu phạt' });
  } catch (err) {
    console.error('Delete penalty template error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
