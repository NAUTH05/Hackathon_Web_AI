/**
 * GET /api/ai-context
 * Returns a JSON summary of the authenticated user's data so that
 * the AI assistant can answer personal questions like:
 *   "Tôi đã đăng ký OT bao nhiêu lần?"
 *   "Tháng này tôi đi làm mấy ngày?"
 */

const router = require('express').Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
    try {
        const empId = req.user.employeeId;
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // --- OT summary (all time + this month) ---
        const [[otAll]] = await pool.execute(
            `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN hours ELSE 0 END), 0) AS total_hours
       FROM ot_requests WHERE employee_id = ?`,
            [empId]
        );
        const [[otMonth]] = await pool.execute(
            `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN hours ELSE 0 END), 0) AS total_hours
       FROM ot_requests
       WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
            [empId, currentMonth]
        );

        // Recent OT (latest 5)
        const [recentOT] = await pool.execute(
            `SELECT date, start_time, end_time, hours, status, reason
       FROM ot_requests WHERE employee_id = ?
       ORDER BY date DESC LIMIT 5`,
            [empId]
        );

        // --- Attendance summary this month ---
        const [[attMonth]] = await pool.execute(
            `SELECT
         COUNT(*) AS total_records,
         SUM(CASE WHEN status = 'on-time'    THEN 1 ELSE 0 END) AS on_time,
         SUM(CASE WHEN status = 'late'       THEN 1 ELSE 0 END) AS late,
         SUM(CASE WHEN status = 'absent'     THEN 1 ELSE 0 END) AS absent,
         SUM(CASE WHEN status = 'early-leave'THEN 1 ELSE 0 END) AS early_leave,
         COALESCE(SUM(working_hours), 0)                         AS total_hours
       FROM attendance_records
       WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
            [empId, currentMonth]
        );

        // --- Leave summary this month ---
        const [[leaveMonth]] = await pool.execute(
            `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending
       FROM leave_requests
       WHERE employee_id = ? AND DATE_FORMAT(start_date, '%Y-%m') = ?`,
            [empId, currentMonth]
        );

        // --- Penalty summary this month ---
        const [[penaltyMonth]] = await pool.execute(
            `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(amount), 0) AS total_amount
       FROM penalties
       WHERE employee_id = ? AND DATE_FORMAT(date, '%Y-%m') = ?`,
            [empId, currentMonth]
        );

        // --- Salary this month (if calculated) ---
        const [[salaryRow]] = await pool.execute(
            `SELECT net_salary, gross_salary, present_days, ot_hours, deductions
       FROM salary_records WHERE employee_id = ? AND month = ?
       LIMIT 1`,
            [empId, currentMonth]
        );

        res.json({
            month: currentMonth,
            employee: {
                id: empId,
                name: req.user.name,
                role: req.user.role,
                department: req.user.department,
            },
            overtime: {
                allTime: otAll,
                thisMonth: otMonth,
                recent: recentOT,
            },
            attendance: attMonth,
            leave: leaveMonth,
            penalty: penaltyMonth,
            salary: salaryRow || null,
        });
    } catch (err) {
        console.error('AI context error:', err);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
