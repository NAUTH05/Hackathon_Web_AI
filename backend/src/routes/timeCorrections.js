const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/time-corrections
router.get('/', authenticate, async (req, res) => {
  try {
    let query = `SELECT * FROM time_corrections WHERE 1=1`;
    const params = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.employeeId);
      query += ` AND employee_id = ?`;
    }

    if (req.query.status) {
      params.push(req.query.status);
      query += ` AND status = ?`;
    }

    query += ' ORDER BY requested_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get time corrections error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/time-corrections
router.post('/', authenticate, async (req, res) => {
  try {
    const { attendanceId, employeeId, employeeName, date, field, oldValue, newValue, reason } = req.body;
    const id = req.body.id || uuidv4();
    const empId = employeeId || req.user.employeeId;

    await pool.execute(
      `INSERT INTO time_corrections (id, attendance_id, employee_id, employee_name, date, field, old_value, new_value, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, attendanceId, empId, employeeName || req.user.name, date, field, oldValue, newValue, reason]
    );
    const [rows] = await pool.execute('SELECT * FROM time_corrections WHERE id = ?', [id]);

    await logAudit({
      action: 'correction',
      performedBy: req.user.name,
      targetEmployee: employeeName || req.user.name,
      details: `Yêu cầu sửa ${field} ngày ${date}`,
      oldValue,
      newValue,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create time correction error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/time-corrections/:id — approve/reject
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status phải là approved hoặc rejected' });
    }

    await pool.execute(
      `UPDATE time_corrections SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [status, req.user.name, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM time_corrections WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy yêu cầu sửa giờ' });

    const correction = rows[0];

    // If approved, update the attendance record
    if (status === 'approved' && correction.attendance_id) {
      const column = correction.field === 'checkInTime' ? 'check_in_time' : 'check_out_time';
      await pool.execute(
        `UPDATE attendance_records SET \`${column}\` = ? WHERE id = ?`,
        [correction.new_value, correction.attendance_id]
      );
    }

    await logAudit({
      action: 'correction',
      performedBy: req.user.name,
      targetEmployee: correction.employee_name,
      details: `${status === 'approved' ? 'Duyệt' : 'Từ chối'} sửa giờ cho ${correction.employee_name}`,
      oldValue: correction.old_value,
      newValue: correction.new_value,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update time correction error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
