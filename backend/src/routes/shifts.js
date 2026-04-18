const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireManager } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/shifts
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM shifts ORDER BY start_time');
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get shifts error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/shifts
router.post('/', authenticate, requireManager, async (req, res) => {
  try {
    const { name, startTime, endTime, color, allowLateMinutes, allowEarlyLeaveMinutes, breakStartTime, breakEndTime, isOvernight } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO shifts (id, name, start_time, end_time, color, allow_late_minutes, allow_early_leave_minutes, break_start_time, break_end_time, is_overnight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, startTime, endTime, color || null, allowLateMinutes || 15, allowEarlyLeaveMinutes || 10, breakStartTime || null, breakEndTime || null, isOvernight ? 1 : 0]
    );
    const [rows] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [id]);

    await logAudit({
      action: 'create-shift',
      performedBy: req.user.name,
      details: `Tạo ca ${name} (${startTime} - ${endTime})`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create shift error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/shifts/:id
router.put('/:id', authenticate, requireManager, async (req, res) => {
  try {
    const { name, startTime, endTime, color, allowLateMinutes, allowEarlyLeaveMinutes, breakStartTime, breakEndTime, isOvernight } = req.body;

    await pool.execute(
      `UPDATE shifts SET
        name = COALESCE(?, name),
        start_time = COALESCE(?, start_time),
        end_time = COALESCE(?, end_time),
        color = COALESCE(?, color),
        allow_late_minutes = COALESCE(?, allow_late_minutes),
        allow_early_leave_minutes = COALESCE(?, allow_early_leave_minutes),
        break_start_time = COALESCE(?, break_start_time),
        break_end_time = COALESCE(?, break_end_time),
        is_overnight = COALESCE(?, is_overnight)
       WHERE id = ?`,
      [name ?? null, startTime ?? null, endTime ?? null, color ?? null, allowLateMinutes ?? null, allowEarlyLeaveMinutes ?? null, breakStartTime ?? null, breakEndTime ?? null, isOvernight ?? null, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ca' });

    await logAudit({
      action: 'update-shift',
      performedBy: req.user.name,
      details: `Cập nhật ca ${rows[0].name}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update shift error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/shifts/:id
router.delete('/:id', authenticate, requireManager, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy ca' });

    await pool.execute('DELETE FROM shifts WHERE id = ?', [req.params.id]);

    await logAudit({
      action: 'delete-shift',
      performedBy: req.user.name,
      details: `Xóa ca ${rows[0].name}`,
    });

    res.json({ message: 'Đã xóa ca' });
  } catch (err) {
    console.error('Delete shift error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
