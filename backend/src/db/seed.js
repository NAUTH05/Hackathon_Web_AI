/**
 * Consolidated Seed Script
 * ========================
 * Seeds ALL data: schema, core data, and optionally 100k employees.
 *
 * Usage:
 *   node src/db/seed.js              # Core data only (12 employees)
 *   node src/db/seed.js --bulk       # Core data + 100k employees
 *   node src/db/seed.js --bulk 5000  # Core data + 5000 employees
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ===================== CONFIG =====================
const isBulk = process.argv.includes('--bulk');
const bulkCount = (() => {
  const idx = process.argv.indexOf('--bulk');
  if (idx !== -1 && process.argv[idx + 1] && !isNaN(process.argv[idx + 1])) {
    return parseInt(process.argv[idx + 1]);
  }
  return 100000;
})();

// ===================== DB POOL =====================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: isBulk ? 20 : 10,
  dateStrings: true,
});

// ===================== HELPER =====================
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function removeVietnamese(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// ===================== MAIN =====================
async function seed() {
  const connection = await pool.getConnection();
  try {
    console.log('🔧 Starting seed...\n');

    // ========== 1. RUN SCHEMA ==========
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await connection.execute(stmt);
    }

    // Add FK for departments.manager_id -> employees.id (idempotent)
    const [fkRows] = await connection.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = 'departments'
       AND CONSTRAINT_NAME = 'fk_dept_manager'`
    );
    if (fkRows[0].cnt === 0) {
      await connection.execute(
        'ALTER TABLE departments ADD CONSTRAINT fk_dept_manager FOREIGN KEY (manager_id) REFERENCES employees(id)'
      );
    }
    console.log('✅ Schema created');

    // ========== 2. DEPARTMENTS (tree structure) ==========
    const departments = [
      { id: 'dept-001', name: 'Ban Giám đốc', description: 'Ban giám đốc công ty', parentId: null },
      { id: 'dept-002', name: 'Kỹ thuật', description: 'Phòng kỹ thuật phần mềm', parentId: 'dept-001' },
      { id: 'dept-003', name: 'Nhân sự', description: 'Phòng nhân sự', parentId: 'dept-001' },
      { id: 'dept-004', name: 'Kinh doanh', description: 'Phòng kinh doanh', parentId: 'dept-001' },
      { id: 'dept-005', name: 'Marketing', description: 'Phòng marketing', parentId: 'dept-004' },
      { id: 'dept-006', name: 'Kế toán', description: 'Phòng kế toán', parentId: 'dept-001' },
      { id: 'dept-007', name: 'Frontend', description: 'Nhóm Frontend', parentId: 'dept-002' },
      { id: 'dept-008', name: 'Backend', description: 'Nhóm Backend', parentId: 'dept-002' },
    ];

    for (const d of departments) {
      await connection.execute(
        `INSERT IGNORE INTO departments (id, name, description, parent_id) VALUES (?, ?, ?, ?)`,
        [d.id, d.name, d.description, d.parentId]
      );
    }
    console.log('✅ Departments seeded (tree structure)');

    // ========== 3. EMPLOYEES (core 12) ==========
    const employees = [
      { id: 'emp-001', name: 'Nguyễn Văn An',    code: 'NV001', dept: 'dept-001', position: 'Giám đốc',              roleLevel: 2, email: 'an.nguyen@company.vn',    phone: '0901234001' },
      { id: 'emp-002', name: 'Trần Thị Bình',    code: 'NV002', dept: 'dept-003', position: 'Trưởng phòng nhân sự',  roleLevel: 3, email: 'binh.tran@company.vn',    phone: '0901234002' },
      { id: 'emp-003', name: 'Lê Hoàng Cường',   code: 'NV003', dept: 'dept-007', position: 'Frontend Developer',    roleLevel: 5, email: 'cuong.le@company.vn',     phone: '0901234003' },
      { id: 'emp-004', name: 'Phạm Thị Dung',    code: 'NV004', dept: 'dept-004', position: 'Trưởng phòng kinh doanh', roleLevel: 3, email: 'dung.pham@company.vn',  phone: '0901234004' },
      { id: 'emp-005', name: 'Hoàng Minh Đức',   code: 'NV005', dept: 'dept-008', position: 'Backend Developer',     roleLevel: 5, email: 'duc.hoang@company.vn',    phone: '0901234005' },
      { id: 'emp-006', name: 'Vũ Thị Hoa',       code: 'NV006', dept: 'dept-005', position: 'Marketing Executive',   roleLevel: 5, email: 'hoa.vu@company.vn',       phone: '0901234006' },
      { id: 'emp-007', name: 'Đặng Văn Giang',   code: 'NV007', dept: 'dept-006', position: 'Kế toán trưởng',        roleLevel: 3, email: 'giang.dang@company.vn',   phone: '0901234007' },
      { id: 'emp-008', name: 'Ngô Thị Hương',    code: 'NV008', dept: 'dept-003', position: 'Nhân viên nhân sự',     roleLevel: 5, email: 'huong.ngo@company.vn',    phone: '0901234008' },
      { id: 'emp-009', name: 'Bùi Thanh Inh',    code: 'NV009', dept: 'dept-004', position: 'Nhân viên kinh doanh',  roleLevel: 5, email: 'inh.bui@company.vn',      phone: '0901234009' },
      { id: 'emp-010', name: 'Lý Văn Khải',      code: 'NV010', dept: 'dept-002', position: 'Trưởng phòng kỹ thuật', roleLevel: 3, email: 'khai.ly@company.vn',      phone: '0901234010' },
      { id: 'emp-011', name: 'Mai Thị Lan',      code: 'NV011', dept: 'dept-007', position: 'Frontend Developer',    roleLevel: 5, email: 'lan.mai@company.vn',      phone: '0901234011' },
      { id: 'emp-012', name: 'Trịnh Văn Minh',   code: 'NV012', dept: 'dept-008', position: 'Backend Developer',     roleLevel: 5, email: 'minh.trinh@company.vn',   phone: '0901234012' },
    ];

    for (const e of employees) {
      await connection.execute(
        `INSERT IGNORE INTO employees (id, name, employee_code, department_id, position, role_level, email, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.name, e.code, e.dept, e.position, e.roleLevel, e.email, e.phone]
      );
    }
    console.log('✅ Core employees seeded (12)');

    // Update department managers
    await connection.execute(`UPDATE departments SET manager_id = 'emp-001' WHERE id = 'dept-001'`);
    await connection.execute(`UPDATE departments SET manager_id = 'emp-010' WHERE id = 'dept-002'`);
    await connection.execute(`UPDATE departments SET manager_id = 'emp-002' WHERE id = 'dept-003'`);
    await connection.execute(`UPDATE departments SET manager_id = 'emp-004' WHERE id = 'dept-004'`);
    await connection.execute(`UPDATE departments SET manager_id = 'emp-007' WHERE id = 'dept-006'`);

    // ========== 4. USERS (core 6) ==========
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);

    const users = [
      { id: 'user-001', empId: 'emp-001', username: 'admin',     hash: adminHash, name: 'Nguyễn Văn An',   role: 'admin', roleLevel: 1, dept: 'Ban Giám đốc' },
      { id: 'user-002', empId: 'emp-002', username: 'binh.tran', hash: userHash,  name: 'Trần Thị Bình',   role: 'user',  roleLevel: 3, dept: 'Nhân sự' },
      { id: 'user-003', empId: 'emp-003', username: 'cuong.le',  hash: userHash,  name: 'Lê Hoàng Cường',  role: 'user',  roleLevel: 5, dept: 'Frontend' },
      { id: 'user-004', empId: 'emp-004', username: 'dung.pham', hash: userHash,  name: 'Phạm Thị Dung',   role: 'user',  roleLevel: 3, dept: 'Kinh doanh' },
      { id: 'user-005', empId: 'emp-005', username: 'duc.hoang', hash: userHash,  name: 'Hoàng Minh Đức',  role: 'user',  roleLevel: 5, dept: 'Backend' },
      { id: 'user-006', empId: 'emp-010', username: 'khai.ly',   hash: userHash,  name: 'Lý Văn Khải',     role: 'user',  roleLevel: 3, dept: 'Kỹ thuật' },
    ];

    for (const u of users) {
      await connection.execute(
        `INSERT IGNORE INTO users (id, employee_id, username, password_hash, name, role, role_level, department)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.empId, u.username, u.hash, u.name, u.role, u.roleLevel, u.dept]
      );
    }
    console.log('✅ Core users seeded (6)');

    // ========== 5. SHIFTS ==========
    const shifts = [
      { id: 'shift-001', name: 'Ca sáng',       startTime: '08:00', endTime: '12:00', color: '#4CAF50', overnight: false },
      { id: 'shift-002', name: 'Ca chiều',      startTime: '13:00', endTime: '17:00', color: '#2196F3', overnight: false },
      { id: 'shift-003', name: 'Ca hành chính', startTime: '08:00', endTime: '17:00', color: '#FF9800', breakStart: '12:00', breakEnd: '13:00', overnight: false },
      { id: 'shift-004', name: 'Ca đêm',        startTime: '22:00', endTime: '06:00', color: '#9C27B0', breakStart: '01:00', breakEnd: '01:30', overnight: true },
    ];

    for (const s of shifts) {
      await connection.execute(
        `INSERT IGNORE INTO shifts (id, name, start_time, end_time, color, allow_late_minutes, allow_early_leave_minutes, break_start_time, break_end_time, is_overnight)
         VALUES (?, ?, ?, ?, ?, 15, 10, ?, ?, ?)`,
        [s.id, s.name, s.startTime, s.endTime, s.color, s.breakStart || null, s.breakEnd || null, s.overnight ? 1 : 0]
      );
    }
    console.log('✅ Shifts seeded');

    // ========== 6. SHIFT ASSIGNMENTS (Mon-Fri for core employees) ==========
    for (const emp of employees) {
      for (let day = 1; day <= 5; day++) {
        await connection.execute(
          `INSERT IGNORE INTO shift_assignments (id, employee_id, shift_id, day_of_week, effective_from)
           VALUES (?, ?, ?, ?, ?)`,
          [`sa-${emp.id}-${day}`, emp.id, 'shift-003', day, '2024-01-01']
        );
      }
    }
    console.log('✅ Shift assignments seeded');

    // ========== 7. HOLIDAYS 2026 ==========
    const holidays = [
      { id: 'hol-001', name: 'Tết Dương lịch',              date: '2026-01-01', type: 'public',  multiplier: 2.0 },
      { id: 'hol-002', name: 'Tết Nguyên đán',              date: '2026-02-17', type: 'public',  multiplier: 3.0 },
      { id: 'hol-003', name: 'Tết Nguyên đán',              date: '2026-02-18', type: 'public',  multiplier: 3.0 },
      { id: 'hol-004', name: 'Tết Nguyên đán',              date: '2026-02-19', type: 'public',  multiplier: 3.0 },
      { id: 'hol-005', name: 'Tết Nguyên đán',              date: '2026-02-20', type: 'public',  multiplier: 3.0 },
      { id: 'hol-006', name: 'Tết Nguyên đán',              date: '2026-02-21', type: 'public',  multiplier: 3.0 },
      { id: 'hol-007', name: 'Giỗ tổ Hùng Vương',           date: '2026-04-06', type: 'public',  multiplier: 2.0 },
      { id: 'hol-008', name: 'Ngày Giải phóng',             date: '2026-04-30', type: 'public',  multiplier: 2.0 },
      { id: 'hol-009', name: 'Quốc tế Lao động',            date: '2026-05-01', type: 'public',  multiplier: 2.0 },
      { id: 'hol-010', name: 'Quốc khánh',                  date: '2026-09-02', type: 'public',  multiplier: 2.0 },
      { id: 'hol-011', name: 'Quốc khánh',                  date: '2026-09-03', type: 'public',  multiplier: 2.0 },
      { id: 'hol-012', name: 'Kỷ niệm thành lập công ty',   date: '2026-06-15', type: 'company', multiplier: 1.0 },
    ];

    for (const h of holidays) {
      await connection.execute(
        `INSERT IGNORE INTO holidays (id, name, date, type, salary_multiplier) VALUES (?, ?, ?, ?, ?)`,
        [h.id, h.name, h.date, h.type, h.multiplier]
      );
    }
    console.log('✅ Holidays 2026 seeded');

    // ========== 8. COMPANY LOCATIONS ==========
    const locations = [
      { id: 'loc-001', name: 'Trụ sở chính',    address: '123 Nguyễn Huệ, Quận 1, TP.HCM', lat: 10.7769, lon: 106.7009, radius: 200 },
      { id: 'loc-002', name: 'Chi nhánh Hà Nội', address: '456 Hoàn Kiếm, Hà Nội',          lat: 21.0285, lon: 105.8542, radius: 200 },
    ];

    for (const l of locations) {
      await connection.execute(
        `INSERT IGNORE INTO company_locations (id, name, address, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?, ?)`,
        [l.id, l.name, l.address, l.lat, l.lon, l.radius]
      );
    }
    console.log('✅ Company locations seeded');

    // ========== 9. SALARY PRESETS ==========
    const salaryPresets = [
      { id: 'sp-001', name: 'Lương nhân viên',     desc: 'Mẫu lương cơ bản cho nhân viên',      salary: 15000000, type: 'standard', allowances: 2000000,  isDefault: true },
      { id: 'sp-002', name: 'Lương trưởng phòng',  desc: 'Mẫu lương quản lý cấp trưởng phòng',  salary: 25000000, type: 'standard', allowances: 5000000,  isDefault: false },
      { id: 'sp-003', name: 'Lương giám đốc',      desc: 'Mẫu lương ban giám đốc',              salary: 40000000, type: 'standard', allowances: 10000000, isDefault: false },
      { id: 'sp-004', name: 'Lương custom',         desc: 'Công thức tùy chỉnh theo giờ',        salary: 20000000, type: 'custom',
        formula: JSON.stringify({ salaryBasis: 'hourly', otMultiplier: 1.5, latePenaltyPerDay: 0, includeOT: true, includeAllowances: true, includeDeductions: true, includeLatePenalty: false }),
        allowances: 3000000, isDefault: false },
    ];

    for (const sp of salaryPresets) {
      await connection.execute(
        `INSERT IGNORE INTO salary_presets (id, name, description, base_salary, formula_type, custom_formula, allowances, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sp.id, sp.name, sp.desc, sp.salary, sp.type, sp.formula || null, sp.allowances, sp.isDefault ? 1 : 0]
      );
    }
    console.log('✅ Salary presets seeded');

    // ========== 10. SALARY ASSIGNMENTS ==========
    const salaryAssignments = [
      { empId: 'emp-001', presetId: 'sp-003' },
      { empId: 'emp-002', presetId: 'sp-002' },
      { empId: 'emp-003', presetId: 'sp-001' },
      { empId: 'emp-004', presetId: 'sp-002' },
      { empId: 'emp-005', presetId: 'sp-001' },
      { empId: 'emp-006', presetId: 'sp-001' },
      { empId: 'emp-007', presetId: 'sp-002' },
      { empId: 'emp-008', presetId: 'sp-001' },
      { empId: 'emp-009', presetId: 'sp-001' },
      { empId: 'emp-010', presetId: 'sp-002' },
      { empId: 'emp-011', presetId: 'sp-001' },
      { empId: 'emp-012', presetId: 'sp-001' },
    ];

    for (const sa of salaryAssignments) {
      await connection.execute(
        `INSERT INTO employee_salary_assignments (employee_id, preset_id)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE preset_id = VALUES(preset_id)`,
        [sa.empId, sa.presetId]
      );
    }
    console.log('✅ Salary assignments seeded');

    // ========== 11. PENALTY TEMPLATES ==========
    const penaltyTemplates = [
      { id: 'pt-001', name: 'Đi muộn lần 1',       type: 'attendance_deduction', reason: 'Đi muộn không phép',           desc: 'Trừ 5 điểm chuyên cần',  amount: 0,      points: 5 },
      { id: 'pt-002', name: 'Đi muộn > 30 phút',   type: 'attendance_deduction', reason: 'Đi muộn trên 30 phút',         desc: 'Trừ 10 điểm chuyên cần', amount: 0,      points: 10 },
      { id: 'pt-003', name: 'Nghỉ không phép',      type: 'attendance_deduction', reason: 'Nghỉ không phép',              desc: 'Trừ 20 điểm chuyên cần', amount: 0,      points: 20 },
      { id: 'pt-004', name: 'Vi phạm nội quy',      type: 'warning',             reason: 'Vi phạm nội quy công ty',      desc: 'Cảnh cáo vi phạm nội quy', amount: 0,    points: 0 },
      { id: 'pt-005', name: 'Làm hư hỏng tài sản',  type: 'deduction',           reason: 'Gây hư hỏng tài sản công ty',  desc: 'Bồi thường thiệt hại',   amount: 500000, points: 0 },
    ];

    for (const pt of penaltyTemplates) {
      await connection.execute(
        `INSERT IGNORE INTO penalty_templates (id, name, type, reason, description, amount, attendance_points)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [pt.id, pt.name, pt.type, pt.reason, pt.desc, pt.amount, pt.points]
      );
    }
    console.log('✅ Penalty templates seeded');

    // ========== 12. SALARY COEFFICIENTS ==========
    const coefficients = [
      { type: 'overtime',     multiplier: 1.5, desc: 'Hệ số OT thường' },
      { type: 'night_shift',  multiplier: 1.5, desc: 'Ca đêm' },
      { type: 'weekend',      multiplier: 2.0, desc: 'Cuối tuần' },
      { type: 'holiday',      multiplier: 2.0, desc: 'Ngày lễ' },
      { type: 'dedication',   multiplier: 1.0, desc: 'Chuyên cần' },
    ];

    for (const coeff of coefficients) {
      await connection.execute(
        `INSERT IGNORE INTO salary_coefficients (id, type, multiplier, description) VALUES (?, ?, ?, ?)`,
        [uuidv4(), coeff.type, coeff.multiplier, coeff.desc]
      );
    }
    console.log('✅ Salary coefficients seeded');

    // Release the single connection before bulk operations
    connection.release();

    // ========== 13. BULK EMPLOYEES (optional --bulk) ==========
    if (isBulk) {
      await seedBulkEmployees(bulkCount);
    }

    // ========== DONE ==========
    console.log('\n========================================');
    console.log('🎉 Seed completed successfully!');
    console.log('========================================');
    console.log('\nCore test accounts:');
    console.log('  Admin:    admin / admin123     (Giám đốc, role_level=1)');
    console.log('  Manager:  binh.tran / user123  (TP Nhân sự, role_level=3)');
    console.log('  Manager:  dung.pham / user123  (TP Kinh doanh, role_level=3)');
    console.log('  Manager:  khai.ly / user123    (TP Kỹ thuật, role_level=3)');
    console.log('  User:     cuong.le / user123   (Frontend Dev, role_level=5)');
    console.log('  User:     duc.hoang / user123  (Backend Dev, role_level=5)');
    if (isBulk) {
      console.log(`\n  Bulk:     ${bulkCount} employees with password: 123456`);
    }

    await pool.end();
  } catch (err) {
    try { connection.release(); } catch (_) {}
    console.error('Seed error:', err);
    await pool.end();
    throw err;
  }
}

// ===================== BULK SEED (from seed-100k.js) =====================
async function seedBulkEmployees(total) {
  console.log(`\n📦 Seeding ${total.toLocaleString()} bulk employees...`);

  const BATCH_SIZE = 500;

  // Extra departments for bulk diversity
  const BULK_DEPARTMENTS = [
    'Phòng Sản xuất', 'Phòng Hành chính', 'Phòng Pháp chế',
    'Phòng R&D', 'Phòng QA/QC', 'Phòng Logistics',
    'Phòng Mua hàng', 'Phòng Dịch vụ khách hàng',
  ];

  // Create extra departments
  const deptIds = {};
  // First, load existing departments
  const [existingDepts] = await pool.execute('SELECT id, name FROM departments');
  for (const d of existingDepts) {
    deptIds[d.name] = d.id;
  }
  // Add new ones
  for (const deptName of BULK_DEPARTMENTS) {
    if (!deptIds[deptName]) {
      const id = uuidv4();
      await pool.execute(
        `INSERT IGNORE INTO departments (id, name, description, parent_id) VALUES (?, ?, ?, 'dept-001')`,
        [id, deptName, `Phòng ban ${deptName}`]
      );
      deptIds[deptName] = id;
    }
  }
  const allDeptNames = Object.keys(deptIds);
  console.log(`  ${allDeptNames.length} departments available`);

  // Role distribution
  const ROLE_DISTRIBUTION = [
    { level: 1, count: Math.min(5, total),                                    role: 'admin', positions: ['Quản trị hệ thống'] },
    { level: 2, count: Math.min(20, Math.max(0, total - 5)),                  role: 'user',  positions: ['Tổng giám đốc', 'Giám đốc đơn vị', 'Phó tổng giám đốc'] },
    { level: 3, count: Math.min(200, Math.max(0, total - 25)),                role: 'user',  positions: ['Trưởng phòng', 'Phó phòng'] },
    { level: 4, count: Math.min(2000, Math.max(0, total - 225)),              role: 'user',  positions: ['Tổ trưởng', 'Phó tổ trưởng'] },
    { level: 5, count: Math.max(0, total - Math.min(2225, total)),            role: 'user',  positions: ['Nhân viên', 'Chuyên viên', 'Kỹ thuật viên', 'Thực tập sinh'] },
  ];

  const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Lưu', 'Trịnh', 'Đoàn'];
  const MIDDLE_NAMES = ['Văn', 'Thị', 'Đức', 'Minh', 'Hồng', 'Quốc', 'Thanh', 'Hữu', 'Ngọc', 'Xuân', 'Bảo', 'Anh', 'Phương', 'Thu', 'Tuấn', 'Hoài'];
  const FIRST_NAMES = ['An', 'Bình', 'Cường', 'Dũng', 'Hà', 'Hùng', 'Lan', 'Linh', 'Mai', 'Nam', 'Phong', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trung', 'Tuấn', 'Vy', 'Hạnh', 'Khánh', 'Long', 'Ngân', 'Oanh', 'Phúc', 'Quỳnh', 'Trang', 'Thắng', 'Hiếu', 'Đạt', 'Huy', 'Khoa', 'Minh', 'Nhật', 'Phát', 'Vinh'];

  function generateName() {
    return `${randomItem(LAST_NAMES)} ${randomItem(MIDDLE_NAMES)} ${randomItem(FIRST_NAMES)}`;
  }

  const passwordHash = await bcrypt.hash('123456', 10);
  let totalInserted = 0;

  // Start employee code from 100 to avoid conflict with core NV001-NV012
  let codeCounter = 100;

  for (const roleDef of ROLE_DISTRIBUTION) {
    if (roleDef.count <= 0) continue;
    const { level, count, role, positions } = roleDef;
    console.log(`  Level ${level} (${positions[0]}): ${count} records`);

    let batchEmpValues = [];
    let batchEmpParams = [];
    let batchUserValues = [];
    let batchUserParams = [];

    for (let i = 0; i < count; i++) {
      const empId = uuidv4();
      const userId = uuidv4();
      const name = generateName();
      codeCounter++;
      const code = `NV${String(codeCounter).padStart(6, '0')}`;
      const position = randomItem(positions);
      const deptName = level <= 2 ? 'Ban Giám đốc' : randomItem(allDeptNames);
      const deptId = deptIds[deptName] || null;
      const cleanName = removeVietnamese(name).toLowerCase().replace(/\s+/g, '');
      const username = `${cleanName}${codeCounter}`;
      const email = `${cleanName}${codeCounter}@company.vn`;
      const phone = `09${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;

      batchEmpValues.push('(?, ?, ?, ?, ?, ?, ?, ?)');
      batchEmpParams.push(empId, name, code, deptId, position, level, email, phone);

      batchUserValues.push('(?, ?, ?, ?, ?, ?, ?, ?)');
      batchUserParams.push(userId, empId, username, passwordHash, name, role, level, deptName);

      totalInserted++;

      if (batchEmpValues.length >= BATCH_SIZE || i === count - 1) {
        await pool.query(
          `INSERT INTO employees (id, name, employee_code, department_id, position, role_level, email, phone)
           VALUES ${batchEmpValues.join(',')}`,
          batchEmpParams
        );
        await pool.query(
          `INSERT INTO users (id, employee_id, username, password_hash, name, role, role_level, department)
           VALUES ${batchUserValues.join(',')}`,
          batchUserParams
        );

        process.stdout.write(`\r  Inserted ${totalInserted.toLocaleString()} / ${total.toLocaleString()}`);

        batchEmpValues = [];
        batchEmpParams = [];
        batchUserValues = [];
        batchUserParams = [];
      }
    }
  }

  console.log(`\n✅ Bulk employees seeded (${totalInserted.toLocaleString()})`);
  console.log('  Role distribution:');
  for (const r of ROLE_DISTRIBUTION) {
    if (r.count > 0) console.log(`    Level ${r.level}: ${r.count} (${r.positions[0]})`);
  }
}

// ===================== RUN =====================
seed().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
