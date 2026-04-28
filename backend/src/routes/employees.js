const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { authenticate, adminOnly, canCreateEmployee } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit, deleteAvatarFile } = require('../helpers');

// GET /api/employees — list with pagination, filters, sorting
router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    let where = ' WHERE 1=1';
    const params = [];

    // Filter: department
    if (req.query.department) {
      params.push(req.query.department);
      where += ' AND d.name = ?';
    }

    // Filter: isActive
    if (req.query.isActive !== undefined) {
      params.push(req.query.isActive === 'true' ? 1 : 0);
      where += ' AND e.is_active = ?';
    }

    // Filter: roleLevel
    if (req.query.roleLevel) {
      params.push(parseInt(req.query.roleLevel));
      where += ' AND e.role_level = ?';
    }

    // Filter: position (partial match)
    if (req.query.position) {
      params.push(`%${req.query.position}%`);
      where += ' AND e.position LIKE ?';
    }

    // Filter: search (name or employee_code)
    if (req.query.search) {
      params.push(`%${req.query.search}%`, `%${req.query.search}%`);
      where += ' AND (e.name LIKE ? OR e.employee_code LIKE ?)';
    }

    // Non-admin users only see active employees
    if (req.user.role !== 'admin') {
      where += ' AND e.is_active = 1';
    }

    // Managers (role_level <= 3) can only see employees in their department
    if (req.user.role !== 'admin' && req.user.roleLevel && req.user.roleLevel <= 3) {
      params.push(req.user.department);
      where += ' AND d.name = ?';
    }

    // Sorting
    const sortField = req.query.sortBy || 'created_at';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    const allowedSort = { employee_code: 'e.employee_code', is_active: 'e.is_active', created_at: 'e.created_at', name: 'e.name', role_level: 'e.role_level' };
    const orderCol = allowedSort[sortField] || 'e.created_at';
    const orderClause = ` ORDER BY ${orderCol} ${sortDir}`;

    const baseQuery = `
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON u.employee_id = e.id
      ${where}
    `;

    // Count total
    const [countResult] = await pool.execute(`SELECT COUNT(*) AS total ${baseQuery}`, params);
    const total = countResult[0].total;

    // Fetch page — COALESCE users.avatar over employees.avatar so profile changes propagate immediately
    const [rows] = await pool.execute(
      `SELECT e.*, d.name AS department, COALESCE(u.avatar, e.avatar) AS avatar ${baseQuery} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      data: rows.map(r => {
        const employee = toCamelCase(r);
        if (r.face_descriptor) {
          try {
            const buffer = Buffer.from(r.face_descriptor);
            const floatArray = [];
            for (let i = 0; i < buffer.length; i += 4) {
              floatArray.push(buffer.readFloatLE(i));
            }
            employee.faceDescriptor = floatArray;
          } catch (e) {
            console.error(`List descriptor error for ${r.employee_code}:`, e.message);
            employee.faceDescriptor = null;
          }
        }
        return employee;
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Get employees error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/employees/face-descriptors — all face descriptors for recognition
router.get('/face-descriptors', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, employee_code, face_descriptor, face_image
       FROM employees
       WHERE face_descriptor IS NOT NULL AND is_active = 1`
    );
    const result = rows.map(r => {
      let descriptor = null;
      if (r.face_descriptor) {
        try {
          const buffer = Buffer.from(r.face_descriptor);
          const floatArray = [];
          for (let i = 0; i < buffer.length; i += 4) {
            floatArray.push(buffer.readFloatLE(i));
          }
          descriptor = floatArray;
        } catch (e) {
          console.error(`Invalid descriptor for ${r.employee_code}:`, e.message);
        }
      }
      return {
        id: r.id,
        name: r.name,
        employeeCode: r.employee_code,
        faceDescriptor: descriptor,
        faceImage: r.face_image,
      };
    });
    res.json(result);
  } catch (err) {
    console.error('Get face descriptors error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/employees/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.*, d.name AS department
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    const employee = toCamelCase(rows[0]);

    // Explicitly format faceDescriptor as number array for frontend compatibility
    if (rows[0].face_descriptor) {
      try {
        const buffer = Buffer.from(rows[0].face_descriptor);
        const floatArray = [];
        for (let i = 0; i < buffer.length; i += 4) {
          floatArray.push(buffer.readFloatLE(i));
        }
        employee.faceDescriptor = floatArray;
      } catch (e) {
        console.error('Descriptor parse error:', e.message);
        employee.faceDescriptor = null;
      }
    }

    // Include faceImage for display in edit form
    if (rows[0].face_image) {
      employee.faceImage = rows[0].face_image;
    }

    res.json(employee);
  } catch (err) {
    console.error('Get employee error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/employees
router.post('/', authenticate, canCreateEmployee, async (req, res) => {
  try {
    const { name, employeeCode, departmentId, position, roleLevel, email, phone, avatar, username, password } = req.body;
    const id = req.body.id || uuidv4();
    const effectiveRoleLevel = roleLevel || 5;

    await pool.execute(
      `INSERT INTO employees (id, name, employee_code, department_id, position, role_level, email, phone, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, employeeCode, departmentId || null, position || null, effectiveRoleLevel, email || null, phone || null, avatar || null]
    );

    // Tự động tạo tài khoản đăng nhập cho nhân viên
    // username = phần trước @ của email (nếu có), không có email thì dùng employeeCode
    // password mặc định = 123456
    const loginUsername = username || (email ? email.split('@')[0] : employeeCode);
    const loginPassword = password || '123456';
    const [existingUser] = await pool.execute('SELECT id FROM users WHERE username = ?', [loginUsername]);
    if (existingUser.length === 0) {
      const userId = uuidv4();
      const passwordHash = await bcrypt.hash(loginPassword, 10);
      // Lấy tên phòng ban để lưu vào users
      let departmentName = null;
      if (departmentId) {
        const [deptRows] = await pool.execute('SELECT name FROM departments WHERE id = ?', [departmentId]);
        if (deptRows.length > 0) departmentName = deptRows[0].name;
      }
      await pool.execute(
        `INSERT INTO users (id, employee_id, username, password_hash, name, role, role_level, department, avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, id, loginUsername, passwordHash, name, effectiveRoleLevel <= 1 ? 'admin' : 'user', effectiveRoleLevel, departmentName, avatar || null]
      );
    }

    await logAudit({
      action: 'create-employee',
      performedBy: req.user.name,
      targetEmployee: name,
      details: `Tạo nhân viên ${name} (${employeeCode}), tài khoản: ${loginUsername}`,
    });

    // Return with department name
    const [emp] = await pool.execute(
      `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [id]
    );
    res.status(201).json({ ...toCamelCase(emp[0]), defaultUsername: loginUsername });
  } catch (err) {
    console.error('Create employee error:', err);
    if (err.errno === 1062) {
      return res.status(409).json({ error: 'Mã nhân viên hoặc email đã tồn tại' });
    }
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/employees/:id
router.put('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const { name, employeeCode, departmentId, position, roleLevel, email, phone, avatar, isActive } = req.body;

    // --- Security: role-level hierarchy checks ---
    // Fetch the target employee's current role_level
    const [targetRows] = await pool.execute(
      'SELECT e.role_level, u.id AS user_id FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.id = ?',
      [req.params.id]
    );
    if (targetRows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    const targetRoleLevel = targetRows[0].role_level;
    const editorRoleLevel = req.user.roleLevel || 1;

    // Issue 5: Only allow editing employees whose role_level is strictly higher (numerically larger = lower rank)
    // Exception: allow self-editing (editing your own employee record)
    const isSelf = targetRows[0].user_id === req.user.id;
    if (!isSelf && editorRoleLevel >= targetRoleLevel) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa nhân viên có cùng hoặc cao hơn cấp bậc của mình' });
    }

    // Issue 3: Prevent self-downgrade — cannot lower their own role_level
    if (isSelf && roleLevel != null && Number(roleLevel) > editorRoleLevel) {
      return res.status(403).json({ error: 'Bạn không được tự hạ cấp bậc của chính mình' });
    }

    // Issue 3: Prevent elevating anyone to a level equal/higher than yourself (unless you're level 1)
    if (!isSelf && roleLevel != null && Number(roleLevel) < editorRoleLevel && editorRoleLevel > 1) {
      return res.status(403).json({ error: 'Bạn không thể nâng cấp nhân viên lên cấp bậc bằng hoặc cao hơn của mình' });
    }


    // If avatar is explicitly sent as null → clear it; if omitted → keep existing via COALESCE
    const avatarInBody = 'avatar' in req.body;
    const avatarSql = avatarInBody ? 'avatar = ?' : 'avatar = COALESCE(?, avatar)';
    const avatarVal = avatarInBody ? (avatar || null) : null;

    // Fetch old avatar URL before updating (so we can delete it from disk)
    const [oldRows] = await pool.execute('SELECT avatar FROM employees WHERE id = ?', [req.params.id]);
    const oldAvatarUrl = oldRows[0]?.avatar || null;

    await pool.execute(
      `UPDATE employees SET
        name = COALESCE(?, name),
        employee_code = COALESCE(?, employee_code),
        department_id = COALESCE(?, department_id),
        position = COALESCE(?, position),
        role_level = COALESCE(?, role_level),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        ${avatarSql},
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name ?? null,
        employeeCode ?? null,
        departmentId || null,
        position ?? null,
        roleLevel != null ? Number(roleLevel) : null,
        email || null,
        phone ?? null,
        avatarVal,
        isActive != null ? (isActive ? 1 : 0) : null,
        req.params.id,
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    // Sync users table (name, role_level, department, avatar)
    const [emp] = await pool.execute(
      `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [req.params.id]
    );
    const updatedEmp = emp[0];
    await pool.execute(
      `UPDATE users SET
        name = ?,
        role_level = ?,
        department = ?,
        avatar = ?,
        role = ?
       WHERE employee_id = ?`,
      [
        updatedEmp.name,
        updatedEmp.role_level,
        updatedEmp.department || null,
        updatedEmp.avatar || null,
        updatedEmp.role_level <= 1 ? 'admin' : 'user',
        req.params.id,
      ]
    );

    await logAudit({
      action: 'update-employee',
      performedBy: req.user.name,
      targetEmployee: rows[0].name,
      details: `Cập nhật thông tin nhân viên ${rows[0].name}`,
    });

    // Xóa file avatar cũ trên disk nếu avatar đã thay đổi
    if (avatarInBody && oldAvatarUrl && oldAvatarUrl !== (updatedEmp.avatar || null)) {
      deleteAvatarFile(oldAvatarUrl);
    }

    res.json(toCamelCase(updatedEmp));
  } catch (err) {
    console.error('Update employee error:', err);
    if (err.errno === 1062) {
      return res.status(409).json({ error: 'Mã nhân viên hoặc email đã tồn tại' });
    }
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/employees/:id — soft delete
router.delete('/:id', authenticate, adminOnly, async (req, res) => {
  try {
    const [before] = await pool.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (before.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    await pool.execute(`UPDATE employees SET is_active = 0 WHERE id = ?`, [req.params.id]);

    await logAudit({
      action: 'delete-employee',
      performedBy: req.user.name,
      targetEmployee: before[0].name,
      details: `Vô hiệu hoá nhân viên ${before[0].name}`,
    });

    res.json({ message: 'Đã vô hiệu hoá nhân viên' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/employees/:id/face — save face descriptor + face image
// Admin có thể cập nhật cho bất kỳ ai; user thường chỉ được cập nhật của chính mình
router.post('/:id/face', authenticate, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || (req.user.roleLevel || 5) <= 2;
    // isSelf: so sánh qua JWT trước, fallback query DB nếu JWT không có employeeId
    let isSelf = req.user.employeeId === req.params.id;
    if (!isSelf && !isAdmin) {
      // Fallback: kiểm tra qua DB xem user có liên kết với employee này không
      const [selfCheck] = await pool.execute(
        'SELECT id FROM users WHERE id = ? AND employee_id = ?',
        [req.user.id, req.params.id]
      );
      isSelf = selfCheck.length > 0;
    }
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Bạn chỉ có thể cập nhật khuôn mặt của chính mình' });
    }

    const { faceDescriptor, faceImage } = req.body;

    // Convert float array to Buffer for BLOB storage
    let descriptorBuffer = null;
    if (faceDescriptor && Array.isArray(faceDescriptor)) {
      const floatArray = new Float32Array(faceDescriptor);
      descriptorBuffer = Buffer.from(floatArray.buffer);
    }

    await pool.execute(
      `UPDATE employees SET face_descriptor = ?, face_image = ? WHERE id = ?`,
      [descriptorBuffer, faceImage || null, req.params.id]
    );

    const [rows] = await pool.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    await logAudit({
      action: 'update-face',
      performedBy: req.user.name,
      targetEmployee: rows[0].name,
      details: `Cập nhật khuôn mặt cho ${rows[0].name}`,
    });

    res.json({ message: 'Đã lưu khuôn mặt thành công' });
  } catch (err) {
    console.error('Save face error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
