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
