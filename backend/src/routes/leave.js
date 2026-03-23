const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly, isManagerLevel, getDeptEmployeeIds } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/leave
router.get('/', authenticate, async (req, res) => {
  try {
    let where = `WHERE 1=1`;
    const params = [];

    if (req.user.role === 'admin') {
      if (req.query.employeeId) {
        params.push(req.query.employeeId);
        where += ` AND employee_id = ?`;
      }
    } else if (isManagerLevel(req)) {
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (deptIds.length > 0) {
        where += ` AND employee_id IN (${deptIds.map(() => '?').join(',')})`;
        params.push(...deptIds);
      } else {
        params.push(req.user.employeeId);
        where += ` AND employee_id = ?`;
      }
    } else {
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

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM leave_requests ${where}`, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await pool.execute(`SELECT * FROM leave_requests ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ data: toCamelCaseArray(rows), pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error('Get leave error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/leave
router.post('/', authenticate, async (req, res) => {
  try {
    const { employeeId, employeeName, startDate, endDate, type, reason, hours } = req.body;
    const id = req.body.id || uuidv4();
    const empId = employeeId || req.user.employeeId;

    // Managers can create leave for department employees
    if (req.user.role !== 'admin' && empId !== req.user.employeeId) {
      if (!isManagerLevel(req)) {
        return res.status(403).json({ error: 'Chỉ được tạo đơn nghỉ phép của chính mình' });
      }
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(empId)) {
        return res.status(403).json({ error: 'Nhân viên không thuộc phòng ban của bạn' });
      }
    }




    // For maternity leave, lock end_date to 6 months from start_date
    let finalEndDate = endDate;
    if (type === 'maternity' && startDate) {
      const start = new Date(startDate);
      const end = new Date(start.getFullYear(), start.getMonth() + 6, start.getDate());
      finalEndDate = end.toISOString().split('T')[0];
    }

    const [result] = await pool.execute(
      `INSERT INTO leave_requests (id, employee_id, employee_name, start_date, end_date, type, reason, hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, empId, employeeName || req.user.name, startDate, finalEndDate, type, reason || null, type === 'hourly' ? hours : null]
    );
    const [rows] = await pool.execute('SELECT * FROM leave_requests WHERE id = ?', [id]);

    await logAudit({
      action: 'leave-request',
      performedBy: req.user.name,
      targetEmployee: employeeName || req.user.name,
      details: `Yêu cầu nghỉ phép ${type} từ ${startDate} đến ${finalEndDate}${type === 'hourly' ? ` (${hours}h)` : ''}`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create leave error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/leave/:id — approve/reject (admin + managers)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status phải là approved hoặc rejected' });
    }

    if (req.user.role !== 'admin' && !isManagerLevel(req)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới có quyền duyệt nghỉ phép' });
    }

    // If manager, check department scope
    if (req.user.role !== 'admin') {
      const [leaveRows] = await pool.execute('SELECT employee_id FROM leave_requests WHERE id = ?', [req.params.id]);
      if (leaveRows.length === 0) return res.status(404).json({ error: 'Không tìm thấy đơn nghỉ phép' });
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(leaveRows[0].employee_id)) {
        return res.status(403).json({ error: 'Không có quyền duyệt đơn nghỉ phép ngoài phòng ban' });
      }
    }

    await pool.execute(
      `UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ?`,
      [status, req.user.name, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM leave_requests WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy đơn nghỉ phép' });

    await logAudit({
      action: status === 'approved' ? 'leave-approve' : 'leave-reject',
      performedBy: req.user.name,
      targetEmployee: rows[0].employee_name,
      details: `${status === 'approved' ? 'Duyệt' : 'Từ chối'} nghỉ phép cho ${rows[0].employee_name}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update leave error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/leave/check-auto-reject — Auto-reject pending leave requests after 24 hours
router.post('/check-auto-reject', authenticate, adminOnly, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE leave_requests
       SET status = 'rejected'
       WHERE status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      []
    );

    res.json({
      message: 'Kiểm tra và tự động từ chối thành công',
      updatedCount: result.affectedRows
    });
  } catch (err) {
    console.error('Auto-reject leave error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
