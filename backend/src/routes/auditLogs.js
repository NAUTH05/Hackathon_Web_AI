const router = require('express').Router();
const pool = require('../config/db');
const { authenticate, adminOnly } = require('../middleware/auth');
const { toCamelCaseArray } = require('../helpers');

// GET /api/audit-logs — filter: action, date range
router.get('/', authenticate, adminOnly, async (req, res) => {
  try {
    let where = `WHERE 1=1`;
    const params = [];

    if (req.query.action) {
      params.push(req.query.action);
      where += ` AND action = ?`;
    }

    if (req.query.startDate) {
      params.push(req.query.startDate);
      where += ` AND timestamp >= ?`;
    }

    if (req.query.endDate) {
      params.push(req.query.endDate);
      where += ` AND timestamp <= ?`;
    }

    if (req.query.performedBy) {
      params.push(`%${req.query.performedBy}%`);
      where += ` AND performed_by LIKE ?`;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM audit_logs ${where}`, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await pool.execute(`SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`, params);
    res.json({ data: toCamelCaseArray(rows), pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
