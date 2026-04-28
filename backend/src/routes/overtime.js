const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly, isManagerLevel, getDeptEmployeeIds } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/overtime — filter: status, employeeId
router.get('/', authenticate, async (req, res) => {
  try {
    let where = `WHERE 1=1`;
    const params = [];

    if (req.user.role === 'admin') {
      // Admin sees all
      if (req.query.employeeId) {
        params.push(req.query.employeeId);
        where += ` AND employee_id = ?`;
      }
    } else if (isManagerLevel(req)) {
      // Manager sees department OT
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (deptIds.length > 0) {
        where += ` AND employee_id IN (${deptIds.map(() => '?').join(',')})`;
        params.push(...deptIds);
      } else {
        params.push(req.user.employeeId);
        where += ` AND employee_id = ?`;
      }
    } else {
      // Employee sees own only
      params.push(req.user.employeeId);
      where += ` AND employee_id = ?`;
    }

    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND status = ?`;
    }

    if (req.query.date) {
      params.push(req.query.date);
      where += ` AND date = ?`;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM ot_requests ${where}`, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await pool.execute(`SELECT * FROM ot_requests ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ data: toCamelCaseArray(rows), pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error('Get overtime error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/overtime
router.post('/', authenticate, async (req, res) => {
  try {
    const { employeeId, employeeName, date, shiftId, startTime, endTime, hours, multiplier, reason } = req.body;
    const id = req.body.id || uuidv4();
    const empId = employeeId || req.user.employeeId;

    // Managers can create OT for department employees; others only for self
    if (req.user.role !== 'admin' && empId !== req.user.employeeId) {
      if (!isManagerLevel(req)) {
        return res.status(403).json({ error: 'Chỉ được đăng ký OT của chính mình' });
      }
      // Verify target is in same department
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(empId)) {
        return res.status(403).json({ error: 'Nhân viên không thuộc phòng ban của bạn' });
      }
    }

    // Validate OT time does not overlap with the employee's assigned shift(s) for that day
    if (date && startTime && endTime) {
      const dayOfWeek = new Date(date + 'T12:00:00+07:00').getDay();
      const [shiftRows] = await pool.execute(
        `SELECT s.name AS shift_name, s.start_time, s.end_time FROM shift_assignments sa
         JOIN shifts s ON sa.shift_id = s.id
         WHERE sa.employee_id = ? AND sa.day_of_week = ?
           AND sa.effective_from <= ?
           AND (sa.effective_to IS NULL OR sa.effective_to >= ?)`,
        [empId, dayOfWeek, date, date]
      );

      if (shiftRows.length > 0) {
        // Convert times to minutes for comparison
        const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
        const otStart = toMin(startTime);
        const otEnd = toMin(endTime);

        // Normalize overnight ranges: if end <= start, add 24*60 to end
        const normOtEnd = otEnd <= otStart ? otEnd + 1440 : otEnd;

        // Two intervals [s1,e1] and [s2,e2] overlap if max(s1,s2) < min(e1,e2)
        const overlaps = (s1, e1, s2, e2) => Math.max(s1, s2) < Math.min(e1, e2);

        for (const shift of shiftRows) {
          const shiftStart = toMin(shift.start_time);
          const shiftEnd = toMin(shift.end_time);
          const normShiftEnd = shiftEnd <= shiftStart ? shiftEnd + 1440 : shiftEnd;

          // Check overlap in both cyclic phases (shift intervals can be offset by 24h)
          const otOverlaps =
            overlaps(otStart, normOtEnd, shiftStart, normShiftEnd) ||
            overlaps(otStart + 1440, normOtEnd + 1440, shiftStart, normShiftEnd) ||
            overlaps(otStart, normOtEnd, shiftStart + 1440, normShiftEnd + 1440);

          if (otOverlaps) {
            const shiftLabel = shift.shift_name ? ` (${shift.shift_name})` : '';
            return res.status(400).json({
              error: `Giờ tăng ca (${startTime} - ${endTime}) bị trùng với ca làm việc${shiftLabel} (${shift.start_time} - ${shift.end_time}). OT phải nằm ngoài giờ ca.`
            });
          }
        }
      }
    }

    await pool.execute(
      `INSERT INTO ot_requests (id, employee_id, employee_name, date, shift_id, start_time, end_time, hours, multiplier, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, empId, employeeName || req.user.name, date, shiftId || null, startTime, endTime, hours, multiplier || 1.5, reason || null]
    );
    const [rows] = await pool.execute('SELECT * FROM ot_requests WHERE id = ?', [id]);

    await logAudit({
      action: 'ot-request',
      performedBy: req.user.name,
      targetEmployee: employeeName || req.user.name,
      details: `Yêu cầu OT ngày ${date}: ${startTime} - ${endTime} (${hours}h)`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create OT request error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/overtime/:id — approve/reject (admin + managers level ≤3)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status phải là approved hoặc rejected' });
    }

    // Must be admin or manager
    if (req.user.role !== 'admin' && !isManagerLevel(req)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới có quyền duyệt OT' });
    }

    // If manager, verify OT belongs to department employee
    if (req.user.role !== 'admin') {
      const [otRows] = await pool.execute('SELECT employee_id FROM ot_requests WHERE id = ?', [req.params.id]);
      if (otRows.length === 0) return res.status(404).json({ error: 'Không tìm thấy yêu cầu OT' });
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(otRows[0].employee_id)) {
        return res.status(403).json({ error: 'Không có quyền duyệt OT của nhân viên ngoài phòng ban' });
      }
    }

    await pool.execute(
      `UPDATE ot_requests SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [status, req.user.name, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM ot_requests WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy yêu cầu OT' });

    const action = status === 'approved' ? 'ot-approve' : 'ot-reject';
    await logAudit({
      action,
      performedBy: req.user.name,
      targetEmployee: rows[0].employee_name,
      details: `${status === 'approved' ? 'Duyệt' : 'Từ chối'} OT ngày ${rows[0].date} cho ${rows[0].employee_name}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update OT request error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/overtime/check-auto-reject — Auto-reject pending OT requests after 24 hours
router.post('/check-auto-reject', authenticate, adminOnly, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE ot_requests
       SET status = 'auto-rejected', auto_rejection_reason = 'Tự động từ chối vì quá 24h chưa được duyệt'
       WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      []
    );

    res.json({
      message: 'Kiểm tra và tự động từ chối thành công',
      updatedCount: result.affectedRows
    });
  } catch (err) {
    console.error('Auto-reject OT error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
