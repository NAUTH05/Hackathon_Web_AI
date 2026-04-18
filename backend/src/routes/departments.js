const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly, requireLevel } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// Middleware: admin OR manager of the specific department
function adminOrDeptManager(req, res, next) {
  if (req.user.role === 'admin') return next();
  // Department managers (role_level <= 3) can manage their own department
  if (req.user.roleLevel && req.user.roleLevel <= 3) return next();
  return res.status(403).json({ error: 'Không có quyền truy cập' });
}

// GET /api/departments
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT d.*, e.name AS manager_name,
              (SELECT COUNT(*) FROM employees emp WHERE emp.department_id = d.id AND emp.is_active = 1) AS member_count
       FROM departments d
       LEFT JOIN employees e ON d.manager_id = e.id
       ORDER BY d.created_at DESC`
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get departments error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/departments
router.post('/', authenticate, requireLevel(2), async (req, res) => {
  try {
    const { name, description, managerId, parentId } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO departments (id, name, description, manager_id, parent_id)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, description || null, managerId || null, parentId || null]
    );
    const [rows] = await pool.execute(
      `SELECT d.*, e.name AS manager_name
       FROM departments d
       LEFT JOIN employees e ON d.manager_id = e.id
       WHERE d.id = ?`,
      [id]
    );

    await logAudit({
      action: 'create-department',
      performedBy: req.user.name,
      details: `Tạo phòng ban ${name}`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create department error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/departments/:id
router.put('/:id', authenticate, requireLevel(2), async (req, res) => {
  try {
    const { name, description, managerId, parentId } = req.body;

    // Build dynamic update to allow setting parentId to null
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
    if (managerId !== undefined) { updates.push('manager_id = ?'); params.push(managerId || null); }
    if (parentId !== undefined) { updates.push('parent_id = ?'); params.push(parentId || null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu cập nhật' });
    }

    params.push(req.params.id);
    await pool.execute(
      `UPDATE departments SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT d.*, e.name AS manager_name
       FROM departments d
       LEFT JOIN employees e ON d.manager_id = e.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy phòng ban' });

    await logAudit({
      action: 'update-department',
      performedBy: req.user.name,
      details: `Cập nhật phòng ban ${rows[0].name}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update department error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', authenticate, requireLevel(2), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM departments WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy phòng ban' });

    // Check for child departments
    const [children] = await pool.execute('SELECT COUNT(*) AS cnt FROM departments WHERE parent_id = ?', [req.params.id]);
    if (children[0].cnt > 0) {
      return res.status(400).json({ error: 'Phòng ban còn phòng ban con. Hãy xóa hoặc chuyển phòng ban con trước.' });
    }

    // Check for employees
    const [emps] = await pool.execute('SELECT COUNT(*) AS cnt FROM employees WHERE department_id = ? AND is_active = 1', [req.params.id]);
    if (emps[0].cnt > 0) {
      return res.status(400).json({ error: `Phòng ban còn ${emps[0].cnt} nhân viên. Hãy chuyển nhân viên trước khi xóa.` });
    }

    await pool.execute('DELETE FROM departments WHERE id = ?', [req.params.id]);

    await logAudit({
      action: 'delete-department',
      performedBy: req.user.name,
      details: `Xóa phòng ban ${rows[0].name}`,
    });

    res.json({ message: 'Đã xóa phòng ban' });
  } catch (err) {
    console.error('Delete department error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// =============================================
// MEMBER MANAGEMENT ENDPOINTS
// =============================================

// GET /api/departments/:id/members — paginated list of employees in department
router.get('/:id/members', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = ' WHERE e.department_id = ? AND e.is_active = 1';
    const params = [req.params.id];

    if (req.query.search) {
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
      where += ' AND (e.name LIKE ? OR e.employee_code LIKE ?)';
    }

    const baseQuery = `FROM employees e ${where}`;

    const [countResult] = await pool.execute(`SELECT COUNT(*) AS total ${baseQuery}`, params);
    const total = countResult[0].total;

    const [rows] = await pool.execute(
      `SELECT e.*, d.name AS department ${baseQuery.replace('FROM employees e', 'FROM employees e LEFT JOIN departments d ON e.department_id = d.id')} ORDER BY e.role_level ASC, e.name ASC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      data: toCamelCaseArray(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Get department members error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/departments/:id/add-member — add employee to department (with optional role)
router.post('/:id/add-member', authenticate, adminOrDeptManager, async (req, res) => {
  try {
    const { employeeId, roleLevel } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });

    // Check department exists
    const [dept] = await pool.execute('SELECT * FROM departments WHERE id = ?', [req.params.id]);
    if (dept.length === 0) return res.status(404).json({ error: 'Không tìm thấy phòng ban' });

    // Check employee exists
    const [emp] = await pool.execute('SELECT * FROM employees WHERE id = ? AND is_active = 1', [employeeId]);
    if (emp.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    // Update employee's department and optionally role_level
    const updates = ['department_id = ?'];
    const params = [req.params.id];

    if (roleLevel !== undefined && roleLevel >= 1 && roleLevel <= 5) {
      updates.push('role_level = ?');
      params.push(roleLevel);
    }

    params.push(employeeId);
    await pool.execute(
      `UPDATE employees SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Also update the user account if linked
    const [userRows] = await pool.execute('SELECT * FROM users WHERE employee_id = ?', [employeeId]);
    if (userRows.length > 0) {
      const userUpdates = ['department = ?'];
      const userParams = [dept[0].name];
      if (roleLevel !== undefined && roleLevel >= 1 && roleLevel <= 5) {
        userUpdates.push('role_level = ?');
        userParams.push(roleLevel);
        // If roleLevel is admin level, also update role
        if (roleLevel <= 2) {
          userUpdates.push("role = 'admin'");
        }
      }
      userParams.push(userRows[0].id);
      await pool.execute(
        `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`,
        userParams
      );
    }

    await logAudit({
      action: 'add-dept-member',
      performedBy: req.user.name,
      targetEmployee: emp[0].name,
      details: `Thêm ${emp[0].name} vào phòng ban ${dept[0].name}${roleLevel ? ` (role: ${roleLevel})` : ''}`,
    });

    const [result] = await pool.execute(
      `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [employeeId]
    );
    res.json(toCamelCase(result[0]));
  } catch (err) {
    console.error('Add department member error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/departments/:id/member-role — change role of a member in department
router.put('/:id/member-role', authenticate, adminOrDeptManager, async (req, res) => {
  try {
    const { employeeId, roleLevel } = req.body;
    if (!employeeId || !roleLevel) return res.status(400).json({ error: 'Thiếu employeeId hoặc roleLevel' });
    if (roleLevel < 1 || roleLevel > 5) return res.status(400).json({ error: 'roleLevel phải từ 1 đến 5' });

    // Verify employee is in this department
    const [emp] = await pool.execute(
      'SELECT * FROM employees WHERE id = ? AND department_id = ? AND is_active = 1',
      [employeeId, req.params.id]
    );
    if (emp.length === 0) return res.status(404).json({ error: 'Nhân viên không thuộc phòng ban này' });

    await pool.execute('UPDATE employees SET role_level = ? WHERE id = ?', [roleLevel, employeeId]);

    // Also update user account if linked
    const [userRows] = await pool.execute('SELECT * FROM users WHERE employee_id = ?', [employeeId]);
    if (userRows.length > 0) {
      await pool.execute('UPDATE users SET role_level = ? WHERE id = ?', [roleLevel, userRows[0].id]);
    }

    await logAudit({
      action: 'update-dept-role',
      performedBy: req.user.name,
      targetEmployee: emp[0].name,
      details: `Đổi role ${emp[0].name} thành level ${roleLevel}`,
    });

    const [result] = await pool.execute(
      `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [employeeId]
    );
    res.json(toCamelCase(result[0]));
  } catch (err) {
    console.error('Update member role error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/departments/:id/remove-member — remove employee from department
router.delete('/:id/remove-member', authenticate, adminOrDeptManager, async (req, res) => {
  try {
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });

    const [emp] = await pool.execute(
      'SELECT * FROM employees WHERE id = ? AND department_id = ? AND is_active = 1',
      [employeeId, req.params.id]
    );
    if (emp.length === 0) return res.status(404).json({ error: 'Nhân viên không thuộc phòng ban này' });

    const [dept] = await pool.execute('SELECT name FROM departments WHERE id = ?', [req.params.id]);

    // Set department_id to null, reset role to employee level
    await pool.execute('UPDATE employees SET department_id = NULL, role_level = 5 WHERE id = ?', [employeeId]);

    // Update user account
    const [userRows] = await pool.execute('SELECT * FROM users WHERE employee_id = ?', [employeeId]);
    if (userRows.length > 0) {
      await pool.execute("UPDATE users SET department = NULL, role_level = 5, role = 'user' WHERE id = ?", [userRows[0].id]);
    }

    // If this employee was the manager, clear manager_id
    await pool.execute('UPDATE departments SET manager_id = NULL WHERE id = ? AND manager_id = ?', [req.params.id, employeeId]);

    await logAudit({
      action: 'remove-dept-member',
      performedBy: req.user.name,
      targetEmployee: emp[0].name,
      details: `Gỡ ${emp[0].name} khỏi phòng ban ${dept[0]?.name || req.params.id}`,
    });

    res.json({ message: 'Đã gỡ nhân viên khỏi phòng ban' });
  } catch (err) {
    console.error('Remove department member error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
