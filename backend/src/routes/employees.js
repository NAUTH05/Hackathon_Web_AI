const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { authenticate, adminOnly, canCreateEmployee } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

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
      ${where}
    `;

    // Count total
    const [countResult] = await pool.execute(`SELECT COUNT(*) AS total ${baseQuery}`, params);
    const total = countResult[0].total;

    // Fetch page
    const [rows] = await pool.execute(
      `SELECT e.*, d.name AS department ${baseQuery} ${orderClause} LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      data: toCamelCaseArray(rows),
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
    const result = rows.map(r => ({
      id: r.id,
      name: r.name,
      employeeCode: r.employee_code,
      faceDescriptor: r.face_descriptor ? Array.from(new Float32Array(r.face_descriptor.buffer, r.face_descriptor.byteOffset, r.face_descriptor.byteLength / 4)) : null,
      faceImage: r.face_image,
    }));
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
    res.json(toCamelCase(rows[0]));
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

    await pool.execute(
      `UPDATE employees SET
        name = COALESCE(?, name),
        employee_code = COALESCE(?, employee_code),
        department_id = COALESCE(?, department_id),
        position = COALESCE(?, position),
        role_level = COALESCE(?, role_level),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        avatar = COALESCE(?, avatar),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, employeeCode, departmentId, position, roleLevel, email, phone, avatar, isActive, req.params.id]
    );

    const [rows] = await pool.execute('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });

    await logAudit({
      action: 'update-employee',
      performedBy: req.user.name,
      targetEmployee: rows[0].name,
      details: `Cập nhật thông tin nhân viên ${rows[0].name}`,
    });

    const [emp] = await pool.execute(
      `SELECT e.*, d.name AS department FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?`,
      [req.params.id]
    );
    res.json(toCamelCase(emp[0]));
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

// POST /api/employees/:id/face — save face descriptor + face image to disk
router.post('/:id/face', authenticate, adminOnly, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { faceDescriptor, faceImage } = req.body;

    // Convert float array to Buffer for BLOB storage
    let descriptorBuffer = null;
    if (faceDescriptor && Array.isArray(faceDescriptor)) {
      const floatArray = new Float32Array(faceDescriptor);
      descriptorBuffer = Buffer.from(floatArray.buffer);
    }

    // Save base64 image to disk instead of storing in DB
    let faceImageUrl = null;
    if (faceImage && typeof faceImage === 'string' && faceImage.startsWith('data:image')) {
      const base64Data = faceImage.replace(/^data:image\/\w+;base64,/, '');
      const facesDir = path.join(__dirname, '..', '..', 'uploads', 'faces');
      if (!fs.existsSync(facesDir)) fs.mkdirSync(facesDir, { recursive: true });
      const filePath = path.join(facesDir, `${req.params.id}.jpg`);
      fs.writeFileSync(filePath, base64Data, 'base64');
      faceImageUrl = `/uploads/faces/${req.params.id}.jpg`;
    } else if (faceImage && !faceImage.startsWith('data:image')) {
      // Already a URL path — keep as is
      faceImageUrl = faceImage;
    }

    await pool.execute(
      `UPDATE employees SET face_descriptor = ?, face_image = ? WHERE id = ?`,
      [descriptorBuffer, faceImageUrl, req.params.id]
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
