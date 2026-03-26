/**
 * API Test Script - Hệ thống Chấm công
 * Chạy: node src/test.js
 * Yêu cầu: server đang chạy trên port 5000, database đã seed
 */

const http = require('http');

const BASE = 'http://localhost:5000/api';
let adminToken = '';
let userToken = '';
let passed = 0;
let failed = 0;
const errors = [];

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
    errors.push(name);
  }
}

async function testAuth() {
  console.log('\n=== AUTH ===');

  // Login admin
  let res = await request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert('Admin login — status 200', res.status === 200);
  assert('Admin login — has token', !!res.data?.token);
  assert('Admin login — role=admin', res.data?.user?.role === 'admin');
  adminToken = res.data?.token;

  // Login user
  res = await request('POST', '/auth/login', { username: 'binh.tran', password: 'user123' });
  assert('User login — status 200', res.status === 200);
  assert('User login — role=user', res.data?.user?.role === 'user');
  userToken = res.data?.token;

  // Wrong password
  res = await request('POST', '/auth/login', { username: 'admin', password: 'wrong' });
  assert('Wrong password — status 401', res.status === 401);

  // Missing credentials
  res = await request('POST', '/auth/login', { username: '', password: '' });
  assert('Missing creds — status 400', res.status === 400);

  // GET /auth/me
  res = await request('GET', '/auth/me', null, adminToken);
  assert('GET /auth/me — status 200', res.status === 200);
  assert('GET /auth/me — has name', !!res.data?.name);
  assert('GET /auth/me — no passwordHash', !res.data?.passwordHash);

  // No token
  res = await request('GET', '/auth/me', null);
  assert('No token — status 401', res.status === 401);
}

async function testEmployees() {
  console.log('\n=== EMPLOYEES ===');

  // List
  let res = await request('GET', '/employees', null, adminToken);
  const employeeData = res.data?.data || res.data;
  assert('GET /employees — status 200', res.status === 200);
  assert('GET /employees — is array', Array.isArray(employeeData));
  assert('GET /employees — has camelCase (employeeCode)', employeeData.length > 0 && 'employeeCode' in employeeData[0]);
  assert('GET /employees — has department join', employeeData.length > 0 && 'department' in employeeData[0]);

  // Get single
  res = await request('GET', '/employees/emp-001', null, adminToken);
  assert('GET /employees/:id — status 200', res.status === 200);
  assert('GET /employees/:id — correct id', res.data?.id === 'emp-001');

  // Create
  res = await request('POST', '/employees', {
    name: 'Test Employee',
    employeeCode: 'NV_TEST',
    departmentId: 'dept-001',
    position: 'Tester',
    email: 'test@company.vn',
    phone: '0999999999',
  }, adminToken);
  assert('POST /employees — status 201', res.status === 201);
  assert('POST /employees — has id', !!res.data?.id);
  const testEmpId = res.data?.id;

  // Update
  res = await request('PUT', `/employees/${testEmpId}`, { position: 'Senior Tester' }, adminToken);
  assert('PUT /employees/:id — status 200', res.status === 200);
  assert('PUT /employees/:id — updated', res.data?.position === 'Senior Tester');

  // User cannot create employee
  res = await request('POST', '/employees', { name: 'X', employeeCode: 'NV_X' }, userToken);
  assert('User cannot create employee — status 403', res.status === 403);

  // Soft delete
  res = await request('DELETE', `/employees/${testEmpId}`, null, adminToken);
  assert('DELETE /employees/:id — status 200', res.status === 200);

  // Face descriptors
  res = await request('GET', '/employees/face-descriptors', null, adminToken);
  assert('GET /employees/face-descriptors — status 200', res.status === 200);
  assert('GET /employees/face-descriptors — is array', Array.isArray(res.data));
}

async function testDepartments() {
  console.log('\n=== DEPARTMENTS ===');

  let res = await request('GET', '/departments', null, adminToken);
  assert('GET /departments — status 200', res.status === 200);
  assert('GET /departments — is array', Array.isArray(res.data));
  assert('GET /departments — has camelCase (managerId)', res.data.length > 0 && 'managerId' in res.data[0]);

  // Create
  res = await request('POST', '/departments', { name: 'Test Dept', description: 'test' }, adminToken);
  assert('POST /departments — status 201', res.status === 201);
  const deptId = res.data?.id;

  // Update
  res = await request('PUT', `/departments/${deptId}`, { name: 'Test Dept Updated' }, adminToken);
  assert('PUT /departments/:id — status 200', res.status === 200);

  // Delete
  res = await request('DELETE', `/departments/${deptId}`, null, adminToken);
  assert('DELETE /departments/:id — status 200', res.status === 200);

  // User cannot create
  res = await request('POST', '/departments', { name: 'Fail' }, userToken);
  assert('User cannot create dept — status 403', res.status === 403);
}

async function testShifts() {
  console.log('\n=== SHIFTS ===');

  let res = await request('GET', '/shifts', null, adminToken);
  assert('GET /shifts — status 200', res.status === 200);
  assert('GET /shifts — has camelCase (startTime)', res.data.length > 0 && 'startTime' in res.data[0]);

  // Create
  res = await request('POST', '/shifts', {
    name: 'Ca test',
    startTime: '09:00',
    endTime: '18:00',
    color: '#FF0000',
  }, adminToken);
  assert('POST /shifts — status 201', res.status === 201);
  const shiftId = res.data?.id;

  // Update
  res = await request('PUT', `/shifts/${shiftId}`, { name: 'Ca test updated' }, adminToken);
  assert('PUT /shifts/:id — status 200', res.status === 200);

  // Delete
  res = await request('DELETE', `/shifts/${shiftId}`, null, adminToken);
  assert('DELETE /shifts/:id — status 200', res.status === 200);
}

async function testShiftAssignments() {
  console.log('\n=== SHIFT ASSIGNMENTS ===');

  let res = await request('GET', '/shift-assignments', null, adminToken);
  assert('GET /shift-assignments — status 200', res.status === 200);
  assert('GET /shift-assignments — is array', Array.isArray(res.data));

  // Get by employee
  res = await request('GET', '/shift-assignments/employee/emp-001', null, adminToken);
  assert('GET /shift-assignments/employee/:id — status 200', res.status === 200);
  assert('GET /shift-assignments/employee/:id — has data', res.data.length > 0);
}

async function testAttendance() {
  console.log('\n=== ATTENDANCE ===');

  // Check-in
  let res = await request('POST', '/attendance/check-in', {
    employeeId: 'emp-003',
    checkInImage: 'data:image/png;base64,test',
  }, adminToken);
  assert('POST /attendance/check-in — status 201', res.status === 201, `got ${res.status}: ${JSON.stringify(res.data)}`);
  assert('POST /attendance/check-in — has id', !!res.data?.id);
  assert('POST /attendance/check-in — has status', !!res.data?.status);

  // Duplicate check-in
  res = await request('POST', '/attendance/check-in', { employeeId: 'emp-003' }, adminToken);
  assert('Duplicate check-in — status 400', res.status === 400);

  // Check-out
  res = await request('POST', '/attendance/check-out', {
    employeeId: 'emp-003',
    checkOutImage: 'data:image/png;base64,testout',
  }, adminToken);
  assert('POST /attendance/check-out — status 200', res.status === 200, `got ${res.status}: ${JSON.stringify(res.data)}`);
  assert('POST /attendance/check-out — has workingHours', res.data?.workingHours !== undefined);

  // Get today
  res = await request('GET', '/attendance/today', null, adminToken);
  const todayData = res.data?.data || res.data;
  assert('GET /attendance/today — status 200', res.status === 200);
  assert('GET /attendance/today — is array', Array.isArray(todayData));

  // Get all
  res = await request('GET', '/attendance', null, adminToken);
  assert('GET /attendance — status 200', res.status === 200);

  // Stats
  res = await request('GET', '/attendance/stats', null, adminToken);
  assert('GET /attendance/stats — status 200', res.status === 200);
  assert('GET /attendance/stats — has today', !!res.data?.today);
  assert('GET /attendance/stats — has pendingRequests', !!res.data?.pendingRequests);
}

async function testOvertime() {
  console.log('\n=== OVERTIME ===');

  let res = await request('POST', '/overtime', {
    employeeId: 'emp-003',
    employeeName: 'Lê Hoàng Cường',
    date: new Date().toISOString().split('T')[0],
    startTime: '17:00',
    endTime: '19:00',
    hours: 2,
    multiplier: 1.5,
    reason: 'Deadline dự án',
  }, adminToken);
  assert('POST /overtime — status 201', res.status === 201);
  const otId = res.data?.id;

  // List
  res = await request('GET', '/overtime', null, adminToken);
  const otData = res.data?.data || res.data;
  assert('GET /overtime — status 200', res.status === 200);
  assert('GET /overtime — is array', Array.isArray(otData));

  // Approve
  res = await request('PUT', `/overtime/${otId}`, { status: 'approved' }, adminToken);
  assert('PUT /overtime/:id approve — status 200', res.status === 200);
  assert('PUT /overtime/:id — approved', res.data?.status === 'approved');
}

async function testLeave() {
  console.log('\n=== LEAVE ===');

  let res = await request('POST', '/leave', {
    employeeId: 'emp-003',
    employeeName: 'Lê Hoàng Cường',
    startDate: '2026-03-15',
    endDate: '2026-03-16',
    type: 'annual',
    reason: 'Việc gia đình',
  }, adminToken);
  assert('POST /leave — status 201', res.status === 201);
  const leaveId = res.data?.id;

  res = await request('GET', '/leave', null, adminToken);
  assert('GET /leave — status 200', res.status === 200);

  // Approve
  res = await request('PUT', `/leave/${leaveId}`, { status: 'approved' }, adminToken);
  assert('PUT /leave/:id approve — status 200', res.status === 200);
  assert('PUT /leave/:id — approved', res.data?.status === 'approved');
}

async function testPenalties() {
  console.log('\n=== PENALTIES ===');

  let res = await request('POST', '/penalties', {
    employeeId: 'emp-003',
    employeeName: 'Lê Hoàng Cường',
    date: new Date().toISOString().split('T')[0],
    type: 'warning',
    reason: 'Đi muộn test',
    amount: 0,
  }, adminToken);
  assert('POST /penalties — status 201', res.status === 201);
  const penId = res.data?.id;

  res = await request('GET', '/penalties', null, adminToken);
  assert('GET /penalties — status 200', res.status === 200);

  // Appeal (user)
  res = await request('PUT', `/penalties/${penId}`, { status: 'appealed', appealReason: 'Tắc đường' }, adminToken);
  assert('PUT /penalties/:id appeal — status 200', res.status === 200);

  // Delete
  res = await request('DELETE', `/penalties/${penId}`, null, adminToken);
  assert('DELETE /penalties/:id — status 200', res.status === 200);
}

async function testPenaltyTemplates() {
  console.log('\n=== PENALTY TEMPLATES ===');

  let res = await request('GET', '/penalty-templates', null, adminToken);
  assert('GET /penalty-templates — status 200', res.status === 200);
  assert('GET /penalty-templates — is array', Array.isArray(res.data));
}

async function testSalary() {
  console.log('\n=== SALARY ===');

  // Presets
  let res = await request('GET', '/salary/presets', null, adminToken);
  assert('GET /salary/presets — status 200', res.status === 200);
  assert('GET /salary/presets — has camelCase (baseSalary)', res.data.length > 0 && 'baseSalary' in res.data[0]);

  // Assignments
  res = await request('GET', '/salary/assignments', null, adminToken);
  assert('GET /salary/assignments — status 200', res.status === 200);

  // Records
  res = await request('GET', '/salary/records?month=2026-03', null, adminToken);
  assert('GET /salary/records — status 200', res.status === 200);
}

async function testLocations() {
  console.log('\n=== LOCATIONS ===');

  let res = await request('GET', '/locations', null, adminToken);
  assert('GET /locations — status 200', res.status === 200);
  assert('GET /locations — is array', Array.isArray(res.data));

  // Check range — within range (HCM office)
  res = await request('POST', '/locations/check-range', {
    latitude: 10.7769,
    longitude: 106.7009,
  }, adminToken);
  assert('POST /locations/check-range — status 200', res.status === 200);
  assert('POST /locations/check-range — inRange=true', res.data?.inRange === true);

  // Check range — out of range
  res = await request('POST', '/locations/check-range', {
    latitude: 0,
    longitude: 0,
  }, adminToken);
  assert('POST /locations/check-range — out of range', res.data?.inRange === false);
}

async function testTimesheets() {
  console.log('\n=== TIMESHEETS ===');

  // Generate
  let res = await request('POST', '/timesheets/generate', { month: '2026-03' }, adminToken);
  const tsData = res.data?.data || res.data;
  assert('POST /timesheets/generate — status 200', res.status === 200);
  assert('POST /timesheets/generate — is array', Array.isArray(tsData));
  assert('POST /timesheets/generate — has data', tsData.length > 0);

  // Get
  res = await request('GET', '/timesheets?month=2026-03', null, adminToken);
  assert('GET /timesheets — status 200', res.status === 200);

  // Lock
  res = await request('POST', '/timesheets/lock', { month: '2026-03' }, adminToken);
  assert('POST /timesheets/lock — status 200', res.status === 200);
}

async function testHolidays() {
  console.log('\n=== HOLIDAYS ===');

  let res = await request('GET', '/holidays', null, adminToken);
  assert('GET /holidays — status 200', res.status === 200);
  assert('GET /holidays — is array', Array.isArray(res.data));

  res = await request('POST', '/holidays', {
    name: 'Test Holiday',
    date: '2026-12-25',
    type: 'company',
  }, adminToken);
  assert('POST /holidays — status 201', res.status === 201);
  const holId = res.data?.id;

  res = await request('DELETE', `/holidays/${holId}`, null, adminToken);
  assert('DELETE /holidays/:id — status 200', res.status === 200);
}

async function testTimeCorrections() {
  console.log('\n=== TIME CORRECTIONS ===');

  let res = await request('GET', '/time-corrections', null, adminToken);
  assert('GET /time-corrections — status 200', res.status === 200);
}

async function testShiftSwaps() {
  console.log('\n=== SHIFT SWAPS ===');

  let res = await request('GET', '/shift-swaps', null, adminToken);
  assert('GET /shift-swaps — status 200', res.status === 200);

  res = await request('POST', '/shift-swaps', {
    requesterId: 'emp-003',
    requesterName: 'Lê Hoàng Cường',
    targetId: 'emp-005',
    targetName: 'Hoàng Minh Đức',
    date: '2026-03-12',
    requesterShiftId: 'shift-003',
    targetShiftId: 'shift-003',
    reason: 'Test swap',
  }, adminToken);
  assert('POST /shift-swaps — status 201', res.status === 201);
}

async function testAuditLogs() {
  console.log('\n=== AUDIT LOGS ===');

  let res = await request('GET', '/audit-logs', null, adminToken);
  const auditData = res.data?.data || res.data;
  assert('GET /audit-logs — status 200', res.status === 200);
  assert('GET /audit-logs — is array', Array.isArray(auditData));
  assert('GET /audit-logs — has entries', auditData.length > 0);
  assert('GET /audit-logs — has camelCase (performedBy)', 'performedBy' in (auditData[0] || {}));

  // User cannot access audit logs
  res = await request('GET', '/audit-logs', null, userToken);
  assert('User cannot access audit logs — 403', res.status === 403);
}

async function testUserScoping() {
  console.log('\n=== USER SCOPING ===');

  // User can only see own attendance
  let res = await request('GET', '/attendance', null, userToken);
  assert('User GET /attendance — status 200', res.status === 200);

  // User can only see own overtime
  res = await request('GET', '/overtime', null, userToken);
  assert('User GET /overtime — status 200', res.status === 200);

  // User can only see own leave
  res = await request('GET', '/leave', null, userToken);
  assert('User GET /leave — status 200', res.status === 200);

  // User can only see own salary
  res = await request('GET', '/salary/records?month=2026-03', null, userToken);
  assert('User GET /salary/records — status 200', res.status === 200);

  // User cannot access admin-only
  res = await request('GET', '/audit-logs', null, userToken);
  assert('User cannot access audit-logs — 403', res.status === 403);

  res = await request('GET', '/salary/assignments', null, userToken);
  assert('User cannot access salary assignments — 403', res.status === 403);
}

async function testHealthCheck() {
  console.log('\n=== HEALTH CHECK ===');
  const res = await request('GET', '/health', null);
  assert('GET /health — status 200', res.status === 200);
  assert('GET /health — ok', res.data?.status === 'ok');
}

async function run() {
  console.log('Bat dau kiem tra API Cham cong...\n');
  console.log('========================================');

  try {
    await testHealthCheck();
    await testAuth();
    await testEmployees();
    await testDepartments();
    await testShifts();
    await testShiftAssignments();
    await testAttendance();
    await testOvertime();
    await testLeave();
    await testPenalties();
    await testPenaltyTemplates();
    await testSalary();
    await testLocations();
    await testTimesheets();
    await testHolidays();
    await testTimeCorrections();
    await testShiftSwaps();
    await testAuditLogs();
    await testUserScoping();
  } catch (err) {
    console.error('\nTest runner error:', err.message);
  }

  console.log('\n========================================');
  console.log(`\nKET QUA: ${passed} passed, ${failed} failed / ${passed + failed} total`);
  if (errors.length > 0) {
    console.log('\nFailed tests:');
    errors.forEach(e => console.log(`   - ${e}`));
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run();
