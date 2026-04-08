const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly, requireSalaryRole, adminOrSalaryRole } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');
const { applyRules } = require('../services/salaryRuleEngine');
const { calculateSalary: engineCalculateSalary } = require('../services/salaryEngine');

// ========== PAYROLL RULES ==========

// GET /api/salary/rules — list all payroll rules
router.get('/rules', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payroll_rules ORDER BY priority ASC, created_at ASC');
    const parsed = rows.map(r => ({
      ...r,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
    }));
    res.json(parsed);
  } catch (err) {
    console.error('Get payroll rules error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/rules — create a new rule
router.post('/rules', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { rule_type, name, description, config, priority, is_active } = req.body;
    if (!rule_type || !name || !config) {
      return res.status(400).json({ error: 'Thiếu rule_type, name, hoặc config' });
    }
    const allowedTypes = ['late_policy', 'min_hours_policy', 'repeat_late_policy'];
    if (!allowedTypes.includes(rule_type)) {
      return res.status(400).json({ error: `rule_type phải là: ${allowedTypes.join(', ')}` });
    }
    const id = 'rule_' + uuidv4().slice(0, 8);
    const configStr = typeof config === 'string' ? config : JSON.stringify(config);
    await pool.execute(
      `INSERT INTO payroll_rules (id, rule_type, name, description, config, priority, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, rule_type, name, description || '', configStr, priority ?? 0, is_active ?? 1, req.user.id]
    );
    res.json({ id, message: 'Đã tạo rule' });
  } catch (err) {
    console.error('Create payroll rule error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/rules/:id — update a rule
router.put('/rules/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { name, description, config, priority, is_active } = req.body;
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (config !== undefined) {
      const configStr = typeof config === 'string' ? config : JSON.stringify(config);
      sets.push('config = ?');
      params.push(configStr);
    }
    if (priority !== undefined) { sets.push('priority = ?'); params.push(priority); }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (sets.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    await pool.execute(`UPDATE payroll_rules SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Đã cập nhật rule' });
  } catch (err) {
    console.error('Update payroll rule error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/salary/rules/:id — delete a rule
router.delete('/rules/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    await pool.execute('DELETE FROM payroll_rules WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa rule' });
  } catch (err) {
    console.error('Delete payroll rule error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== DEDUCTION ITEMS ==========

// GET /api/salary/deduction-items — list all deduction items
router.get('/deduction-items', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM salary_deduction_items ORDER BY priority ASC, created_at ASC');
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get deduction items error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/deduction-items — create deduction item
router.post('/deduction-items', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { name, type, calc_type, amount, rate, description, priority, is_active } = req.body;
    if (!name || !type || !calc_type) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });

    const allowedTypes = ['tax', 'insurance', 'union_fee', 'custom'];
    if (!allowedTypes.includes(type)) return res.status(400).json({ error: 'Loại không hợp lệ' });
    if (!['fixed', 'percentage'].includes(calc_type)) return res.status(400).json({ error: 'Cách tính không hợp lệ' });

    const id = 'ded_' + uuidv4().slice(0, 8);
    await pool.execute(
      `INSERT INTO salary_deduction_items (id, name, type, calc_type, amount, rate, description, priority, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, type, calc_type, parseFloat(amount) || 0, parseFloat(rate) || 0, description || '', priority ?? 0, is_active ?? 1, req.user.id]
    );
    res.json({ id, message: 'Đã tạo khoản khấu trừ' });
  } catch (err) {
    console.error('Create deduction item error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/deduction-items/:id — update deduction item
router.put('/deduction-items/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { name, type, calc_type, amount, rate, description, priority, is_active } = req.body;
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (type !== undefined) { sets.push('type = ?'); params.push(type); }
    if (calc_type !== undefined) { sets.push('calc_type = ?'); params.push(calc_type); }
    if (amount !== undefined) { sets.push('amount = ?'); params.push(parseFloat(amount) || 0); }
    if (rate !== undefined) { sets.push('rate = ?'); params.push(parseFloat(rate) || 0); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (priority !== undefined) { sets.push('priority = ?'); params.push(priority); }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (sets.length === 0) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    await pool.execute(`UPDATE salary_deduction_items SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Đã cập nhật' });
  } catch (err) {
    console.error('Update deduction item error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/salary/deduction-items/:id — delete deduction item
router.delete('/deduction-items/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    await pool.execute('DELETE FROM salary_deduction_items WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (err) {
    console.error('Delete deduction item error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== FORMULA VARIABLES ==========

// GET /api/salary/variables — list all custom formula variables
router.get('/variables', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM formula_variables ORDER BY created_at ASC');
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get formula variables error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/variables — create a custom variable
router.post('/variables', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { id, label, value, description } = req.body;
    if (!id || !label || value == null) return res.status(400).json({ error: 'Thiếu id, label hoặc value' });
    // Validate id format: only lowercase letters, numbers, underscore; must start with custom_
    if (!/^custom_[a-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'ID biến phải bắt đầu bằng custom_ và chỉ chứa a-z, 0-9, _' });
    const numVal = parseFloat(value);
    if (isNaN(numVal)) return res.status(400).json({ error: 'Giá trị phải là số' });
    await pool.execute(
      'INSERT INTO formula_variables (id, label, value, description, created_by) VALUES (?, ?, ?, ?, ?)',
      [id, label.trim(), numVal, (description || '').trim(), req.user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM formula_variables WHERE id = ?', [id]);
    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Biến đã tồn tại' });
    console.error('Create formula variable error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/variables/:id — update a variable
router.put('/variables/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { label, value, description } = req.body;
    const updates = [];
    const params = [];
    if (label != null) { updates.push('label = ?'); params.push(label.trim()); }
    if (value != null) { const nv = parseFloat(value); if (!isNaN(nv)) { updates.push('value = ?'); params.push(nv); } }
    if (description != null) { updates.push('description = ?'); params.push(description.trim()); }
    if (!updates.length) return res.status(400).json({ error: 'Không có gì để cập nhật' });
    params.push(req.params.id);
    await pool.execute(`UPDATE formula_variables SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.execute('SELECT * FROM formula_variables WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy biến' });
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update formula variable error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/salary/variables/:id — delete a variable
router.delete('/variables/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM formula_variables WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Không tìm thấy biến' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete formula variable error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== PRESETS ==========

// GET /api/salary/presets
router.get('/presets', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM salary_presets ORDER BY created_at DESC');

    // Count employees per preset (including default fallback)
    const [totalActive] = await pool.execute('SELECT COUNT(*) AS cnt FROM employees WHERE is_active = 1');
    const totalActiveCount = totalActive[0].cnt;
    const [assignCounts] = await pool.execute(
      `SELECT esa.preset_id, COUNT(*) AS cnt
       FROM employee_salary_assignments esa
       JOIN employees e ON e.id = esa.employee_id AND e.is_active = 1
       GROUP BY esa.preset_id`
    );
    const countMap = new Map();
    let totalExplicitlyAssigned = 0;
    for (const ac of assignCounts) {
      countMap.set(ac.preset_id, parseInt(ac.cnt));
      totalExplicitlyAssigned += parseInt(ac.cnt);
    }

    const result = toCamelCaseArray(rows).map(p => {
      let usedByCount = countMap.get(p.id) || 0;
      // Default preset also covers employees without explicit assignment
      if (p.isDefault) {
        usedByCount += (totalActiveCount - totalExplicitlyAssigned);
      }
      return { ...p, usedByCount };
    });

    res.json(result);
  } catch (err) {
    console.error('Get salary presets error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/presets
router.post('/presets', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { name, description, baseSalary, formulaType, customFormula, allowances, isDefault } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO salary_presets (id, name, description, base_salary, formula_type, custom_formula, allowances, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, description || null, baseSalary, formulaType || 'standard', customFormula || null, allowances || 0, isDefault ? 1 : 0]
    );
    const [rows] = await pool.execute('SELECT * FROM salary_presets WHERE id = ?', [id]);

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create salary preset error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/presets/:id
router.put('/presets/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { name, description, baseSalary, formulaType, customFormula, allowances, isDefault } = req.body;

    await pool.execute(
      `UPDATE salary_presets SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        base_salary = COALESCE(?, base_salary),
        formula_type = COALESCE(?, formula_type),
        custom_formula = COALESCE(?, custom_formula),
        allowances = COALESCE(?, allowances),
        is_default = COALESCE(?, is_default)
       WHERE id = ?`,
      [name, description, baseSalary, formulaType, customFormula, allowances, isDefault, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM salary_presets WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mẫu lương' });
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update salary preset error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/salary/presets/:id
router.delete('/presets/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM salary_presets WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy mẫu lương' });
    await pool.execute('DELETE FROM salary_presets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Đã xóa mẫu lương' });
  } catch (err) {
    console.error('Delete salary preset error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== ASSIGNMENTS ==========

// GET /api/salary/assignments
router.get('/assignments', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT esa.*, e.name AS employee_name, e.employee_code, sp.name AS preset_name
       FROM employee_salary_assignments esa
       JOIN employees e ON esa.employee_id = e.id
       JOIN salary_presets sp ON esa.preset_id = sp.id`
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get salary assignments error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/assignments
router.post('/assignments', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { employeeId, presetId } = req.body;

    await pool.execute(
      `INSERT INTO employee_salary_assignments (employee_id, preset_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE preset_id = VALUES(preset_id)`,
      [employeeId, presetId]
    );
    const [rows] = await pool.execute('SELECT * FROM employee_salary_assignments WHERE employee_id = ?', [employeeId]);

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create salary assignment error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== PERMISSIONS ==========

// GET /api/salary/search-users?q= — search users for role assignment (max 10)
router.get('/search-users', authenticate, adminOnly, async (req, res) => {
  try {
    const q = req.query.q || '';
    if (q.length < 1) return res.json([]);
    const kw = `%${q}%`;
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.name, u.role, u.department, e.employee_code
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       WHERE (u.name LIKE ? OR u.username LIKE ? OR e.employee_code LIKE ?)
         AND u.id NOT IN (SELECT user_id FROM user_roles WHERE role_name = 'salary_manager')
       LIMIT 10`,
      [kw, kw, kw]
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/salary/permissions
router.get('/permissions', authenticate, adminOnly, async (req, res) => {
  try {
    // Return users who have salary_manager role
    const [rows] = await pool.execute(
      `SELECT ur.user_id, ur.role_name, ur.granted_at, u.name, u.username
       FROM user_roles ur
       LEFT JOIN users u ON ur.user_id = u.id
       WHERE ur.role_name = 'salary_manager'
       ORDER BY ur.granted_at DESC`
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get salary roles error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/permissions — assign salary_manager role
router.post('/permissions', authenticate, adminOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Thiếu userId' });

    await pool.execute(
      `INSERT IGNORE INTO user_roles (user_id, role_name, granted_by) VALUES (?, 'salary_manager', ?)`,
      [userId, req.user.id]
    );

    res.status(201).json({ message: 'Đã gán quyền Quản lý lương' });
  } catch (err) {
    console.error('Assign salary role error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/salary/permissions/:userId — revoke salary_manager role
router.delete('/permissions/:userId', authenticate, adminOnly, async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM user_roles WHERE user_id = ? AND role_name = 'salary_manager'`,
      [req.params.userId]
    );
    res.json({ message: 'Đã thu hồi quyền Quản lý lương' });
  } catch (err) {
    console.error('Revoke salary role error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== COEFFICIENTS ==========

// GET /api/salary/coefficients — returns one row per type (deduped)
router.get('/coefficients', authenticate, async (req, res) => {
  try {
    // Return only the latest row per type to avoid UI duplicates from bad seed data
    const [rows] = await pool.execute(
      `SELECT sc.*
       FROM salary_coefficients sc
       INNER JOIN (
         SELECT type, MAX(id) AS max_id FROM salary_coefficients WHERE is_active = 1 GROUP BY type
       ) latest ON sc.id = latest.max_id
       ORDER BY FIELD(sc.type,'overtime','night_shift','weekend','holiday','dedication')`
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get salary coefficients error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/coefficients/:type — upsert one canonical row per type
router.put('/coefficients/:type', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { multiplier, description } = req.body;
    const type = req.params.type;
    if (!multiplier || isNaN(parseFloat(multiplier))) return res.status(400).json({ error: 'Hệ số không hợp lệ' });

    // Dedup: delete all rows of this type, then insert one fresh row
    await pool.execute('DELETE FROM salary_coefficients WHERE type = ?', [type]);
    const id = uuidv4();
    await pool.execute(
      `INSERT INTO salary_coefficients (id, type, multiplier, description, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [id, type, parseFloat(multiplier), description || null]
    );
    const [rows] = await pool.execute('SELECT * FROM salary_coefficients WHERE id = ?', [id]);
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update salary coefficient error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// DELETE /api/salary/coefficients/:type — remove a coefficient type
router.delete('/coefficients/:type', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const type = req.params.type;
    await pool.execute('DELETE FROM salary_coefficients WHERE type = ?', [type]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete salary coefficient error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== RECORDS ==========

// GET /api/salary/records?month=YYYY-MM&search=&department=&preset=&sortBy=&sortDir=
router.get('/records', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const baseJoin = `FROM salary_records sr
      LEFT JOIN employees e ON sr.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id`;

    let where = ' WHERE 1=1';
    const params = [];

    if (req.query.month) {
      params.push(req.query.month);
      where += ' AND sr.month = ?';
    }

    if (req.user.role !== 'admin' && !(req.user.roles || []).includes('salary_manager')) {
      params.push(req.user.employeeId);
      where += ' AND sr.employee_id = ?';
    }

    if (req.query.search) {
      const kw = `%${req.query.search}%`;
      params.push(kw, kw, kw);
      where += ' AND (sr.employee_name LIKE ? OR e.employee_code LIKE ? OR d.name LIKE ?)';
    }

    if (req.query.department) {
      params.push(req.query.department);
      where += ' AND d.name = ?';
    }

    if (req.query.preset) {
      params.push(req.query.preset);
      where += ' AND sr.preset_id = ?';
    }

    const allowedSort = { employee_name: 'sr.employee_name', department: 'd.name', base_salary: 'sr.base_salary', present_days: 'sr.present_days', ot_hours: 'sr.ot_hours', gross_salary: 'sr.gross_salary', net_salary: 'sr.net_salary', calculated_at: 'sr.calculated_at' };
    const sortBy = allowedSort[req.query.sortBy] || 'sr.employee_name';
    const sortDir = req.query.sortDir === 'desc' ? 'DESC' : 'ASC';

    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total ${baseJoin} ${where}`, params
    );
    const total = countResult[0].total;

    // Also get list of distinct departments for filter
    const deptParams = [];
    let deptWhere = ' WHERE 1=1';
    if (req.query.month) { deptParams.push(req.query.month); deptWhere += ' AND sr.month = ?'; }
    const [depts] = await pool.query(
      `SELECT DISTINCT d.name AS department ${baseJoin} ${deptWhere} AND d.name IS NOT NULL AND d.name != '' ORDER BY d.name`,
      deptParams
    );

    const [rows] = await pool.query(
      `SELECT sr.*, e.employee_code, d.name AS department, e.position,
         e.attendance_score,
         (SELECT COALESCE(SUM(ar.working_hours),0) FROM attendance_records ar
          WHERE ar.employee_id = sr.employee_id AND DATE_FORMAT(ar.date,'%Y-%m') = sr.month
            AND ar.check_out_time IS NOT NULL) AS total_working_hours
       ${baseJoin}
       ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Summary stats for the full filtered set
    const [sumResult] = await pool.query(
      `SELECT COALESCE(SUM(sr.net_salary), 0) AS total_net, COALESCE(SUM(sr.gross_salary), 0) AS total_gross,
              COALESCE(SUM(sr.ot_hours), 0) AS total_ot_hours
       ${baseJoin} ${where}`, params
    );

    res.json({
      data: toCamelCaseArray(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        totalNet: parseFloat(sumResult[0].total_net),
        totalGross: parseFloat(sumResult[0].total_gross),
        totalOtHours: parseFloat(sumResult[0].total_ot_hours || 0),
      },
      departments: depts.map(d => d.department),
    });
  } catch (err) {
    console.error('Get salary records error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/calculate — calculate salary for a month
router.post('/calculate', authenticate, requireSalaryRole, async (req, res) => {
  try {

    const { month } = req.body; // format YYYY-MM
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    // Delete existing salary records for this month before recalculating
    await pool.execute('DELETE FROM salary_records WHERE month = ?', [month]);

    // Get salary coefficients
    const [coeffs] = await pool.execute(
      'SELECT * FROM salary_coefficients WHERE is_active = 1'
    );
    const coeffMap = new Map();
    coeffs.forEach(c => coeffMap.set(c.type, parseFloat(c.multiplier || 1.5)));

    // Load custom formula variables from DB
    const [formulaVarRows] = await pool.query('SELECT id, value FROM formula_variables');
    const dbFormulaVars = {};
    for (const fv of formulaVarRows) dbFormulaVars[fv.id] = parseFloat(fv.value);

    // Get default preset (fallback for employees without assignment)
    const [defaultPresets] = await pool.execute(
      'SELECT * FROM salary_presets WHERE is_default = 1 LIMIT 1'
    );
    const defaultPreset = defaultPresets[0] || null;

    // Get ALL active employees
    const [allEmployees] = await pool.execute(
      `SELECT e.id AS emp_id, e.name AS employee_name,
              esa.preset_id AS assigned_preset_id,
              sp.id AS sp_id, sp.name AS preset_name, sp.base_salary, sp.formula_type, sp.custom_formula, sp.allowances
       FROM employees e
       LEFT JOIN employee_salary_assignments esa ON esa.employee_id = e.id
       LEFT JOIN salary_presets sp ON esa.preset_id = sp.id
       WHERE e.is_active = 1`
    );

    // Bulk fetch all data for this month
    const [allTimesheets] = await pool.execute(
      'SELECT * FROM monthly_timesheets WHERE month = ?', [month]
    );
    const tsMap = new Map();
    for (const ts of allTimesheets) tsMap.set(ts.employee_id, ts);

    const [allHours] = await pool.execute(
      `SELECT employee_id,
              COALESCE(SUM(working_hours), 0) AS total_hours,
              COUNT(CASE WHEN working_hours >= 8 THEN 1 END) AS full_work_days,
              COUNT(CASE WHEN check_in_time IS NOT NULL THEN 1 END) AS present_days_att
       FROM attendance_records
       WHERE DATE_FORMAT(date, '%Y-%m') = ? AND check_out_time IS NOT NULL
       GROUP BY employee_id`, [month]
    );
    const hoursMap = new Map();
    for (const h of allHours) hoursMap.set(h.employee_id, {
      totalHours: parseFloat(h.total_hours),
      fullWorkDays: parseInt(h.full_work_days || 0),
      presentDays: parseInt(h.present_days_att || 0),
    });

    const [allPenalties] = await pool.execute(
      `SELECT employee_id, COALESCE(SUM(amount), 0) AS total
       FROM penalties
       WHERE type = 'deduction' AND status = 'active' AND DATE_FORMAT(date, '%Y-%m') = ?
       GROUP BY employee_id`, [month]
    );
    const penMap = new Map();
    for (const p of allPenalties) penMap.set(p.employee_id, parseFloat(p.total));

    // Load payroll rules (sorted by priority)
    const [payrollRules] = await pool.query(
      'SELECT * FROM payroll_rules WHERE is_active = 1 ORDER BY priority ASC'
    );
    const parsedRules = payrollRules.map(r => ({
      ...r,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
    }));

    // Load active deduction items (tax, insurance, etc.)
    const [deductItemRows] = await pool.query(
      'SELECT * FROM salary_deduction_items WHERE is_active = 1 ORDER BY priority ASC'
    );
    const activeDeductionItems = deductItemRows.map(item => ({
      type: item.type,
      label: item.name,
      calc_type: item.calc_type,
      amount: parseFloat(item.amount) || 0,
      rate: parseFloat(item.rate) || 0,
    }));

    // Load per-employee late minutes for the month (for rule engine)
    const [lateData] = await pool.query(
      `SELECT employee_id,
              COUNT(CASE WHEN status = 'late' THEN 1 END) AS late_count,
              COALESCE(SUM(late_minutes), 0) AS total_late_minutes,
              GROUP_CONCAT(CASE WHEN status = 'late' THEN late_minutes ELSE NULL END) AS daily_late_csv
       FROM attendance_records
       WHERE DATE_FORMAT(date, '%Y-%m') = ?
       GROUP BY employee_id`, [month]
    );
    const lateMap = new Map();
    for (const ld of lateData) {
      lateMap.set(ld.employee_id, {
        lateCount: parseInt(ld.late_count || 0),
        totalLateMinutes: parseInt(ld.total_late_minutes || 0),
        dailyLateMinutes: ld.daily_late_csv ? ld.daily_late_csv.split(',').map(Number).filter(n => n > 0) : [],
      });
    }

    // Function to parse salary config from custom_formula JSON
    function parseConfig(cfStr) {
      try {
        const c = JSON.parse(cfStr || '{}');
        return {
          salaryBasis: c.salaryBasis || 'hourly',
          hourlyRate: c.hourlyRate ? parseFloat(c.hourlyRate) : null, // explicit hourly rate
          workDaysPerMonth: c.workDaysPerMonth ? parseInt(c.workDaysPerMonth) : 22,
          otMultiplier: c.otMultiplier ?? 1.5,
          latePenaltyPerDay: c.latePenaltyPerDay ?? 50000,
          includeOT: c.includeOT !== false,
          includeAllowances: c.includeAllowances !== false,
          includeDeductions: c.includeDeductions !== false,
          includeLatePenalty: c.includeLatePenalty !== false,
          formulaNodes: Array.isArray(c.formulaNodes) ? c.formulaNodes : [],
          customExpression: c.customExpression || null,
        };
      } catch {
        return { salaryBasis: 'hourly', hourlyRate: null, workDaysPerMonth: 22, otMultiplier: 1.5, latePenaltyPerDay: 50000, includeOT: true, includeAllowances: true, includeDeductions: true, includeLatePenalty: true, formulaNodes: [], customExpression: null };
      }
    }

    // Evaluate a drag-drop formula with proper operator precedence (× ÷ before + -)
    function evaluateFormula(nodes, vars) {
      if (!nodes || nodes.length === 0) return null;
      const valueOf = (blockId) => {
        switch (blockId) {
          case 'working_hours': return vars.working_hours;
          case 'present_days': return vars.present_days;
          case 'hourly_rate': return vars.hourly_rate;
          case 'daily_rate': return vars.daily_rate;
          case 'base_salary': return vars.base_salary;
          case 'ot_hours': return vars.ot_hours;
          case 'ot_multiplier': return vars.ot_multiplier;
          case 'allowances': return vars.allowances;
          case 'late_days': return vars.late_days;
          case 'late_penalty_rate': return vars.late_penalty_rate;
          case 'deductions': return vars.deductions;
          default: return 0;
        }
      };

      // Build terms: group consecutive × ÷ operations into products
      // then combine with + - (respecting precedence)
      const values = nodes.map(n => valueOf(n.blockId));
      const ops = nodes.map(n => n.operator); // ops[0] is unused (first node)

      // First pass: resolve × and ÷ into grouped terms
      const terms = [values[0]];
      const termOps = []; // + or - between terms
      for (let i = 1; i < values.length; i++) {
        const op = ops[i];
        if (op === '×' || op === '*') {
          terms[terms.length - 1] *= values[i];
        } else if (op === '÷' || op === '/') {
          terms[terms.length - 1] = values[i] !== 0 ? terms[terms.length - 1] / values[i] : 0;
        } else {
          // + or -: start a new term
          termOps.push(op);
          terms.push(values[i]);
        }
      }

      // Second pass: combine terms with + and -
      let result = terms[0];
      for (let i = 0; i < termOps.length; i++) {
        if (termOps[i] === '+') result += terms[i + 1];
        else if (termOps[i] === '-') result -= terms[i + 1];
      }
      return Math.max(0, result);
    }

    // Safe expression parser for custom text formulas
    // Supports: variables, numbers, +, -, *, /, (, )
    function evaluateExpression(expr, vars) {
      if (!expr || typeof expr !== 'string') return null;

      // Tokenize
      const tokens = [];
      let i = 0;
      const s = expr.replace(/\s+/g, '');
      while (i < s.length) {
        if ('+-*/()'.includes(s[i])) {
          tokens.push({ type: 'op', value: s[i] });
          i++;
        } else if (/[0-9.]/.test(s[i])) {
          let num = '';
          while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
          tokens.push({ type: 'num', value: parseFloat(num) || 0 });
        } else if (/[a-z_]/i.test(s[i])) {
          let name = '';
          while (i < s.length && /[a-z_0-9]/i.test(s[i])) { name += s[i]; i++; }
          const val = vars.hasOwnProperty(name) ? vars[name] : 0;
          tokens.push({ type: 'num', value: val });
        } else {
          i++; // skip unknown chars
        }
      }

      // Recursive descent parser
      let pos = 0;
      function peek() { return pos < tokens.length ? tokens[pos] : null; }
      function consume() { return tokens[pos++]; }

      function parseExpr() {
        let left = parseTerm();
        while (peek() && (peek().value === '+' || peek().value === '-')) {
          const op = consume().value;
          const right = parseTerm();
          left = op === '+' ? left + right : left - right;
        }
        return left;
      }

      function parseTerm() {
        let left = parseFactor();
        while (peek() && (peek().value === '*' || peek().value === '/')) {
          const op = consume().value;
          const right = parseFactor();
          left = op === '*' ? left * right : (right !== 0 ? left / right : 0);
        }
        return left;
      }

      function parseFactor() {
        const tok = peek();
        if (!tok) return 0;
        if (tok.type === 'num') { consume(); return tok.value; }
        if (tok.value === '(') {
          consume(); // skip (
          const val = parseExpr();
          if (peek() && peek().value === ')') consume(); // skip )
          return val;
        }
        if (tok.value === '-') {
          consume();
          return -parseFactor();
        }
        consume(); // skip unexpected token
        return 0;
      }

      const result = parseExpr();
      return Math.max(0, isNaN(result) ? 0 : result);
    }

    // Build batch insert values
    const insertValues = [];
    let count = 0;

    for (const emp of allEmployees) {
      // Determine preset
      const presetId = emp.sp_id || (defaultPreset ? defaultPreset.id : null);
      const presetName = emp.preset_name || (defaultPreset ? defaultPreset.name : null);
      const baseSalary = parseFloat(emp.base_salary || (defaultPreset ? defaultPreset.base_salary : 0));
      const allowances = parseFloat(emp.allowances || (defaultPreset ? defaultPreset.allowances : 0));
      const cfStr = emp.custom_formula || (defaultPreset ? defaultPreset.custom_formula : null);

      if (!presetId) continue;

      const config = parseConfig(cfStr);

      const timesheet = tsMap.get(emp.emp_id) || {};
      const totalWorkDays = timesheet.total_work_days || 22;
      const lateDays = timesheet.late_days || 0;
      const totalOtHours = parseFloat(timesheet.total_ot_hours || 0);

      // Use actual worked hours if available, fall back to timesheet
      const hoursData = hoursMap.get(emp.emp_id) || {};
      const actualWorkedHours = hoursData.totalHours || 0;
      // Present days = total_working_hours / 8 (fractional days)
      // 9h = 1.13 days, 18h = 2.25 days, 48h = 6 days
      const presentDays = actualWorkedHours > 0
        ? parseFloat((actualWorkedHours / 8).toFixed(2))
        : (timesheet.present_days || 0);

      const standardHoursPerDay = 8;
      // If preset defines explicit hourly rate, use it; otherwise derive from monthly salary
      const stdWorkDays = config.workDaysPerMonth || 22;
      const totalStandardHours = stdWorkDays * standardHoursPerDay;
      const hourlyRate = config.hourlyRate != null && config.hourlyRate > 0
        ? config.hourlyRate
        : baseSalary / (totalStandardHours || 176);
      const dailyRate = hourlyRate * standardHoursPerDay;

      const rawDeductions = penMap.get(emp.emp_id) || 0;

      let grossSalary, netSalary, otPay, allowancePay, latePenalty, deductionsPay;

      // ─── Apply Rule Engine ─────────────────────────────────────
      const empLate = lateMap.get(emp.emp_id) || { lateCount: 0, totalLateMinutes: 0, dailyLateMinutes: [] };
      const ruleInput = {
        working_hours: actualWorkedHours > 0 ? actualWorkedHours : (presentDays * standardHoursPerDay),
        total_late_minutes: empLate.totalLateMinutes,
        late_count: empLate.lateCount,
        daily_late_minutes: empLate.dailyLateMinutes,
      };
      const { adjustedData, appliedRules } = applyRules(ruleInput, parsedRules);
      const effectiveHours = adjustedData.effective_hours ?? ruleInput.working_hours;
      const effectivePresentDays = parseFloat((effectiveHours / 8).toFixed(2));
      // ──────────────────────────────────────────────────────────

      const formulaVars = {
        working_hours: effectiveHours,
        present_days: effectivePresentDays,
        hourly_rate: hourlyRate,
        daily_rate: dailyRate,
        base_salary: baseSalary,
        ot_hours: totalOtHours,
        ot_multiplier: config.otMultiplier,
        allowances: allowances,
        late_days: lateDays,
        late_penalty_rate: config.latePenaltyPerDay,
        deductions: rawDeductions,
        // Rule engine outputs available as formula variables
        effective_hours: effectiveHours,
        raw_working_hours: actualWorkedHours > 0 ? actualWorkedHours : (presentDays * standardHoursPerDay),
        late_hours_deducted: adjustedData.late_hours_deducted || 0,
        late_count: empLate.lateCount,
        total_late_minutes: empLate.totalLateMinutes,
      };

      // Merge custom variables: DB-level first, then per-preset overrides
      Object.assign(formulaVars, dbFormulaVars);
      if (Array.isArray(config.customVars)) {
        for (const cv of config.customVars) {
          if (cv.id && typeof cv.value === 'number') {
            formulaVars[cv.id] = cv.value;
          }
        }
      }

      // ─── Salary Engine: 4-phase calculation ───
      const engineResult = engineCalculateSalary({
        config, baseSalary, allowances,
        actualWorkedHours, presentDays: effectivePresentDays, totalOtHours, lateDays, standardHoursPerDay,
        adjustedData, appliedRules, effectiveHours,
        rawDeductions,
        deductionItems: activeDeductionItems,
        evaluateExpression, evaluateFormula, formulaVars, coeffMap,
      });

      grossSalary = engineResult.grossSalary;
      netSalary = engineResult.netSalary;
      otPay = engineResult.otPay;
      allowancePay = engineResult.allowancePay;
      latePenalty = engineResult.latePenalty;
      deductionsPay = engineResult.deductionsPay;
      const ruleDeductions = engineResult.ruleDeductions;
      const allRuleDescs = engineResult.ruleDescriptions;

      const insurance = 0;
      const healthInsurance = 0;
      const dedication = 0;

      insertValues.push([
        uuidv4(), emp.emp_id, emp.employee_name, month, presetId, presetName,
        baseSalary, totalWorkDays, parseFloat(presentDays.toFixed(2)), totalOtHours,
        Math.round(otPay), allowances, JSON.stringify({}),
        insurance, healthInsurance,
        Math.round(engineResult.totalDeductions), JSON.stringify(engineResult.deductionItems || []),
        dedication, Math.round(latePenalty),
        Math.round(grossSalary), Math.round(netSalary),
        // New rule engine columns
        parseFloat(effectiveHours.toFixed(2)),
        parseFloat((adjustedData.late_hours_deducted || 0).toFixed(2)),
        empLate.totalLateMinutes,
        empLate.lateCount,
        adjustedData.min_hours_penalty_rate ?? null,
        allRuleDescs.length > 0 ? JSON.stringify(allRuleDescs) : null
      ]);
      count++;
    }

    // Batch insert
    for (let i = 0; i < insertValues.length; i += 500) {
      const chunk = insertValues.slice(i, i + 500);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = chunk.flat();
      await pool.query(
        `INSERT INTO salary_records (id, employee_id, employee_name, month, preset_id, preset_name,
          base_salary, total_work_days, present_days, ot_hours, ot_pay, allowances, allowances_detail,
          insurance, health_insurance, deductions, deductions_detail, dedication, late_penalty,
          gross_salary, net_salary,
          effective_hours, late_hours_deducted, total_late_minutes, late_count, min_hours_penalty_rate, rule_details) VALUES ${placeholders}`,
        flatValues
      );
    }

    await logAudit({
      action: 'salary-calculate',
      performedBy: req.user.name,
      details: `Tính lương tháng ${month} cho ${count} nhân viên`,
    });

    res.json({ message: `Đã tính lương cho ${count} nhân viên`, count });
  } catch (err) {
    console.error('Calculate salary error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/records/:id — update salary record details
router.put('/records/:id', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { insuranceAmount, healthInsuranceAmount, allowancesDetail, deductionsDetail, dedicationAmount } = req.body;

    await pool.execute(
      `UPDATE salary_records SET
        insurance = COALESCE(?, insurance),
        health_insurance = COALESCE(?, health_insurance),
        allowances_detail = COALESCE(?, allowances_detail),
        deductions_detail = COALESCE(?, deductions_detail),
        dedication = COALESCE(?, dedication)
       WHERE id = ?`,
      [
        insuranceAmount || null,
        healthInsuranceAmount || null,
        allowancesDetail ? JSON.stringify(allowancesDetail) : null,
        deductionsDetail ? JSON.stringify(deductionsDetail) : null,
        dedicationAmount || null,
        req.params.id
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM salary_records WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi lương' });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update salary record error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/lock-month — lock all salary records for a month
router.post('/lock-month', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    await pool.execute(
      `UPDATE salary_records
       SET is_locked = 1, locked_at = NOW(), locked_by = ?
       WHERE month = ? AND is_locked = 0`,
      [req.user.name, month]
    );

    await logAudit({
      action: 'salary-lock',
      performedBy: req.user.name,
      details: `Khoá lương tháng ${month}`,
    });

    res.json({ message: `Đã khoá lương tháng ${month}` });
  } catch (err) {
    console.error('Lock salary month error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/salary/unlock-month — unlock salary records for a month
router.post('/unlock-month', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    await pool.execute(
      `UPDATE salary_records
       SET is_locked = 0, locked_at = NULL, locked_by = NULL
       WHERE month = ? AND is_locked = 1`,
      [month]
    );

    await logAudit({
      action: 'salary-unlock',
      performedBy: req.user.name,
      details: `Mở khoá lương tháng ${month}`,
    });

    res.json({ message: `Đã mở khoá lương tháng ${month}` });
  } catch (err) {
    console.error('Unlock salary month error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/salary/attendance-scores?month=YYYY-MM&page=1&limit=50&search=&dept=&rank=&sortBy=monthlyScore&sortDir=desc
router.get('/attendance-scores', authenticate, adminOrSalaryRole, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().substring(0, 7);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const deptFilter = (req.query.dept || '').trim();
    const rankFilter = (req.query.rank || '').trim();
    const sortByParam = req.query.sortBy || 'monthlyScore';
    const sortDir = (req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    // Allowed sort columns mapped to SQL expressions (applied after score calc via subquery)
    const allowedSortCols = ['monthlyScore', 'totalWorkingHours', 'fullDays', 'lateDays', 'absentDays', 'otHours', 'employeeName'];
    const sortCol = allowedSortCols.includes(sortByParam) ? sortByParam : 'monthlyScore';

    const [depts] = await pool.execute('SELECT id, name FROM departments');
    const deptMap = new Map();
    depts.forEach(d => deptMap.set(d.id, d.name));

    // Find dept_id for filter
    let deptIdFilter = null;
    if (deptFilter) {
      for (const [id, name] of deptMap.entries()) {
        if (name === deptFilter) { deptIdFilter = id; break; }
      }
      // If dept name not found, return empty
      if (deptIdFilter === null) {
        return res.json({ month, data: [], total: 0, page, limit, totalPages: 0, departments: [...deptMap.values()].sort() });
      }
    }

    // Build WHERE for employees
    const whereParams = [];
    let whereExtra = ' AND is_active = 1';
    if (search) {
      whereExtra += ' AND (name LIKE ? OR employee_code LIKE ?)';
      whereParams.push(`%${search}%`, `%${search}%`);
    }
    if (deptIdFilter) {
      whereExtra += ' AND department_id = ?';
      whereParams.push(deptIdFilter);
    }

    // Fetch all matching employees (no LIMIT yet — we need to compute scores for rank filter & sort)
    const [allEmployees] = await pool.execute(
      `SELECT id, name, employee_code, department_id, attendance_score
       FROM employees WHERE 1=1${whereExtra}
       ORDER BY name`,
      whereParams
    );

    if (allEmployees.length === 0) {
      return res.json({ month, data: [], total: 0, page, limit, totalPages: 0, departments: [...deptMap.values()].sort() });
    }

    const empIds = allEmployees.map(e => e.id);
    const inPH = empIds.map(() => '?').join(',');

    const [attendanceData] = await pool.query(
      `SELECT
         employee_id,
         COUNT(CASE WHEN check_in_time IS NOT NULL THEN 1 END) AS present_days,
         COUNT(CASE WHEN status = 'late' THEN 1 END) AS late_days,
         COUNT(CASE WHEN status = 'absent' THEN 1 END) AS absent_days,
         COUNT(CASE WHEN working_hours >= 8 AND check_out_time IS NOT NULL THEN 1 END) AS full_days,
         COALESCE(SUM(CASE WHEN check_out_time IS NOT NULL THEN working_hours ELSE 0 END), 0) AS total_working_hours
       FROM attendance_records
       WHERE DATE_FORMAT(date, '%Y-%m') = ? AND employee_id IN (${inPH})
       GROUP BY employee_id`,
      [month, ...empIds]
    );
    const attMap = new Map();
    attendanceData.forEach(a => attMap.set(a.employee_id, a));

    const [otData] = await pool.query(
      `SELECT employee_id, COALESCE(SUM(hours), 0) AS total_ot_hours
       FROM ot_requests
       WHERE DATE_FORMAT(date, '%Y-%m') = ? AND status = 'approved' AND employee_id IN (${inPH})
       GROUP BY employee_id`,
      [month, ...empIds]
    );
    const otMap = new Map();
    otData.forEach(o => otMap.set(o.employee_id, parseFloat(o.total_ot_hours)));

    // Compute full result set
    let result = allEmployees.map(emp => {
      const att = attMap.get(emp.id) || {};
      const otHours = otMap.get(emp.id) || 0;
      const presentDays = parseInt(att.present_days || 0);
      const lateDays = parseInt(att.late_days || 0);
      const absentDays = parseInt(att.absent_days || 0);
      const fullDays = parseInt(att.full_days || 0);
      const totalWorkingHours = parseFloat(att.total_working_hours || 0);

      const absentDeduction = absentDays * 5;
      const lateDeduction = lateDays * 2;
      const otBonus = Math.min(parseFloat((otHours * 0.5).toFixed(1)), 10);
      const monthlyScore = parseFloat(Math.max(0, Math.min(100, 100 - absentDeduction - lateDeduction + otBonus)).toFixed(1));

      let rank = 'A';
      if (monthlyScore >= 95) rank = 'S';
      else if (monthlyScore >= 85) rank = 'A';
      else if (monthlyScore >= 70) rank = 'B';
      else if (monthlyScore >= 50) rank = 'C';
      else rank = 'D';

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employee_code,
        department: deptMap.get(emp.department_id) || '',
        currentScore: parseFloat(emp.attendance_score || 100),
        presentDays, lateDays, absentDays, fullDays, totalWorkingHours,
        otHours, absentDeduction, lateDeduction, otBonus, monthlyScore, rank,
      };
    });

    // Apply rank filter after score computation
    if (rankFilter && ['S', 'A', 'B', 'C', 'D'].includes(rankFilter.toUpperCase())) {
      result = result.filter(r => r.rank === rankFilter.toUpperCase());
    }

    // Sort
    const sortColMap = {
      monthlyScore: 'monthlyScore',
      totalWorkingHours: 'totalWorkingHours',
      fullDays: 'fullDays',
      lateDays: 'lateDays',
      absentDays: 'absentDays',
      otHours: 'otHours',
      employeeName: 'employeeName',
    };
    const actualCol = sortColMap[sortCol] || 'monthlyScore';
    result.sort((a, b) => {
      const va = a[actualCol];
      const vb = b[actualCol];
      if (va === vb) return 0;
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va > vb ? 1 : -1);
      return sortDir === 'ASC' ? cmp : -cmp;
    });

    const totalCount = result.length;
    const totalPages = Math.ceil(totalCount / limit);
    const paged = result.slice(offset, offset + limit);

    res.json({
      month, data: paged, total: totalCount, page, limit, totalPages,
      departments: [...deptMap.values()].sort(),
    });
  } catch (err) {
    console.error('Get attendance scores error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/records/:id/adjust-ot — admin adjusts OT/holiday effective hours for a salary record
router.put('/records/:id/adjust-ot', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { otHoursOverride, holidayHoursOverride, otBonusDesc, note } = req.body;
    const [existing] = await pool.execute('SELECT * FROM salary_records WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Không tìm thấy bản ghi lương' });

    const record = existing[0];

    // Parse preset config for recalculation
    let baseSalary = parseFloat(record.base_salary || 0);
    let totalWorkDays = record.total_work_days || 22;
    const standardHoursPerDay = 8;
    const hourlyRate = baseSalary / (totalWorkDays * standardHoursPerDay || 176);

    // Get preset config for OT multiplier
    let otMultiplier = 1.5;
    if (record.preset_id) {
      const [presets] = await pool.execute('SELECT custom_formula FROM salary_presets WHERE id = ?', [record.preset_id]);
      if (presets.length > 0) {
        try {
          const cfg = JSON.parse(presets[0].custom_formula || '{}');
          otMultiplier = cfg.otMultiplier || 1.5;
        } catch { }
      }
    }

    const newOtHours = otHoursOverride !== undefined ? parseFloat(otHoursOverride) : parseFloat(record.ot_hours || 0);
    const newOtPay = Math.round(newOtHours * hourlyRate * otMultiplier);

    // Rebuild gross & net
    const newGross = Math.round(
      (parseFloat(record.gross_salary || 0) - parseFloat(record.ot_pay || 0)) + newOtPay
    );
    const newNet = Math.round(
      (parseFloat(record.net_salary || 0) - parseFloat(record.ot_pay || 0)) + newOtPay
    );

    // Store adjustment note in deductions_detail
    let adjInfo = {};
    try { adjInfo = JSON.parse(record.deductions_detail || '{}'); } catch { }
    adjInfo._otAdjust = { otHoursOverride: newOtHours, note: note || '', desc: otBonusDesc || '' };

    await pool.execute(
      `UPDATE salary_records SET ot_hours = ?, ot_pay = ?, gross_salary = ?, net_salary = ?, deductions_detail = ? WHERE id = ?`,
      [newOtHours, newOtPay, newGross, newNet, JSON.stringify(adjInfo), req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM salary_records WHERE id = ?', [req.params.id]);
    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Adjust OT error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ─── Payroll table column config ───
router.get('/table-config', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT columns FROM payroll_table_config WHERE user_id = ?',
      [req.user.id]
    );
    if (rows.length > 0) {
      res.json({ columns: JSON.parse(rows[0].columns) });
    } else {
      res.json({ columns: null });
    }
  } catch (err) {
    console.error('Get table config error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

router.put('/table-config', authenticate, async (req, res) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns phải là array' });
    const colJson = JSON.stringify(columns);
    await pool.execute(
      `INSERT INTO payroll_table_config (user_id, columns) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE columns = VALUES(columns)`,
      [req.user.id, colJson]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Save table config error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
