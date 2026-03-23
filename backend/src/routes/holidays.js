const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray } = require('../helpers');

// GET /api/holidays
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM holidays ORDER BY date');
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get holidays error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/holidays
router.post('/', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, date, type } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO holidays (id, name, date, type)
       VALUES (?, ?, ?, ?)`,
      [id, name, date, type || 'public']
    );
    const [rows] = await pool.execute('SELECT * FROM holidays WHERE id = ?', [id]);

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create holiday error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/holidays/:id
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM holidays WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ngày lễ' });
    await pool.execute('DELETE FROM holidays WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa ngày lễ' });
  } catch (err) {
    console.error('Delete holiday error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
