const pool = require('./config/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

async function logAudit({ action, performedBy, targetEmployee, details, oldValue, newValue }) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (id, action, performed_by, target_employee, details, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), action, performedBy, targetEmployee || null, details || null, oldValue || null, newValue || null]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// Snake_case → camelCase converter for DB rows
const MYSQL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
function toCamelCase(row) {
  if (!row) return null;
  const result = {};
  for (const key of Object.keys(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const val = row[key];
    if (val instanceof Date) {
      result[camel] = val.toISOString();
    } else if (typeof val === 'string' && MYSQL_DATETIME_RE.test(val)) {
      // "2026-03-10 08:42:47" → "2026-03-10T08:42:47+07:00" (Vietnam local time)
      result[camel] = val.replace(' ', 'T') + (val.includes('+') || val.endsWith('Z') ? '' : '+07:00');
    } else {
      result[camel] = val;
    }
  }
  return result;
}

function toCamelCaseArray(rows) {
  return rows.map(toCamelCase);
}

// Haversine formula — returns distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Xoá file avatar cũ trên disk nếu là file upload local.
 * Bỏ qua nếu URL là null/undefined, data URI, hay URL ngoài.
 * @param {string|null|undefined} url  - URL avatar cũ đang lưu trong DB
 */
function deleteAvatarFile(url) {
  if (!url || url.startsWith('data:')) return;
  // Chỉ xoá file có path /uploads/avatars/ (file local của backend)
  const match = url.match(/\/uploads\/avatars\/([^?#]+)$/);
  if (!match) return;
  const filename = match[1];
  // Bảo vệ path traversal
  if (filename.includes('..') || filename.includes('/')) return;
  const filePath = path.join(__dirname, '..', 'uploads', 'avatars', filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('deleteAvatarFile error:', err.message);
    }
  });
}

module.exports = { logAudit, toCamelCase, toCamelCaseArray, haversineDistance, deleteAvatarFile };

