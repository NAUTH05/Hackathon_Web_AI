const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticate, loadUserRoles } = require('../middleware/auth');
const { toCamelCase } = require('../helpers');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Thiếu username hoặc password' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    // Load additional roles
    const roles = await loadUserRoles(user.id);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        roleLevel: user.role_level || 5,
        employeeId: user.employee_id,
        department: user.department,
        avatar: user.avatar,
        roles,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const userResp = toCamelCase(user);
    delete userResp.passwordHash;
    userResp.roles = roles;

    res.json({ token, user: userResp });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, name, department } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (username, password, name)' });
    }

    // Check if username already exists
    const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    const id = require('crypto').randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.execute(
      'INSERT INTO users (id, username, password_hash, name, role, role_level, department) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, username, passwordHash, name, 'user', 5, department || null]
    );

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    const user = rows[0];

    const roles = await loadUserRoles(user.id);

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        roleLevel: user.role_level || 5,
        employeeId: user.employee_id,
        department: user.department,
        avatar: user.avatar,
        roles,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const userResp = toCamelCase(user);
    delete userResp.passwordHash;
    userResp.roles = roles;

    res.status(201).json({ token, user: userResp });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    const user = toCamelCase(rows[0]);
    delete user.passwordHash;
    res.json(user);
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/auth/profile — get full profile info (user + employee)
router.get('/profile', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.name, u.role, u.role_level, u.department, u.avatar, u.employee_id,
              e.employee_code, e.email, e.phone, e.position, d.name AS department_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }
    const row = rows[0];
    res.json({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      roleLevel: row.role_level,
      department: row.department_name || row.department,
      avatar: row.avatar,
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      email: row.email,
      phone: row.phone,
      position: row.position,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/auth/profile — update own avatar, email, phone
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { avatar, email, phone } = req.body;
    const userId = req.user.id;

    // Update user avatar
    if (avatar !== undefined) {
      await pool.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatar, userId]);
    }

    // Update linked employee fields
    const [userRows] = await pool.execute(
      'SELECT u.username, u.employee_id, e.employee_code FROM users u LEFT JOIN employees e ON u.employee_id = e.id WHERE u.id = ?',
      [userId]
    );
    const employeeId = userRows[0]?.employee_id;
    const currentUsername = userRows[0]?.username;
    const employeeCode = userRows[0]?.employee_code;

    if (employeeId) {
      const sets = [];
      const vals = [];
      if (avatar !== undefined) { sets.push('avatar = ?'); vals.push(avatar); }
      if (email !== undefined) { sets.push('email = ?'); vals.push(email); }
      if (phone !== undefined) { sets.push('phone = ?'); vals.push(phone); }
      if (sets.length > 0) {
        vals.push(employeeId);
        await pool.execute(`UPDATE employees SET ${sets.join(', ')} WHERE id = ?`, vals);
      }

      // Nếu username đang là fallback (= employeeCode) và email mới được cập nhật
      // thì tự động đổi username thành phần trước @ của email
      if (email && employeeCode && currentUsername === employeeCode) {
        const newUsername = email.split('@')[0];
        if (newUsername && newUsername !== currentUsername) {
          const [existingUser] = await pool.execute('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, userId]);
          if (existingUser.length === 0) {
            await pool.execute('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId]);
          }
        }
      }
    }

    // Return updated profile
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.name, u.role, u.role_level, u.department, u.avatar, u.employee_id,
              e.employee_code, e.email, e.phone, e.position, d.name AS department_name
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE u.id = ?`,
      [userId]
    );
    const row = rows[0];
    res.json({
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      roleLevel: row.role_level,
      department: row.department_name || row.department,
      avatar: row.avatar,
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      email: row.email,
      phone: row.phone,
      position: row.position,
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/auth/users/:employeeId/roles — lấy roles của user theo employeeId
router.get('/users/:employeeId/roles', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && (req.user.roleLevel || 5) > 2) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const [userRows] = await pool.execute('SELECT id, username, name FROM users WHERE employee_id = ?', [req.params.employeeId]);
    if (userRows.length === 0) return res.json({ userId: null, username: null, roles: [] });
    const userId = userRows[0].id;
    const [roleRows] = await pool.execute('SELECT role_name FROM user_roles WHERE user_id = ?', [userId]);
    res.json({ userId, username: userRows[0].username, name: userRows[0].name, roles: roleRows.map(r => r.role_name) });
  } catch (err) {
    console.error('Get user roles error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/auth/users/:employeeId/roles — set roles cho user theo employeeId
router.put('/users/:employeeId/roles', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && (req.user.roleLevel || 5) > 2) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { roles } = req.body;
    if (!Array.isArray(roles)) return res.status(400).json({ error: 'roles phải là mảng' });

    const ALLOWED_ROLES = ['hr-manager', 'salary_manager'];
    const validRoles = roles.filter(r => ALLOWED_ROLES.includes(r));

    const [userRows] = await pool.execute('SELECT id FROM users WHERE employee_id = ?', [req.params.employeeId]);
    if (userRows.length === 0) return res.status(404).json({ error: 'User chưa có tài khoản' });
    const userId = userRows[0].id;

    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    for (const role of validRoles) {
      await pool.execute('INSERT INTO user_roles (user_id, role_name) VALUES (?, ?)', [userId, role]);
    }
    res.json({ message: 'Cập nhật role thành công', roles: validRoles });
  } catch (err) {
    console.error('Set user roles error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Thiếu mật khẩu cũ hoặc mật khẩu mới' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Mật khẩu cũ không đúng' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
