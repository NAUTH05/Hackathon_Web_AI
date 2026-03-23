const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Role level constants
const ROLE_LEVELS = {
  ADMIN: 1,
  DIRECTOR: 2,     // Tổng giám đốc / Giám đốc đơn vị
  MANAGER: 3,      // Trưởng phòng / Phó phòng
  TEAM_LEAD: 4,    // Tổ trưởng
  EMPLOYEE: 5,     // Nhân viên
};

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc thiếu' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    // Ensure roles array exists
    if (!req.user.roles) req.user.roles = [];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.roleLevel !== ROLE_LEVELS.ADMIN) {
    return res.status(403).json({ error: 'Chỉ admin mới có quyền truy cập' });
  }
  next();
}

// Require role_level <= maxLevel (lower number = higher authority)
function requireLevel(maxLevel) {
  return (req, res, next) => {
    const userLevel = req.user.roleLevel || ROLE_LEVELS.EMPLOYEE;
    if (userLevel > maxLevel) {
      return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
    }
    next();
  };
}

// Require salary_manager role — even admin cannot bypass this
function requireSalaryRole(req, res, next) {
  const roles = req.user.roles || [];
  if (!roles.includes('salary_manager')) {
    return res.status(403).json({ error: 'Chỉ người có quyền Quản lý lương mới thực hiện được thao tác này' });
  }
  next();
}

// Admin OR salary_manager — for viewing salary data
function adminOrSalaryRole(req, res, next) {
  const roles = req.user.roles || [];
  if (req.user.role === 'admin' || roles.includes('salary_manager')) {
    return next();
  }
  return res.status(403).json({ error: 'Bạn không có quyền truy cập' });
}

// Helper: load user roles from DB (used during login)
async function loadUserRoles(userId) {
  try {
    const [rows] = await pool.execute('SELECT role_name FROM user_roles WHERE user_id = ?', [userId]);
    return rows.map(r => r.role_name);
  } catch {
    return [];
  }
}

// Helper: check if user is a manager (level <= maxLevel)
function isManagerLevel(req, maxLevel = 3) {
  const level = req.user.roleLevel || ROLE_LEVELS.EMPLOYEE;
  return level <= maxLevel;
}

// Helper: get all employee IDs in the same department as the user
async function getDeptEmployeeIds(employeeId) {
  try {
    const [empRow] = await pool.execute('SELECT department_id FROM employees WHERE id = ?', [employeeId]);
    if (empRow.length === 0 || !empRow[0].department_id) return [];
    const [rows] = await pool.execute(
      'SELECT id FROM employees WHERE department_id = ? AND is_active = 1',
      [empRow[0].department_id]
    );
    return rows.map(r => r.id);
  } catch {
    return [];
  }
}

// Middleware: require level <= maxLevel (managers)
function requireManager(req, res, next) {
  if (req.user.role === 'admin') return next();
  const level = req.user.roleLevel || ROLE_LEVELS.EMPLOYEE;
  if (level <= ROLE_LEVELS.MANAGER) return next();
  return res.status(403).json({ error: 'Chỉ quản lý mới có quyền thực hiện thao tác này' });
}

module.exports = { authenticate, adminOnly, requireLevel, requireManager, requireSalaryRole, adminOrSalaryRole, loadUserRoles, isManagerLevel, getDeptEmployeeIds, ROLE_LEVELS };
