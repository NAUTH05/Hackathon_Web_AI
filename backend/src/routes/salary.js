const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, adminOnly, requireSalaryRole, adminOrSalaryRole } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// ========== PRESETS ==========

// GET /api/salary/presets
router.get('/presets', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM salary_presets ORDER BY created_at DESC');
    res.json(toCamelCaseArray(rows));
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

// GET /api/salary/coefficients
router.get('/coefficients', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM salary_coefficients WHERE is_active = 1 ORDER BY type'
    );
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get salary coefficients error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/salary/coefficients/:type
router.put('/coefficients/:type', authenticate, requireSalaryRole, async (req, res) => {
  try {
    const { multiplier, description } = req.body;
    const type = req.params.type;

    // Check if exists
    const [existing] = await pool.execute(
      'SELECT * FROM salary_coefficients WHERE type = ?', [type]
    );

    if (existing.length === 0) {
      // Create new
      const id = uuidv4();
      await pool.execute(
        `INSERT INTO salary_coefficients (id, type, multiplier, description)
         VALUES (?, ?, ?, ?)`,
        [id, type, multiplier, description || null]
      );
      const [rows] = await pool.execute('SELECT * FROM salary_coefficients WHERE id = ?', [id]);
      res.status(201).json(toCamelCase(rows[0]));
    } else {
      // Update existing
      await pool.execute(
        `UPDATE salary_coefficients SET multiplier = ?, description = ? WHERE type = ?`,
        [multiplier, description || null, type]
      );
      const [rows] = await pool.execute('SELECT * FROM salary_coefficients WHERE type = ?', [type]);
      res.json(toCamelCase(rows[0]));
    }
  } catch (err) {
    console.error('Update salary coefficient error:', err);
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
      `SELECT sr.*, e.employee_code, d.name AS department, e.position
       ${baseJoin}
       ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Summary stats for the full filtered set
    const [sumResult] = await pool.query(
      `SELECT COALESCE(SUM(sr.net_salary), 0) AS total_net, COALESCE(SUM(sr.gross_salary), 0) AS total_gross
       ${baseJoin} ${where}`, params
    );

    res.json({
      data: toCamelCaseArray(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: { totalNet: parseFloat(sumResult[0].total_net), totalGross: parseFloat(sumResult[0].total_gross) },
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
      `SELECT employee_id, COALESCE(SUM(working_hours), 0) AS total_hours
       FROM attendance_records
       WHERE DATE_FORMAT(date, '%Y-%m') = ? AND check_out_time IS NOT NULL
       GROUP BY employee_id`, [month]
    );
    const hoursMap = new Map();
    for (const h of allHours) hoursMap.set(h.employee_id, parseFloat(h.total_hours));

    const [allPenalties] = await pool.execute(
      `SELECT employee_id, COALESCE(SUM(amount), 0) AS total
       FROM penalties
       WHERE type = 'deduction' AND status = 'active' AND DATE_FORMAT(date, '%Y-%m') = ?
       GROUP BY employee_id`, [month]
    );
    const penMap = new Map();
    for (const p of allPenalties) penMap.set(p.employee_id, parseFloat(p.total));

    // Function to parse salary config from custom_formula JSON
    function parseConfig(cfStr) {
      try {
        const c = JSON.parse(cfStr || '{}');
        return {
          salaryBasis: c.salaryBasis || 'hourly',
          otMultiplier: c.otMultiplier ?? 1.5,
          latePenaltyPerDay: c.latePenaltyPerDay ?? 50000,
          includeOT: c.includeOT !== false,
          includeAllowances: c.includeAllowances !== false,
          includeDeductions: c.includeDeductions !== false,
          includeLatePenalty: c.includeLatePenalty !== false,
        };
      } catch {
        return { salaryBasis: 'hourly', otMultiplier: 1.5, latePenaltyPerDay: 50000, includeOT: true, includeAllowances: true, includeDeductions: true, includeLatePenalty: true };
      }
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
      const presentDays = timesheet.present_days || 0;
      const lateDays = timesheet.late_days || 0;
      const totalOtHours = parseFloat(timesheet.total_ot_hours || 0);

      const standardHoursPerDay = 8;
      const totalStandardHours = totalWorkDays * standardHoursPerDay;
      const hourlyRate = baseSalary / totalStandardHours;
      const dailyRate = hourlyRate * standardHoursPerDay;

      const actualWorkedHours = hoursMap.get(emp.emp_id) || 0;
      const rawDeductions = penMap.get(emp.emp_id) || 0;

      // Base pay
      let basePay;
      if (config.salaryBasis === 'daily') {
        basePay = presentDays * dailyRate;
      } else if (config.salaryBasis === 'fixed') {
        basePay = baseSalary;
      } else {
        const workedHours = actualWorkedHours > 0 ? actualWorkedHours : (presentDays * standardHoursPerDay);
        basePay = workedHours * hourlyRate;
      }

      const otMultiplier = coeffMap.get('overtime') || config.otMultiplier;
      const otPay = config.includeOT ? (totalOtHours * hourlyRate * otMultiplier) : 0;
      const allowancePay = config.includeAllowances ? allowances : 0;
      const insurance = 0; // Will be set by admin
      const healthInsurance = 0; // Will be set by admin
      const deductions = config.includeDeductions ? rawDeductions : 0;
      const dedication = 0; // Will be calculated/set by admin
      const latePenalty = config.includeLatePenalty ? (lateDays * config.latePenaltyPerDay) : 0;

      const grossSalary = basePay + otPay + allowancePay + insurance + healthInsurance;
      const netSalary = grossSalary - deductions - latePenalty - dedication;

      insertValues.push([
        uuidv4(), emp.emp_id, emp.employee_name, month, presetId, presetName,
        baseSalary, totalWorkDays, presentDays, totalOtHours,
        Math.round(otPay), allowances, JSON.stringify({}), // allowances_detail empty
        insurance, healthInsurance,
        deductions, JSON.stringify({}), // deductions_detail empty
        dedication, Math.round(latePenalty),
        Math.round(grossSalary), Math.round(netSalary)
      ]);
      count++;
    }

    // Batch insert
    for (let i = 0; i < insertValues.length; i += 500) {
      const chunk = insertValues.slice(i, i + 500);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = chunk.flat();
      await pool.query(
        `INSERT INTO salary_records (id, employee_id, employee_name, month, preset_id, preset_name,
          base_salary, total_work_days, present_days, ot_hours, ot_pay, allowances, allowances_detail,
          insurance, health_insurance, deductions, deductions_detail, dedication, late_penalty,
          gross_salary, net_salary) VALUES ${placeholders}`,
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

module.exports = router;
