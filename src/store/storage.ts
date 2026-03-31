import {
    attendanceApi,
    auditLogsApi,
    departmentsApi,
    employeesApi,
    exportTemplatesApi,
    holidaysApi,
    leaveApi,
    locationsApi,
    overtimeApi,
    penaltiesApi,
    penaltyTemplatesApi,
    salaryApi,
    shiftAssignmentsApi,
    shiftSwapsApi,
    shiftsApi,
    timeCorrectionsApi,
    timesheetsApi,
} from '../services/api';
import type {
    AttendanceRecord,
    AuditLog,
    CompanyLocation,
    Department,
    Employee,
    EmployeeSalaryAssignment,
    Holiday,
    LeaveRequest,
    MonthlyTimesheet,
    OTRequest,
    Penalty,
    PenaltyTemplate,
    SalaryPreset,
    SalaryRecord,
    Shift,
    ShiftAssignment,
    ShiftSwapRequest,
    TimeCorrection,
} from '../types';

// Helper: cast API response arrays
function cast<T>(data: Record<string, unknown>[]): T[] {
  return data as unknown as T[];
}
function castOne<T>(data: Record<string, unknown>): T {
  return data as unknown as T;
}

// ========== Audit Logs ==========
export async function getAuditLogs(params?: Record<string, string>): Promise<AuditLog[]> {
  const res = await auditLogsApi.list(params);
  return cast<AuditLog>(res.data);
}

export async function getAuditLogsPaginated(params?: Record<string, string>): Promise<{ data: AuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await auditLogsApi.list(params);
  return { data: cast<AuditLog>(res.data), pagination: res.pagination };
}

// ========== Employees ==========
export async function getEmployees(): Promise<Employee[]> {
  const res = await employeesApi.list({ limit: '100000' });
  return cast<Employee>(res.data);
}

export async function getEmployeesPaginated(params?: Record<string, string>): Promise<{ data: Employee[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await employeesApi.list(params);
  return { data: cast<Employee>(res.data), pagination: res.pagination };
}

export async function getEmployeeById(id: string): Promise<Employee> {
  return castOne<Employee>(await employeesApi.get(id));
}

export async function addEmployee(employee: Record<string, unknown>): Promise<Employee> {
  return castOne<Employee>(await employeesApi.create(employee));
}

export async function updateEmployee(id: string, data: Record<string, unknown>): Promise<Employee> {
  return castOne<Employee>(await employeesApi.update(id, data));
}

export async function deleteEmployee(id: string): Promise<void> {
  await employeesApi.delete(id);
}

// ========== Face Descriptors ==========
export async function saveFaceDescriptor(employeeId: string, descriptor: Float32Array, faceImage?: string): Promise<void> {
  await employeesApi.saveFace(employeeId, {
    faceDescriptor: Array.from(descriptor),
    faceImage: faceImage || '',
  });
}

export async function getFaceDescriptors(): Promise<Map<string, Float32Array>> {
  const data = await employeesApi.getFaceDescriptors();
  const map = new Map<string, Float32Array>();
  data.forEach((d) => {
    if (d.faceDescriptor && d.faceDescriptor.length > 0) {
      map.set(d.employeeId, new Float32Array(d.faceDescriptor));
    }
  });
  return map;
}

export async function deleteFaceDescriptor(employeeId: string): Promise<void> {
  await employeesApi.saveFace(employeeId, { faceDescriptor: [], faceImage: '' });
}

// ========== Shifts ==========
export async function getShifts(): Promise<Shift[]> {
  return cast<Shift>(await shiftsApi.list());
}

export async function addShift(shift: Record<string, unknown>): Promise<Shift> {
  return castOne<Shift>(await shiftsApi.create(shift));
}

export async function updateShift(id: string, data: Record<string, unknown>): Promise<Shift> {
  return castOne<Shift>(await shiftsApi.update(id, data));
}

export async function deleteShift(id: string): Promise<void> {
  await shiftsApi.delete(id);
}

// ========== Attendance ==========
export async function getAttendanceRecords(params?: Record<string, string>): Promise<AttendanceRecord[]> {
  const res = await attendanceApi.list(params);
  return cast<AttendanceRecord>(res.data);
}

export async function getAttendanceRecordsPaginated(params?: Record<string, string>): Promise<{ data: AttendanceRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await attendanceApi.list(params);
  return { data: cast<AttendanceRecord>(res.data), pagination: res.pagination };
}

export async function getTodayAttendancePaginated(page = 1, limit = 20): Promise<{ data: AttendanceRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await attendanceApi.today({ page: String(page), limit: String(limit) });
  return { data: cast<AttendanceRecord>(res.data), pagination: res.pagination };
}

export async function getTodayAttendance(): Promise<AttendanceRecord[]> {
  const res = await attendanceApi.today({ limit: '20' });
  return cast<AttendanceRecord>(res.data);
}

export async function getAttendanceByMonth(yearMonth: string): Promise<AttendanceRecord[]> {
  const res = await attendanceApi.list({ month: yearMonth, limit: '100000' });
  return cast<AttendanceRecord>(res.data);
}

export async function checkIn(data: { employeeId: string; shiftId?: string; latitude?: number; longitude?: number; checkInImage?: string }): Promise<AttendanceRecord> {
  return castOne<AttendanceRecord>(await attendanceApi.checkIn(data));
}

export async function checkOut(data: { employeeId: string; shiftId?: string; checkOutImage?: string }): Promise<AttendanceRecord> {
  return castOne<AttendanceRecord>(await attendanceApi.checkOut(data));
}

export async function getAttendanceStats(): Promise<Record<string, unknown>> {
  return attendanceApi.stats();
}

// ========== Late/Early calculation (pure client-side) ==========
export function calculateLateMinutes(checkInTime: string, shift: Shift): number {
  const ci = new Date(checkInTime);
  const [h, m] = shift.startTime.split(':').map(Number);
  const shiftStart = new Date(ci);
  shiftStart.setHours(h, m, 0, 0);
  const diff = Math.floor((ci.getTime() - shiftStart.getTime()) / 60000);
  return Math.max(0, diff);
}

export function calculateEarlyLeaveMinutes(checkOutTime: string, shift: Shift): number {
  const co = new Date(checkOutTime);
  const [h, m] = shift.endTime.split(':').map(Number);
  const shiftEnd = new Date(co);
  shiftEnd.setHours(h, m, 0, 0);
  const diff = Math.floor((shiftEnd.getTime() - co.getTime()) / 60000);
  return Math.max(0, diff);
}

export function calculateWorkingHours(checkInStr: string, checkOutStr: string, shift: Shift): number {
  const start = new Date(checkInStr);
  const end = new Date(checkOutStr);
  let totalMs = end.getTime() - start.getTime();
  if (shift.breakStartTime && shift.breakEndTime) {
    const [bsH, bsM] = shift.breakStartTime.split(':').map(Number);
    const [beH, beM] = shift.breakEndTime.split(':').map(Number);
    const breakMs = ((beH * 60 + beM) - (bsH * 60 + bsM)) * 60000;
    totalMs = Math.max(0, totalMs - breakMs);
  }
  return Math.round((totalMs / 3600000) * 100) / 100;
}

// ========== Shift Assignments ==========
export async function getShiftAssignments(params?: { employeeId?: string }): Promise<ShiftAssignment[]> {
  return cast<ShiftAssignment>(await shiftAssignmentsApi.list(params));
}

export async function addShiftAssignment(assignment: Record<string, unknown>): Promise<ShiftAssignment> {
  return castOne<ShiftAssignment>(await shiftAssignmentsApi.create(assignment));
}

export async function deleteShiftAssignment(id: string): Promise<void> {
  await shiftAssignmentsApi.delete(id);
}

export async function getEmployeeShift(employeeId: string, dayOfWeek: number): Promise<Shift | undefined> {
  const assignments = await shiftAssignmentsApi.getByEmployee(employeeId);
  const found = (assignments as unknown as ShiftAssignment[]).find((a) => a.dayOfWeek === dayOfWeek);
  if (!found) return undefined;
  const shifts = await getShifts();
  return shifts.find((s) => s.id === found.shiftId);
}

// ========== OT Requests ==========
export async function getOTRequests(params?: Record<string, string>): Promise<OTRequest[]> {
  const res = await overtimeApi.list(params);
  return cast<OTRequest>(res.data);
}

export async function getOTRequestsPaginated(params?: Record<string, string>): Promise<{ data: OTRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await overtimeApi.list(params);
  return { data: cast<OTRequest>(res.data), pagination: res.pagination };
}

export async function addOTRequest(req: Record<string, unknown>): Promise<OTRequest> {
  return castOne<OTRequest>(await overtimeApi.create(req));
}

export async function updateOTRequest(id: string, data: { status: string }): Promise<OTRequest> {
  return castOne<OTRequest>(await overtimeApi.update(id, data));
}

// ========== Time Corrections ==========
export async function getTimeCorrections(params?: { status?: string }): Promise<TimeCorrection[]> {
  return cast<TimeCorrection>(await timeCorrectionsApi.list(params));
}

export async function addTimeCorrection(c: Record<string, unknown>): Promise<TimeCorrection> {
  return castOne<TimeCorrection>(await timeCorrectionsApi.create(c));
}

export async function updateTimeCorrection(id: string, data: { status: string }): Promise<TimeCorrection> {
  return castOne<TimeCorrection>(await timeCorrectionsApi.update(id, data));
}

// ========== Penalties ==========
export async function getPenalties(params?: Record<string, string>): Promise<Penalty[]> {
  const res = await penaltiesApi.list(params);
  return cast<Penalty>(res.data);
}

export async function getPenaltiesPaginated(params?: Record<string, string>): Promise<{ data: Penalty[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await penaltiesApi.list(params);
  return { data: cast<Penalty>(res.data), pagination: res.pagination };
}

export async function addPenalty(p: Record<string, unknown>): Promise<Penalty> {
  return castOne<Penalty>(await penaltiesApi.create(p));
}

export async function updatePenalty(id: string, data: Record<string, unknown>): Promise<Penalty> {
  return castOne<Penalty>(await penaltiesApi.update(id, data));
}

export async function deletePenalty(id: string): Promise<void> {
  await penaltiesApi.delete(id);
}

export async function resolveAllPenalties(filters?: { status?: string; type?: string }): Promise<{ updated: number }> {
  return penaltiesApi.resolveAll(filters);
}

export async function cleanupPenalties(days: number): Promise<{ deleted: number; days: number }> {
  return penaltiesApi.cleanup(days);
}

// ========== Shift Swaps ==========
export async function getShiftSwaps(): Promise<ShiftSwapRequest[]> {
  return cast<ShiftSwapRequest>(await shiftSwapsApi.list());
}

export async function addShiftSwap(s: Record<string, unknown>): Promise<ShiftSwapRequest> {
  return castOne<ShiftSwapRequest>(await shiftSwapsApi.create(s));
}

export async function updateShiftSwap(id: string, data: { status: string }): Promise<ShiftSwapRequest> {
  return castOne<ShiftSwapRequest>(await shiftSwapsApi.update(id, data));
}

// ========== Holidays ==========
export async function getHolidays(): Promise<Holiday[]> {
  return cast<Holiday>(await holidaysApi.list());
}

export async function addHoliday(h: Record<string, unknown>): Promise<Holiday> {
  return castOne<Holiday>(await holidaysApi.create(h));
}

export async function deleteHoliday(id: string): Promise<void> {
  await holidaysApi.delete(id);
}

// ========== Leave Requests ==========
export async function getLeaveRequests(params?: Record<string, string>): Promise<LeaveRequest[]> {
  const res = await leaveApi.list(params);
  return cast<LeaveRequest>(res.data);
}

export async function getLeaveRequestsPaginated(params?: Record<string, string>): Promise<{ data: LeaveRequest[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await leaveApi.list(params);
  return { data: cast<LeaveRequest>(res.data), pagination: res.pagination };
}

export async function addLeaveRequest(l: Record<string, unknown>): Promise<LeaveRequest> {
  return castOne<LeaveRequest>(await leaveApi.create(l));
}

export async function updateLeaveRequest(id: string, data: { status: string }): Promise<LeaveRequest> {
  return castOne<LeaveRequest>(await leaveApi.update(id, data));
}

export async function checkAutoRejectLeave(): Promise<{ message: string; updatedCount: number }> {
  return await leaveApi.checkAutoReject() as unknown as { message: string; updatedCount: number };
}

// ========== Daily Timesheet ==========
export async function getDailyTimesheetPaginated(params?: Record<string, string>): Promise<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number }; date: string }> {
  const res = await timesheetsApi.daily(params);
  return { data: res.data, pagination: res.pagination, date: res.date };
}

// ========== Monthly Timesheets ==========
export async function getMonthlyTimesheets(params?: Record<string, string>): Promise<MonthlyTimesheet[]> {
  const res = await timesheetsApi.list(params);
  return cast<MonthlyTimesheet>(res.data);
}

export async function getMonthlyTimesheetsPaginated(params?: Record<string, string>): Promise<{ data: MonthlyTimesheet[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await timesheetsApi.list(params);
  return { data: cast<MonthlyTimesheet>(res.data), pagination: res.pagination };
}

export async function generateMonthlyTimesheet(yearMonth: string): Promise<{ message: string; count: number }> {
  return await timesheetsApi.generate(yearMonth) as unknown as { message: string; count: number };
}

export async function lockTimesheet(yearMonth: string): Promise<void> {
  await timesheetsApi.lock(yearMonth);
}

export async function unlockTimesheet(yearMonth: string): Promise<void> {
  await timesheetsApi.unlock(yearMonth);
}

// ========== Company Locations (GPS) ==========
export async function getCompanyLocations(): Promise<CompanyLocation[]> {
  return cast<CompanyLocation>(await locationsApi.list());
}

export async function addCompanyLocation(loc: Record<string, unknown>): Promise<CompanyLocation> {
  return castOne<CompanyLocation>(await locationsApi.create(loc));
}

export async function deleteCompanyLocation(id: string): Promise<void> {
  await locationsApi.delete(id);
}

export function calculateGPSDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function isWithinCompanyRange(lat: number, lon: number): Promise<{ location: CompanyLocation; distance: number } | null> {
  try {
    const result = await locationsApi.checkRange({ latitude: lat, longitude: lon });
    if (result.inRange && result.location) {
      return {
        location: result.location as unknown as CompanyLocation,
        distance: result.distance || 0,
      };
    }
    return null;
  } catch {
    const locations = await getCompanyLocations();
    for (const loc of locations) {
      const distance = calculateGPSDistance(lat, lon, loc.latitude, loc.longitude);
      if (distance <= loc.radius) {
        return { location: loc, distance: Math.round(distance) };
      }
    }
    return null;
  }
}

// ========== Departments ==========
export async function getDepartments(): Promise<Department[]> {
  return cast<Department>(await departmentsApi.list());
}

export async function addDepartment(d: Record<string, unknown>): Promise<Department> {
  return castOne<Department>(await departmentsApi.create(d));
}

export async function updateDepartment(id: string, data: Record<string, unknown>): Promise<Department> {
  return castOne<Department>(await departmentsApi.update(id, data));
}

export async function deleteDepartment(id: string): Promise<void> {
  await departmentsApi.delete(id);
}

export async function getDepartmentMembers(id: string, params?: Record<string, string>): Promise<{ data: Employee[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const res = await departmentsApi.getMembers(id, params);
  return { data: cast<Employee>(res.data), pagination: res.pagination };
}

export async function addDepartmentMember(deptId: string, data: { employeeId: string; roleLevel?: number }): Promise<Employee> {
  return castOne<Employee>(await departmentsApi.addMember(deptId, data));
}

export async function updateDepartmentMemberRole(deptId: string, data: { employeeId: string; roleLevel: number }): Promise<Employee> {
  return castOne<Employee>(await departmentsApi.updateMemberRole(deptId, data));
}

export async function removeDepartmentMember(deptId: string, data: { employeeId: string }): Promise<void> {
  await departmentsApi.removeMember(deptId, data);
}

// ========== Penalty Templates ==========
export async function getPenaltyTemplates(): Promise<PenaltyTemplate[]> {
  return cast<PenaltyTemplate>(await penaltyTemplatesApi.list());
}

export async function addPenaltyTemplate(t: Record<string, unknown>): Promise<PenaltyTemplate> {
  return castOne<PenaltyTemplate>(await penaltyTemplatesApi.create(t));
}

export async function updatePenaltyTemplate(id: string, data: Record<string, unknown>): Promise<PenaltyTemplate> {
  return castOne<PenaltyTemplate>(await penaltyTemplatesApi.update(id, data));
}

export async function deletePenaltyTemplate(id: string): Promise<void> {
  await penaltyTemplatesApi.delete(id);
}

// ========== Salary Presets ==========
export async function getSalaryPresets(): Promise<SalaryPreset[]> {
  return cast<SalaryPreset>(await salaryApi.presets());
}

export async function addSalaryPreset(p: Record<string, unknown>): Promise<SalaryPreset> {
  return castOne<SalaryPreset>(await salaryApi.createPreset(p));
}

export async function updateSalaryPreset(id: string, data: Record<string, unknown>): Promise<SalaryPreset> {
  return castOne<SalaryPreset>(await salaryApi.updatePreset(id, data));
}

export async function deleteSalaryPreset(id: string): Promise<void> {
  await salaryApi.deletePreset(id);
}

// ========== Salary Assignments ==========
export async function getSalaryAssignments(): Promise<EmployeeSalaryAssignment[]> {
  return cast<EmployeeSalaryAssignment>(await salaryApi.assignments());
}

export async function assignSalaryPreset(employeeId: string, presetId: string): Promise<void> {
  await salaryApi.assign({ employeeId, presetId });
}

// ========== Salary Records ==========
export async function getSalaryRecords(params?: Record<string, string>): Promise<SalaryRecord[]> {
  const res = await salaryApi.records(params);
  return cast<SalaryRecord>(res.data);
}

export async function getSalaryRecordsPaginated(params?: Record<string, string>): Promise<{ data: SalaryRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number }; summary?: { totalNet: number; totalGross: number }; departments?: string[] }> {
  const res = await salaryApi.records(params);
  return { data: cast<SalaryRecord>(res.data), pagination: res.pagination, summary: res.summary, departments: res.departments };
}

export async function calculateSalary(yearMonth: string): Promise<SalaryRecord[]> {
  return cast<SalaryRecord>(await salaryApi.calculate(yearMonth));
}

// ========== Salary Lock/Unlock ==========
export async function lockSalaryMonth(yearMonth: string): Promise<void> {
  await salaryApi.lockMonth(yearMonth);
}

export async function unlockSalaryMonth(yearMonth: string): Promise<void> {
  await salaryApi.unlockMonth(yearMonth);
}

// ========== Salary Coefficients ==========
export interface SalaryCoefficient {
  id: string;
  type: string;
  multiplier: number;
  description: string;
  isActive: boolean;
}

export async function getSalaryCoefficients(): Promise<SalaryCoefficient[]> {
  return cast<SalaryCoefficient>(await salaryApi.getCoefficients());
}

export async function updateSalaryCoefficient(id: string, data: Record<string, unknown>): Promise<SalaryCoefficient> {
  return castOne<SalaryCoefficient>(await salaryApi.updateCoefficient(id, data));
}

export async function deleteSalaryCoefficient(type: string): Promise<void> {
  await salaryApi.deleteCoefficient(type);
}

// ========== Salary Permissions ==========
export interface SalaryPermission {
  userId: string;
  roleName: string;
  name?: string;
  username?: string;
  grantedAt?: string;
  [key: string]: unknown;
}

export async function getSalaryPermissions(): Promise<SalaryPermission[]> {
  return cast<SalaryPermission>(await salaryApi.getPermissions());
}

export async function setSalaryPermission(data: Record<string, unknown>): Promise<void> {
  await salaryApi.setPermission(data);
}

export async function revokeSalaryPermission(userId: string): Promise<void> {
  await salaryApi.revokePermission(userId);
}

export async function searchUsersForRole(q: string) {
  return await salaryApi.searchUsers(q);
}

export async function getAttendanceScores(params: { month: string; page?: number; limit?: number; search?: string; dept?: string; rank?: string; sortBy?: string; sortDir?: string }) {
  return await salaryApi.getAttendanceScores(params);
}

export async function adjustSalaryOt(id: string, data: Record<string, unknown>) {
  return await salaryApi.adjustOt(id, data);
}

// ========== Export Templates ==========
export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  columnConfig: { columns: { field: string; header: string; width: number; format: string }[] };
  isDefault: boolean;
  createdBy: string;
}

export interface ExportField {
  field: string;
  label: string;
  format: string;
}

export async function getExportTemplates(): Promise<ExportTemplate[]> {
  return cast<ExportTemplate>(await exportTemplatesApi.list());
}

export async function getExportFields(): Promise<ExportField[]> {
  return await exportTemplatesApi.fields();
}

export async function createExportTemplate(data: Record<string, unknown>): Promise<ExportTemplate> {
  return castOne<ExportTemplate>(await exportTemplatesApi.create(data));
}

export async function updateExportTemplate(id: string, data: Record<string, unknown>): Promise<ExportTemplate> {
  return castOne<ExportTemplate>(await exportTemplatesApi.update(id, data));
}

export async function deleteExportTemplate(id: string): Promise<void> {
  await exportTemplatesApi.delete(id);
}

export async function setDefaultTemplate(id: string): Promise<void> {
  await exportTemplatesApi.setDefault(id);
}
