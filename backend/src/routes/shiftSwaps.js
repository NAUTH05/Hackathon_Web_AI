const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit } = require('../helpers');

// GET /api/shift-swaps
router.get('/', authenticate, async (req, res) => {
  try {
    let query = `SELECT * FROM shift_swap_requests WHERE 1=1`;
    const params = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.employeeId);
      query += ` AND (requester_id = ? OR target_id = ?)`;
      params.push(req.user.employeeId);
    }

    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json(toCamelCaseArray(rows));
  } catch (err) {
    console.error('Get shift swaps error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/shift-swaps
router.post('/', authenticate, async (req, res) => {
  try {
    const { requesterId, requesterName, targetId, targetName, date, requesterShiftId, targetShiftId, reason } = req.body;
    const id = req.body.id || uuidv4();

    await pool.execute(
      `INSERT INTO shift_swap_requests (id, requester_id, requester_name, target_id, target_name, date, requester_shift_id, target_shift_id, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, requesterId || req.user.employeeId, requesterName || req.user.name, targetId, targetName, date, requesterShiftId, targetShiftId, reason || null]
    );
    const [rows] = await pool.execute('SELECT * FROM shift_swap_requests WHERE id = ?', [id]);

    await logAudit({
      action: 'shift-swap',
      performedBy: req.user.name,
      targetEmployee: targetName,
      details: `Yêu cầu đổi ca ngày ${date} với ${targetName}`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Create shift swap error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// PUT /api/shift-swaps/:id — accept/reject
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status phải là accepted hoặc rejected' });
    }

    // Only the target employee or admin can accept/reject
    const [existingRows] = await pool.execute('SELECT * FROM shift_swap_requests WHERE id = ?', [req.params.id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Không tìm thấy yêu cầu đổi ca' });

    const swap = existingRows[0];
    if (req.user.role !== 'admin' && swap.target_id !== req.user.employeeId) {
      return res.status(403).json({ error: 'Chỉ người được đổi ca hoặc admin mới có quyền' });
    }

    await pool.execute(
      `UPDATE shift_swap_requests SET status = ? WHERE id = ?`,
      [status, req.params.id]
    );
    const [rows] = await pool.execute('SELECT * FROM shift_swap_requests WHERE id = ?', [req.params.id]);

    // If accepted, swap the shift assignments
    if (status === 'accepted') {
      // Use noon Vietnam time to get correct day of week
      const dateStr = typeof swap.date === 'string' ? swap.date.split('T')[0] : swap.date;
      const swapDate = new Date(dateStr + 'T12:00:00+07:00');
      const dayOfWeek = swapDate.getDay();

      // Update requester's shift
      await pool.execute(
        `UPDATE shift_assignments SET shift_id = ?
         WHERE employee_id = ? AND day_of_week = ?
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
        [swap.target_shift_id, swap.requester_id, dayOfWeek, swap.date, swap.date]
      );

      // Update target's shift
      await pool.execute(
        `UPDATE shift_assignments SET shift_id = ?
         WHERE employee_id = ? AND day_of_week = ?
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
        [swap.requester_shift_id, swap.target_id, dayOfWeek, swap.date, swap.date]
      );
    }

    await logAudit({
      action: 'shift-swap',
      performedBy: req.user.name,
      targetEmployee: swap.requester_name,
      details: `${status === 'accepted' ? 'Chấp nhận' : 'Từ chối'} đổi ca ngày ${swap.date}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Update shift swap error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
