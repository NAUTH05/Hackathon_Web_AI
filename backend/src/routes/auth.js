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
    const [userRows] = await pool.execute('SELECT employee_id FROM users WHERE id = ?', [userId]);
    const employeeId = userRows[0]?.employee_id;
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

module.exports = router;
