const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly, isManagerLevel, getDeptEmployeeIds } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/penalties
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
      // Managers see department penalties
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (deptIds.length > 0) {
        where += ` AND employee_id IN (${deptIds.map(() => '?').join(',')})`;
        params.push(...deptIds);
      } else {
        params.push(req.user.employeeId);
        where += ` AND employee_id = ?`;
      }
    } else if (isManagerLevel(req, 4)) {
      // Team lead sees department penalties
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

    // Server-side filters
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND status = ?`;
    }
    if (req.query.type) {
      params.push(req.query.type);
      where += ` AND type = ?`;
    }
    if (req.query.employeeSearch) {
      params.push(`%${req.query.employeeSearch}%`);
      where += ` AND employee_name LIKE ?`;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM penalties ${where}`, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await pool.execute(`SELECT * FROM penalties ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ data: toCamelCaseArray(rows), pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error('Get penalties error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/penalties — admin + managers (level ≤3)
router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !isManagerLevel(req)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới có quyền tạo vi phạm' });
    }

    const { employeeId, employeeName, date, type, reason, amount, description } = req.body;
    const id = req.body.id || uuidv4();

    // If manager, verify employee is in department
    if (req.user.role !== 'admin') {
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(employeeId)) {
        return res.status(403).json({ error: 'Nhân viên không thuộc phòng ban của bạn' });
      }
    }

    await pool.execute(
      `INSERT INTO penalties (id, employee_id, employee_name, date, type, reason, amount, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, employeeId, employeeName, date, type, reason, amount || 0, description || null]
    );
    const [rows] = await pool.execute('SELECT * FROM penalties WHERE id = ?', [id]);

    await logAudit({
      action: 'penalty',
      performedBy: req.user.name,
      targetEmployee: employeeName,
      details: `Tạo phạt ${type} cho ${employeeName}: ${reason}`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create penalty error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/penalties/resolve-all — bulk resolve (admin + managers)
// MUST be before /:id to avoid route clash
router.put('/resolve-all', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !isManagerLevel(req)) {
      return res.status(403).json({ error: 'Không có quyền' });
    }

    let where = `WHERE status != 'resolved'`;
    const params = [];

    if (req.user.role !== 'admin') {
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (deptIds.length > 0) {
        where += ` AND employee_id IN (${deptIds.map(() => '?').join(',')})`;
        params.push(...deptIds);
      } else {
        return res.json({ updated: 0 });
      }
    }

    // Optional filters from body
    if (req.body.status) { where += ` AND status = ?`; params.push(req.body.status); }
    if (req.body.type) { where += ` AND type = ?`; params.push(req.body.type); }

    const [result] = await pool.execute(`UPDATE penalties SET status = 'resolved' ${where}`, params);

    await logAudit({
      action: 'penalty',
      performedBy: req.user.name,
      targetEmployee: 'all',
      details: `Giải quyết hàng loạt ${result.affectedRows} vi phạm`,
    });

    res.json({ updated: result.affectedRows });
  } catch (err) {
    console.error('Resolve-all penalties error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/penalties/cleanup — delete old resolved penalties (admin only)
// MUST be before /:id to avoid route clash
router.delete('/cleanup', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ admin mới có quyền dọn dẹp' });
    }

    const days = Math.max(30, parseInt(req.query.days) || 365);
    const [result] = await pool.execute(
      `DELETE FROM penalties WHERE status = 'resolved' AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    await logAudit({
      action: 'penalty',
      performedBy: req.user.name,
      targetEmployee: 'system',
      details: `Dọn dẹp ${result.affectedRows} vi phạm đã giải quyết (> ${days} ngày)`,
    });

    res.json({ deleted: result.affectedRows, days });
  } catch (err) {
    console.error('Cleanup penalties error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/penalties/:id — update (appeal, resolve)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status, appealReason } = req.body;

    // Non-admin/non-manager can only appeal their own penalties
    if (req.user.role !== 'admin' && !isManagerLevel(req)) {
      const [check] = await pool.execute('SELECT employee_id FROM penalties WHERE id = ?', [req.params.id]);
      if (check.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
      if (check[0].employee_id !== req.user.employeeId) {
        return res.status(403).json({ error: 'Không có quyền' });
      }
    }

    // If manager, verify department scope
    if (req.user.role !== 'admin' && isManagerLevel(req)) {
      const [check] = await pool.execute('SELECT employee_id FROM penalties WHERE id = ?', [req.params.id]);
      if (check.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(check[0].employee_id)) {
        return res.status(403).json({ error: 'Không có quyền xử lý vi phạm ngoài phòng ban' });
      }
    }

    await pool.execute(
      `UPDATE penalties SET
        status = COALESCE(?, status),
        appeal_reason = COALESCE(?, appeal_reason)
       WHERE id = ?`,
      [status ?? null, appealReason ?? null, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM penalties WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy phạt' });

    await logAudit({
      action: 'penalty',
      performedBy: req.user.name,
      targetEmployee: rows[0].employee_name,
      details: `Cập nhật phạt: status=${status || rows[0].status}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update penalty error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/penalties/:id — admin + managers
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !isManagerLevel(req)) {
      return res.status(403).json({ error: 'Chỉ quản lý mới có quyền xóa vi phạm' });
    }

    const [rows] = await pool.execute('SELECT * FROM penalties WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy phạt' });

    // If manager, check department scope
    if (req.user.role !== 'admin') {
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (!deptIds.includes(rows[0].employee_id)) {
        return res.status(403).json({ error: 'Không có quyền xóa vi phạm ngoài phòng ban' });
      }
    }

    await pool.execute('DELETE FROM penalties WHERE id = ?', [req.params.id]);

    await logAudit({
      action: 'penalty',
      performedBy: req.user.name,
      targetEmployee: rows[0].employee_name,
      details: `Xóa phạt cho ${rows[0].employee_name}`,
    });

    res.json({ message: 'Đã xóa phạt' });
  } catch (err) {
    console.error('Delete penalty error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
