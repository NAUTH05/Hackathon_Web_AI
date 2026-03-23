const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/timesheets/daily?date=YYYY-MM-DD&page=1&limit=30&search=...
router.get('/daily', authenticate, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;

    let where = 'WHERE e.is_active = 1';
    const countParams = [];
    const dataParams = [date];

    if (search) {
      where += ` AND (e.name LIKE ? OR e.employee_code LIKE ?)`;
      countParams.push(search, search);
      dataParams.push(search, search);
    }

    // Non-admin: only show own data
    if (req.user.role !== 'admin') {
      where += ` AND e.id = ?`;
      countParams.push(req.user.employeeId);
      dataParams.push(req.user.employeeId);
    }

    // Count total
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM employees e ${where}`,
      countParams
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    // Fetch with LEFT JOIN to attendance for the given date
    const [rows] = await pool.execute(
      `SELECT e.id AS employee_id, e.employee_code, e.name AS employee_name,
              d.name AS department, e.position,
              ar.id AS attendance_id, ar.date, ar.check_in_time, ar.check_out_time,
              ar.status AS attendance_status, ar.late_minutes, ar.early_leave_minutes,
              ar.working_hours, ar.shift_name,
              ar.check_in_image, ar.check_out_image
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN attendance_records ar ON e.id = ar.employee_id AND ar.date = ?
       ${where}
       ORDER BY e.name
       LIMIT ${limit} OFFSET ${offset}`,
      dataParams
    );

    // Check if date is locked
    const [lockRows] = await pool.execute(
      'SELECT * FROM daily_timesheet_locks WHERE date = ?', [date]
    );
    const isLocked = lockRows.length > 0;

    res.json({
      data: toCamelCaseArray(rows),
      pagination: { page, limit, total, totalPages },
      date,
      isLocked,
      lockedBy: isLocked ? lockRows[0].locked_by : null,
    });
  } catch (err) {
    console.error('Get daily timesheet error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/timesheets/lock-day — lock daily timesheet
router.post('/lock-day', authenticate, adminOnly, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'Thiếu ngày (date)' });

    await pool.execute(
      `INSERT IGNORE INTO daily_timesheet_locks (date, locked_by) VALUES (?, ?)`,
      [date, req.user.name]
    );

    await logAudit({
      action: 'timesheet-lock-day',
      performedBy: req.user.name,
      details: `Khóa bảng công ngày ${date}`,
    });

    res.json({ message: `Đã khóa bảng công ngày ${date}` });
  } catch (err) {
    console.error('Lock daily timesheet error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/timesheets/unlock-day — unlock daily timesheet
router.post('/unlock-day', authenticate, adminOnly, async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'Thiếu ngày (date)' });

    await pool.execute(
      `DELETE FROM daily_timesheet_locks WHERE date = ?`,
      [date]
    );

    await logAudit({
      action: 'timesheet-unlock-day',
      performedBy: req.user.name,
      details: `Mở khóa bảng công ngày ${date}`,
    });

    res.json({ message: `Đã mở khóa bảng công ngày ${date}` });
  } catch (err) {
    console.error('Unlock daily timesheet error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/timesheets?month=YYYY-MM
router.get('/', authenticate, async (req, res) => {
  try {
    const { month } = req.query;
    let where = `WHERE 1=1`;
    const params = [];

    if (month) {
      params.push(month);
      where += ` AND mt.month = ?`;
    }

    if (req.user.role !== 'admin') {
      params.push(req.user.employeeId);
      where += ` AND mt.employee_id = ?`;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM monthly_timesheets mt JOIN employees e ON mt.employee_id = e.id ${where}`, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await pool.execute(`SELECT mt.*, e.employee_code FROM monthly_timesheets mt JOIN employees e ON mt.employee_id = e.id ${where} ORDER BY mt.employee_name LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ data: toCamelCaseArray(rows), pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error('Get timesheets error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/timesheets/generate — generate monthly timesheets (bulk optimized)
router.post('/generate', authenticate, adminOnly, async (req, res) => {
  try {
    const { month } = req.body; // YYYY-MM
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    const [year, mon] = month.split('-').map(Number);

    // Calculate total work days (excluding weekends and holidays)
    const daysInMonth = new Date(year, mon, 0).getDate();
    const [holidayRows] = await pool.execute(
      `SELECT date FROM holidays WHERE DATE_FORMAT(date, '%Y-%m') = ?`,
      [month]
    );
    const holidayDates = new Set(holidayRows.map(h => {
      const s = typeof h.date === 'string' ? h.date : h.date.toISOString();
      return s.split('T')[0];
    }));

    let totalWorkDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(dateStr + 'T12:00:00+07:00').getDay();
      if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) {
        totalWorkDays++;
      }
    }

    // Bulk aggregate attendance stats (1 query instead of 100K)
    const [attStats] = await pool.execute(
      `SELECT employee_id,
        SUM(CASE WHEN check_in_time IS NOT NULL THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN status = 'early-leave' THEN 1 ELSE 0 END) AS early_leave,
        COALESCE(SUM(working_hours), 0) AS total_hours
       FROM attendance_records
       WHERE DATE_FORMAT(date, '%Y-%m') = ?
       GROUP BY employee_id`,
      [month]
    );

    // Bulk aggregate leave days (1 query instead of 100K)
    const [leaveStats] = await pool.execute(
      `SELECT employee_id,
        COALESCE(SUM(DATEDIFF(end_date, start_date) + 1), 0) AS leave_days
       FROM leave_requests
       WHERE status = 'approved' AND DATE_FORMAT(start_date, '%Y-%m') = ?
       GROUP BY employee_id`,
      [month]
    );

    // Bulk aggregate OT hours (1 query instead of 100K)
    const [otStats] = await pool.execute(
      `SELECT employee_id,
        COALESCE(SUM(hours), 0) AS ot_hours
       FROM ot_requests
       WHERE status = 'approved' AND DATE_FORMAT(date, '%Y-%m') = ?
       GROUP BY employee_id`,
      [month]
    );

    // Build lookup maps
    const attMap = new Map();
    for (const row of attStats) attMap.set(row.employee_id, row);
    const leaveMap = new Map();
    for (const row of leaveStats) leaveMap.set(row.employee_id, row);
    const otMap = new Map();
    for (const row of otStats) otMap.set(row.employee_id, row);

    // Get all active employees
    const [employees] = await pool.execute('SELECT id, name FROM employees WHERE is_active = 1');

    // Batch upsert (1000 at a time instead of 100K individual inserts)
    const BATCH_SIZE = 1000;
    let totalInserted = 0;

    for (let i = 0; i < employees.length; i += BATCH_SIZE) {
      const batch = employees.slice(i, i + BATCH_SIZE);
      const values = [];
      const placeholders = [];

      for (const emp of batch) {
        const att = attMap.get(emp.id) || { present: 0, late_count: 0, early_leave: 0, total_hours: 0 };
        const leave = leaveMap.get(emp.id) || { leave_days: 0 };
        const ot = otMap.get(emp.id) || { ot_hours: 0 };

        const presentDays = parseInt(att.present || 0);
        const lateDays = parseInt(att.late_count || 0);
        const earlyLeaveDays = parseInt(att.early_leave || 0);
        const leaveDays = parseInt(leave.leave_days);
        const absentDays = Math.max(0, totalWorkDays - presentDays - leaveDays);
        const totalOtHours = parseFloat(ot.ot_hours);
        const onTimeRate = presentDays > 0 ? ((presentDays - lateDays) / presentDays * 100) : 0;

        placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        values.push(
          emp.id, emp.name, month, totalWorkDays, presentDays,
          absentDays, lateDays, earlyLeaveDays, parseFloat(att.total_hours),
          totalOtHours, leaveDays, onTimeRate.toFixed(2)
        );
      }

      if (placeholders.length > 0) {
        await pool.query(
          `INSERT INTO monthly_timesheets (employee_id, employee_name, month, total_work_days, present_days,
            absent_days, late_days, early_leave_days, total_working_hours, total_ot_hours, leave_days, on_time_rate)
           VALUES ${placeholders.join(',')}
           ON DUPLICATE KEY UPDATE
            total_work_days = VALUES(total_work_days), present_days = VALUES(present_days),
            absent_days = VALUES(absent_days), late_days = VALUES(late_days),
            early_leave_days = VALUES(early_leave_days), total_working_hours = VALUES(total_working_hours),
            total_ot_hours = VALUES(total_ot_hours), leave_days = VALUES(leave_days),
            on_time_rate = VALUES(on_time_rate), employee_name = VALUES(employee_name)`,
          values
        );
      }

      totalInserted += batch.length;
    }

    await logAudit({
      action: 'timesheet-generate',
      performedBy: req.user.name,
      details: `Tổng hợp bảng công tháng ${month} cho ${totalInserted} nhân viên`,
    });

    res.json({ message: `Đã tổng hợp bảng công cho ${totalInserted} nhân viên`, count: totalInserted });
  } catch (err) {
    console.error('Generate timesheets error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/timesheets/lock — lock timesheet for a month
router.post('/lock', authenticate, adminOnly, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    await pool.execute(
      `UPDATE monthly_timesheets SET is_locked = 1, locked_at = NOW(), locked_by = ? WHERE month = ?`,
      [req.user.name, month]
    );

    await logAudit({
      action: 'timesheet-lock',
      performedBy: req.user.name,
      details: `Khóa bảng công tháng ${month}`,
    });

    res.json({ message: `Đã khóa bảng công tháng ${month}` });
  } catch (err) {
    console.error('Lock timesheets error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/timesheets/unlock — unlock timesheet for a month
router.post('/unlock', authenticate, adminOnly, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month) return res.status(400).json({ error: 'Thiếu tháng (month)' });

    await pool.execute(
      `UPDATE monthly_timesheets SET is_locked = 0, locked_at = NULL, locked_by = NULL WHERE month = ?`,
      [month]
    );

    await logAudit({
      action: 'timesheet-unlock',
      performedBy: req.user.name,
      details: `Mở khóa bảng công tháng ${month}`,
    });

    res.json({ message: `Đã mở khóa bảng công tháng ${month}` });
  } catch (err) {
    console.error('Unlock timesheets error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
