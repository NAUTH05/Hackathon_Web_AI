const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireManager, isManagerLevel, getDeptEmployeeIds } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/shift-assignments — filter: employeeId
router.get('/', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT sa.*, s.name AS shift_name, s.start_time AS shift_start_time, s.end_time AS shift_end_time,
             s.color AS shift_color, e.name AS employee_name
      FROM shift_assignments sa
      JOIN shifts s ON sa.shift_id = s.id
      JOIN employees e ON sa.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (req.query.employeeId) {
      params.push(req.query.employeeId);
      query += ` AND sa.employee_id = ?`;
    }

    query += ' ORDER BY sa.effective_from DESC';
    const [rows] = await pool.execute(query, params);
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get shift assignments error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/shift-assignments/employee/:employeeId
router.get('/employee/:employeeId', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT sa.*, s.name AS shift_name, s.start_time AS shift_start_time, s.end_time AS shift_end_time,
              s.color AS shift_color
       FROM shift_assignments sa
       JOIN shifts s ON sa.shift_id = s.id
       WHERE sa.employee_id = ?
       ORDER BY sa.day_of_week`,
      [req.params.employeeId]
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get employee shifts error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/shift-assignments (admin + managers level ≤3)
router.post('/', authenticate, requireManager, async (req, res) => {
  try {
    const { employeeId, shiftId, dayOfWeek, effectiveFrom, effectiveTo } = req.body;
    const id = req.body.id || uuidv4();

    // If manager, verify employee is in department
    if (req.user.role !== 'admin') {
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(employeeId)) {
        return res.status(403).json({ error: 'Nhân viên không thuộc phòng ban của bạn' });
      }
    }

    await pool.execute(
      `INSERT INTO shift_assignments (id, employee_id, shift_id, day_of_week, effective_from, effective_to)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, employeeId, shiftId, dayOfWeek, effectiveFrom, effectiveTo || null]
    );
    const [rows] = await pool.execute('SELECT * FROM shift_assignments WHERE id = ?', [id]);

    await logAudit({
      action: 'assign-shift',
      performedBy: req.user.name,
      details: `Phân ca cho nhân viên ${employeeId}`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create shift assignment error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/shift-assignments/:id (admin + managers)
router.delete('/:id', authenticate, requireManager, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM shift_assignments WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy phân ca' });

    // If manager, verify employee is in department
    if (req.user.role !== 'admin') {
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(rows[0].employee_id)) {
        return res.status(403).json({ error: 'Không có quyền xóa phân ca ngoài phòng ban' });
      }
    }

    await pool.execute('DELETE FROM shift_assignments WHERE id = ?', [req.params.id]);

    await logAudit({
      action: 'delete-shift-assignment',
      performedBy: req.user.name,
      details: `Xóa phân ca ${req.params.id}`,
    });

    res.json({ message: 'Đã xóa phân ca' });
  } catch (err) {
    console.error('Delete shift assignment error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
