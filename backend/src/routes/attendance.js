const router = require('express').Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticate, isManagerLevel, getDeptEmployeeIds } = require('../middleware/auth');
const { toCamelCase, toCamelCaseArray, logAudit, haversineDistance } = require('../helpers');

// GET /api/attendance — filter: date, employeeId, employeeCode, month
router.get('/', authenticate, async (req, res) => {
  try {
    let where = `WHERE 1=1`;
    const params = [];
    let needJoin = false;

    if (req.user.role === 'admin') {
      // Admin sees all
      if (req.query.employeeId) {
        params.push(req.query.employeeId);
        where += ` AND ar.employee_id = ?`;
      }
    } else if (isManagerLevel(req, 4)) {
      // Manager / team lead — see department attendance
      const deptIds = await getDeptEmployeeIds(req.user.employeeId);
      if (deptIds.length > 0) {
        where += ` AND ar.employee_id IN (${deptIds.map(() => '?').join(',')})`;
        params.push(...deptIds);
      } else {
        params.push(req.user.employeeId);
        where += ` AND ar.employee_id = ?`;
      }
    } else {
      // Employee sees own only
      params.push(req.user.employeeId);
      where += ` AND ar.employee_id = ?`;
    }

    if (req.query.employeeCode) {
      needJoin = true;
      params.push(`%${req.query.employeeCode}%`);
      where += ` AND e.employee_code LIKE ?`;
    }

    if (req.query.date) {
      params.push(req.query.date);
      where += ` AND ar.date = ?`;
    }

    if (req.query.month) {
      params.push(req.query.month);
      where += ` AND DATE_FORMAT(ar.date, '%Y-%m') = ?`;
    }

    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND ar.status = ?`;
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const joinClause = needJoin ? 'JOIN employees e ON ar.employee_id = e.id' : '';
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM attendance_records ar ${joinClause} ${where}`, params);
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const dataQuery = `SELECT ar.* FROM attendance_records ar ${joinClause} ${where} ORDER BY ar.date DESC, ar.check_in_time DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await pool.execute(dataQuery, params);
    res.json({ data: toCamelCaseArray(rows), pagination: { page, limit, total, totalPages } });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/attendance/export?employeeCode=&date=&month=
router.get('/export', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && !isManagerLevel(req)) return res.status(403).json({ error: 'Chỉ quản lý mới được xuất' });

    const ExcelJS = require('exceljs');
    let where = 'WHERE 1=1';
    const params = [];

    if (req.query.employeeCode) {
      params.push(`%${req.query.employeeCode}%`);
      where += ' AND e.employee_code LIKE ?';
    }
    if (req.query.date) {
      params.push(req.query.date);
      where += ' AND ar.date = ?';
    }
    if (req.query.month) {
      params.push(req.query.month);
      where += ` AND DATE_FORMAT(ar.date, '%Y-%m') = ?`;
    }

    const [rows] = await pool.execute(
      `SELECT ar.*, e.employee_code, e.name AS employee_name, d.name AS department
       FROM attendance_records ar
       JOIN employees e ON ar.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${where}
       ORDER BY ar.date DESC, e.name`,
      params
    );

    const label = req.query.date || req.query.month || 'all';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=lich-su-cham-cong-${label}.xlsx`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const ws = workbook.addWorksheet('Lịch sử chấm công');

    const columns = [
      { header: 'STT', width: 6 },
      { header: 'Mã NV', width: 14 },
      { header: 'Họ tên', width: 28 },
      { header: 'Phòng ban', width: 20 },
      { header: 'Ngày', width: 14 },
      { header: 'Ca', width: 14 },
      { header: 'Giờ vào', width: 12 },
      { header: 'Giờ ra', width: 12 },
      { header: 'Trạng thái', width: 14 },
      { header: 'Trễ (phút)', width: 12 },
      { header: 'Về sớm (phút)', width: 14 },
      { header: 'Giờ làm', width: 12 },
    ];

    ws.columns = columns.map(c => ({ width: c.width }));

    // Title
    const titleRow = ws.addRow([`LỊCH SỬ CHẤM CÔNG${req.query.date ? ' — ' + req.query.date : req.query.month ? ' — Tháng ' + req.query.month : ''}`]);
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF1a56db' } };

    const subRow = ws.addRow([`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} | Tổng: ${rows.length} bản ghi`]);
    subRow.getCell(1).font = { size: 10, italic: true, color: { argb: 'FF666666' } };

    // Header
    const headerRow = ws.addRow(columns.map(c => c.header));
    headerRow.height = 28;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a56db' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const statusMap = { 'on-time': 'Đúng giờ', 'late': 'Đi trễ', 'early-leave': 'Về sớm', 'absent': 'Vắng', 'pending': 'Chưa về' };

    rows.forEach((r, i) => {
      const dateStr = r.date ? (typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0]) : '';
      const dataRow = ws.addRow([
        i + 1,
        r.employee_code || '',
        r.employee_name || '',
        r.department || '',
        dateStr,
        r.shift_name || '',
        r.check_in_time || '',
        r.check_out_time || '',
        statusMap[r.status] || r.status || '',
        r.late_minutes || 0,
        r.early_leave_minutes || 0,
        r.working_hours ? Number(r.working_hours).toFixed(1) : '0',
      ]);
      dataRow.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
          right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        };
      });
      if (i % 2 === 1) {
        dataRow.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        });
      }
    });

    await workbook.commit();
  } catch (err) {
    console.error('Export attendance error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Lỗi xuất file' });
  }
});

// GET /api/attendance/today
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = getVietnamNow().today;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = `WHERE date = ?`;
    const params = [today];

    if (req.user.role !== 'admin') {
      params.push(req.user.employeeId);
      where += ` AND employee_id = ?`;
    }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM attendance_records ${where}`, params
    );

    const [rows] = await pool.execute(
      `SELECT * FROM attendance_records ${where} ORDER BY check_in_time DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: toCamelCaseArray(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Get today attendance error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// GET /api/attendance/stats — dashboard statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const today = getVietnamNow().today;
    const month = today.substring(0, 7);

    // Today's stats
    const [todayRows] = await pool.execute(
      `SELECT
        SUM(CASE WHEN check_in_time IS NOT NULL THEN 1 ELSE 0 END) AS checked_in,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status = 'on-time' THEN 1 ELSE 0 END) AS on_time
       FROM attendance_records WHERE date = ?`,
      [today]
    );

    // Total active employees
    const [empRows] = await pool.execute(`SELECT COUNT(*) AS total FROM employees WHERE is_active = 1`);

    // Monthly stats
    const [monthRows] = await pool.execute(
      `SELECT
        COUNT(DISTINCT CASE WHEN check_in_time IS NOT NULL THEN employee_id END) AS present_employees,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS total_late,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS total_absent
       FROM attendance_records WHERE DATE_FORMAT(date, '%Y-%m') = ?`,
      [month]
    );

    // Pending requests
    const [pendingOTRows] = await pool.execute(`SELECT COUNT(*) AS c FROM ot_requests WHERE status = 'pending'`);
    const [pendingLeaveRows] = await pool.execute(`SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'pending'`);

    const stats = todayRows[0];
    const monthStats = monthRows[0];

    res.json({
      today: {
        totalEmployees: parseInt(empRows[0].total),
        checkedIn: parseInt(stats.checked_in || 0),
        late: parseInt(stats.late || 0),
        onTime: parseInt(stats.on_time || 0),
        notCheckedIn: parseInt(empRows[0].total) - parseInt(stats.checked_in || 0),
      },
      month: {
        presentEmployees: parseInt(monthStats.present_employees || 0),
        totalLate: parseInt(monthStats.total_late || 0),
        totalAbsent: parseInt(monthStats.total_absent || 0),
      },
      pendingRequests: {
        overtime: parseInt(pendingOTRows[0].c),
        leave: parseInt(pendingLeaveRows[0].c),
      },
    });
  } catch (err) {
    console.error('Get attendance stats error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Helper: get current Vietnam time parts (avoids timezone issues on UTC servers)
function getVietnamNow() {
  const now = new Date();
  // Format in Asia/Ho_Chi_Minh to get local parts
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value || '0';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const second = parseInt(get('second'), 10);
  const today = `${year}-${month}-${day}`;
  const totalMinutes = hour * 60 + minute; // minutes since midnight in VN
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return { today, hour, minute, second, totalMinutes, timeStr, dateObj: now };
}

// Helper: check if User-Agent is a mobile device
function isMobileDevice(ua) {
  if (!ua) return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua);
}

// POST /api/attendance/check-in
router.post('/check-in', authenticate, async (req, res) => {
  try {
    // Block PC/Laptop — only allow mobile devices
    const userAgent = req.headers['user-agent'] || '';
    if (!isMobileDevice(userAgent)) {
      return res.status(403).json({ error: 'Chỉ cho phép chấm công từ điện thoại di động. Vui lòng sử dụng điện thoại để chấm công.' });
    }

    const { employeeId, checkInImage, latitude, longitude, shiftId: requestedShiftId, checkInTime: overrideTime } = req.body;
    const empId = employeeId || req.user.employeeId;
    const vn = getVietnamNow();
    const today = vn.today;
    const now = vn.dateObj;

    // Optional: admin-only time override for load testing / backdated correction.
    // Regular employees never send this field → zero impact on normal usage.
    // Non-admin requests that include this field have it silently ignored.
    let effectiveTime = vn;
    if (overrideTime && req.user.role === 'admin') {
      const p = String(overrideTime).split(':').map(Number);
      const oh = p[0] || 0, om = p[1] || 0, os = p[2] || 0;
      if (!isNaN(oh) && !isNaN(om)) {
        const pad = (n) => String(n).padStart(2, '0');
        effectiveTime = { ...vn, hour: oh, minute: om, second: os, totalMinutes: oh * 60 + om, timeStr: `${pad(oh)}:${pad(om)}:${pad(os)}` };
      }
    }

    console.log('[CHECK-IN] empId=%s, requestedShiftId=%s, vnTime=%s %s (override=%s)', empId, requestedShiftId, today, effectiveTime.timeStr, overrideTime || 'none');

    // Check if already checked in today
    const [existing] = await pool.execute(
      `SELECT id FROM attendance_records WHERE employee_id = ? AND date = ? AND check_in_time IS NOT NULL`,
      [empId, today]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Nhân viên đã check-in hôm nay' });
    }

    // GPS check
    if (latitude !== undefined && longitude !== undefined) {
      const [locations] = await pool.execute('SELECT * FROM company_locations');
      if (locations.length > 0) {
        const inRange = locations.some(loc =>
          haversineDistance(latitude, longitude, parseFloat(loc.latitude), parseFloat(loc.longitude)) <= loc.radius
        );
        if (!inRange) {
          return res.status(400).json({ error: 'Vị trí không nằm trong phạm vi cho phép' });
        }
      }
    }

    // Get employee info
    const [empResult] = await pool.execute('SELECT * FROM employees WHERE id = ? AND is_active = 1', [empId]);
    if (empResult.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
    }
    const employee = empResult[0];

    // Get shift — prefer the shiftId sent from frontend, fallback to shift_assignments
    let shiftId = null;
    let shiftName = null;
    let lateMinutes = 0;
    let status = 'on-time';
    let shift = null;

    if (requestedShiftId) {
      const [shiftRows] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [requestedShiftId]);
      if (shiftRows.length > 0) shift = shiftRows[0];
      console.log('[CHECK-IN] Direct shift lookup: found=%s, shift=%j', shiftRows.length > 0, shiftRows[0] || null);
    }

    if (!shift) {
      const dayOfWeek = new Date(today + 'T12:00:00+07:00').getDay(); // Vietnam day of week
      const [shiftResult] = await pool.execute(
        `SELECT sa.shift_id AS sa_shift_id, s.id AS s_id, s.name, s.start_time, s.end_time,
                s.allow_late_minutes, s.allow_early_leave_minutes, s.break_start_time, s.break_end_time
         FROM shift_assignments sa
         JOIN shifts s ON sa.shift_id = s.id
         WHERE sa.employee_id = ? AND sa.day_of_week = ?
           AND sa.effective_from <= ?
           AND (sa.effective_to IS NULL OR sa.effective_to >= ?)
         LIMIT 1`,
        [empId, dayOfWeek, today, today]
      );
      if (shiftResult.length > 0) {
        shift = shiftResult[0];
        shift.id = shift.s_id;
        shift.shift_id = shift.sa_shift_id;
      }
      console.log('[CHECK-IN] Fallback shift_assignments: dayOfWeek=%d, found=%s', dayOfWeek, shiftResult.length > 0);
    }

    if (shift) {
      shiftId = shift.shift_id || shift.id;
      shiftName = shift.name;

      // Calculate late minutes using Vietnam local time (timezone-safe)
      const startTime = shift.start_time || '';
      const timeParts = startTime.split(':').map(Number);
      const shiftH = timeParts[0];
      const shiftM = timeParts[1] || 0;
      console.log('[CHECK-IN] shift.start_time=%s, shiftH=%d, shiftM=%d, vnHour=%d, vnMin=%d', startTime, shiftH, shiftM, effectiveTime.hour, effectiveTime.minute);

      if (!isNaN(shiftH) && !isNaN(shiftM)) {
        const shiftStartMinutes = shiftH * 60 + shiftM;
        lateMinutes = Math.max(0, effectiveTime.totalMinutes - shiftStartMinutes);
        const allowLate = parseInt(shift.allow_late_minutes) || 15;
        console.log('[CHECK-IN] shiftStartMin=%d, vnTotalMin=%d, lateMin=%d, allowLate=%d', shiftStartMinutes, effectiveTime.totalMinutes, lateMinutes, allowLate);
        if (lateMinutes > allowLate) {
          status = 'late';
        }
      }
    } else {
      console.log('[CHECK-IN] WARNING: No shift found! status will be on-time by default');
    }

    const id = uuidv4();
    // Store check-in time in Vietnam local time for DB
    const checkInTimeStr = `${today} ${effectiveTime.timeStr}`;
    await pool.execute(
      `INSERT INTO attendance_records (id, employee_id, employee_name, date, shift_id, shift_name, check_in_time, check_in_image, status, late_minutes, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, empId, employee.name, today, shiftId, shiftName, checkInTimeStr, checkInImage || null, status, lateMinutes, null]
    );
    const [rows] = await pool.execute('SELECT * FROM attendance_records WHERE id = ?', [id]);

    console.log('[CHECK-IN] RESULT: status=%s, lateMinutes=%d, shiftId=%s, shiftName=%s', status, lateMinutes, shiftId, shiftName);

    // Auto penalty for late
    if (status === 'late') {
      await pool.execute(
        `INSERT INTO penalties (id, employee_id, employee_name, date, type, reason, amount, description, is_auto_generated)
         VALUES (?, ?, ?, ?, 'warning', ?, 0, ?, 1)`,
        [
          uuidv4(), empId, employee.name, today,
          `Đi muộn ${lateMinutes} phút`,
          `Tự động tạo cảnh cáo do check-in muộn ${lateMinutes} phút`
        ]
      );
    }

    await logAudit({
      action: 'check-in',
      performedBy: employee.name,
      targetEmployee: employee.name,
      details: `Check-in lúc ${effectiveTime.timeStr} - ${status === 'late' ? `Muộn ${lateMinutes} phút` : 'Đúng giờ'}`,
    });

    res.status(201).json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// POST /api/attendance/check-out
router.post('/check-out', authenticate, async (req, res) => {
  try {
    // Block PC/Laptop — only allow mobile devices
    const userAgent = req.headers['user-agent'] || '';
    if (!isMobileDevice(userAgent)) {
      return res.status(403).json({ error: 'Chỉ cho phép chấm công từ điện thoại di động. Vui lòng sử dụng điện thoại để chấm công.' });
    }

    const { employeeId, checkOutImage, checkOutTime: overrideOutTime } = req.body;
    const empId = employeeId || req.user.employeeId;
    const vn = getVietnamNow();
    const today = vn.today;

    // Admin override: fake checkout time (field-based, opt-in)
    let effectiveOutTime = vn;
    if (overrideOutTime && req.user.role === 'admin') {
      const p = String(overrideOutTime).split(':').map(Number);
      const oh = p[0] || 0, om = p[1] || 0, os = p[2] || 0;
      if (!isNaN(oh) && !isNaN(om)) {
        const pad = (n) => String(n).padStart(2, '0');
        effectiveOutTime = { ...vn, hour: oh, minute: om, second: os, totalMinutes: oh * 60 + om, timeStr: `${pad(oh)}:${pad(om)}:${pad(os)}` };
      }
    }

    // Find today's record
    const [existingRows] = await pool.execute(
      `SELECT * FROM attendance_records WHERE employee_id = ? AND date = ? AND check_in_time IS NOT NULL AND check_out_time IS NULL`,
      [empId, today]
    );
    if (existingRows.length === 0) {
      return res.status(400).json({ error: 'Không tìm thấy bản ghi check-in hôm nay hoặc đã check-out' });
    }

    const record = existingRows[0];
    let earlyLeaveMinutes = 0;
    let status = record.status;

    // Calculate early leave if shift assigned (use Vietnam time)
    if (record.shift_id) {
      const [shiftRows] = await pool.execute('SELECT * FROM shifts WHERE id = ?', [record.shift_id]);
      if (shiftRows.length > 0) {
        const shift = shiftRows[0];
        const [endH, endM] = shift.end_time.split(':').map(Number);
        const shiftEndMinutes = endH * 60 + endM;

        earlyLeaveMinutes = Math.max(0, shiftEndMinutes - effectiveOutTime.totalMinutes);
        if (earlyLeaveMinutes > (parseInt(shift.allow_early_leave_minutes) || 10)) {
          status = 'early-leave';
        }
      }
    }

    // Calculate working hours from check-in time string
    const ciStr = record.check_in_time || '';
    const ciTimePart = ciStr.includes(' ') ? ciStr.split(' ')[1] : ciStr.split('T')[1]?.replace('Z', '') || '00:00:00';
    const [ciH, ciM, ciS] = ciTimePart.split(':').map(Number);
    const ciTotalMin = ciH * 60 + ciM + (ciS || 0) / 60;
    let workingMin = effectiveOutTime.totalMinutes + effectiveOutTime.second / 60 - ciTotalMin;

    // Subtract break time if applicable
    if (record.shift_id) {
      const [shiftRows2] = await pool.execute('SELECT break_start_time, break_end_time FROM shifts WHERE id = ?', [record.shift_id]);
      if (shiftRows2.length > 0) {
        const shift = shiftRows2[0];
        if (shift.break_start_time && shift.break_end_time) {
          const [bsH, bsM] = shift.break_start_time.split(':').map(Number);
          const [beH, beM] = shift.break_end_time.split(':').map(Number);
          const breakMin = (beH * 60 + beM) - (bsH * 60 + bsM);
          workingMin -= breakMin;
        }
      }
    }

    const workingHours = Math.max(0, workingMin / 60).toFixed(2);
    const checkOutTimeStr = `${today} ${effectiveOutTime.timeStr}`;

    await pool.execute(
      `UPDATE attendance_records SET
        check_out_time = ?,
        check_out_image = ?,
        status = ?,
        early_leave_minutes = ?,
        working_hours = ?
       WHERE id = ?`,
      [checkOutTimeStr, checkOutImage || null, status, earlyLeaveMinutes, workingHours, record.id]
    );
    const [rows] = await pool.execute('SELECT * FROM attendance_records WHERE id = ?', [record.id]);

    const [empNameRows] = await pool.execute('SELECT name FROM employees WHERE id = ?', [empId]);
    const empName = empNameRows[0]?.name || empId;

    await logAudit({
      action: 'check-out',
      performedBy: empName,
      targetEmployee: empName,
      details: `Check-out lúc ${effectiveOutTime.timeStr} - Làm ${workingHours}h${earlyLeaveMinutes > 0 ? ` - Về sớm ${earlyLeaveMinutes} phút` : ''}`,
    });

    res.json(toCamelCase(rows[0]));
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

module.exports = router;
