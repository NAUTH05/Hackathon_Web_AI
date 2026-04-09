const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || `${APP_BASE_PATH}/api`).replace(/\/$/, '');

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('auth_token');
}

async function request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const requestUrl = buildApiUrl(path);
  const url = requestUrl.startsWith('http')
    ? new URL(requestUrl)
    : new URL(requestUrl, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    });
  }

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    localStorage.removeItem('fa_current_user');
    window.location.href = `${APP_BASE_PATH}/login`;
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============ Auth ============
export const authApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: Record<string, unknown> }>('POST', '/auth/login', { username, password }),
  register: (data: { username: string; password: string; name: string; department?: string }) =>
    request<{ token: string; user: Record<string, unknown> }>('POST', '/auth/register', data),
  me: () => request<Record<string, unknown>>('GET', '/auth/me'),
  profile: () => request<Record<string, unknown>>('GET', '/auth/profile'),
  updateProfile: (data: { avatar?: string; email?: string; phone?: string }) =>
    request<Record<string, unknown>>('PUT', '/auth/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request<{ message: string }>('PUT', '/auth/change-password', data),
  getUserRoles: (employeeId: string) =>
    request<{ userId: string | null; username: string | null; name: string | null; roles: string[] }>('GET', `/auth/users/${encodeURIComponent(employeeId)}/roles`),
  setUserRoles: (employeeId: string, roles: string[]) =>
    request<{ message: string; roles: string[] }>('PUT', `/auth/users/${encodeURIComponent(employeeId)}/roles`, { roles }),
};

// ============ Employees ============
export const employeesApi = {
  list: (params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/employees', undefined, params),
  get: (id: string) => request<Record<string, unknown>>('GET', `/employees/${encodeURIComponent(id)}`),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/employees', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/employees/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/employees/${encodeURIComponent(id)}`),
  saveFace: (id: string, data: { faceDescriptor: number[]; faceImage: string }) =>
    request<void>('POST', `/employees/${encodeURIComponent(id)}/face`, data),
  getFaceDescriptors: () => request<{ employeeId: string; faceDescriptor: number[] }[]>('GET', '/employees/face-descriptors'),
};

// ============ Departments ============
export const departmentsApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/departments'),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/departments', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/departments/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/departments/${encodeURIComponent(id)}`),
  getMembers: (id: string, params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', `/departments/${encodeURIComponent(id)}/members`, undefined, params),
  addMember: (id: string, data: { employeeId: string; roleLevel?: number }) =>
    request<Record<string, unknown>>('POST', `/departments/${encodeURIComponent(id)}/add-member`, data),
  updateMemberRole: (id: string, data: { employeeId: string; roleLevel: number }) =>
    request<Record<string, unknown>>('PUT', `/departments/${encodeURIComponent(id)}/member-role`, data),
  removeMember: (id: string, data: { employeeId: string }) =>
    request<Record<string, unknown>>('DELETE', `/departments/${encodeURIComponent(id)}/remove-member`, data),
};

// ============ Shifts ============
export const shiftsApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/shifts'),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/shifts', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/shifts/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/shifts/${encodeURIComponent(id)}`),
};

// ============ Shift Assignments ============
export const shiftAssignmentsApi = {
  list: (params?: { employeeId?: string }) =>
    request<Record<string, unknown>[]>('GET', '/shift-assignments', undefined, params),
  getByEmployee: (employeeId: string) =>
    request<Record<string, unknown>[]>('GET', `/shift-assignments/employee/${encodeURIComponent(employeeId)}`),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/shift-assignments', data),
  delete: (id: string) => request<void>('DELETE', `/shift-assignments/${encodeURIComponent(id)}`),
};

// ============ Attendance ============
export const attendanceApi = {
  list: (params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/attendance', undefined, params),
  today: (params?: Record<string, string>) => request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/attendance/today', undefined, params),
  stats: () => request<Record<string, unknown>>('GET', '/attendance/stats'),
  checkIn: (data: { employeeId: string; shiftId?: string; latitude?: number; longitude?: number; checkInImage?: string }) =>
    request<Record<string, unknown>>('POST', '/attendance/check-in', data),
  checkOut: (data: { employeeId: string; checkOutImage?: string }) =>
    request<Record<string, unknown>>('POST', '/attendance/check-out', data),
  createManual: (data: Record<string, unknown>) =>
    request<Record<string, unknown>>('POST', '/attendance/manual', data),
  update: (id: string, data: Record<string, unknown>) =>
    request<Record<string, unknown>>('PUT', `/attendance/${encodeURIComponent(id)}`, data),
  delete: (id: string) =>
    request<void>('DELETE', `/attendance/${encodeURIComponent(id)}`),
};

// ============ Overtime ============
export const overtimeApi = {
  list: (params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/overtime', undefined, params),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/overtime', data),
  update: (id: string, data: { status: string }) => request<Record<string, unknown>>('PUT', `/overtime/${encodeURIComponent(id)}`, data),
};

// ============ Leave ============
export const leaveApi = {
  list: (params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/leave', undefined, params),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/leave', data),
  update: (id: string, data: { status: string }) => request<Record<string, unknown>>('PUT', `/leave/${encodeURIComponent(id)}`, data),
  checkAutoReject: () => request<{ message: string; updatedCount: number }>('POST', '/leave/check-auto-reject'),
};

// ============ Penalties ============
export const penaltiesApi = {
  list: (params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/penalties', undefined, params),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/penalties', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/penalties/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/penalties/${encodeURIComponent(id)}`),
  resolveAll: (filters?: { status?: string; type?: string }) =>
    request<{ updated: number }>('PUT', '/penalties/resolve-all', filters || {}),
  cleanup: (days: number) =>
    request<{ deleted: number; days: number }>('DELETE', `/penalties/cleanup`, undefined, { days: String(days) }),
};

// ============ Penalty Templates ============
export const penaltyTemplatesApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/penalty-templates'),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/penalty-templates', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/penalty-templates/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/penalty-templates/${encodeURIComponent(id)}`),
};

// ============ Locations ============
export const locationsApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/locations'),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/locations', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/locations/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/locations/${encodeURIComponent(id)}`),
  checkRange: (data: { latitude: number; longitude: number }) =>
    request<{ inRange: boolean; location?: Record<string, unknown>; distance?: number }>('POST', '/locations/check-range', data),
};

// ============ Salary ============
export const salaryApi = {
  presets: () => request<Record<string, unknown>[]>('GET', '/salary/presets'),
  createPreset: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/salary/presets', data),
  updatePreset: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/salary/presets/${encodeURIComponent(id)}`, data),
  deletePreset: (id: string) => request<void>('DELETE', `/salary/presets/${encodeURIComponent(id)}`),
  assignments: () => request<Record<string, unknown>[]>('GET', '/salary/assignments'),
  assign: (data: { employeeId: string; presetId: string }) => request<Record<string, unknown>>('POST', '/salary/assignments', data),
  records: (params?: Record<string, string>) => request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number }; summary?: { totalNet: number; totalGross: number; totalOtHours?: number }; departments?: string[] }>('GET', '/salary/records', undefined, params),
  calculate: (month: string) => request<Record<string, unknown>[]>('POST', '/salary/calculate', { month }),
  lockMonth: (month: string) => request<void>('POST', '/salary/lock-month', { month }),
  unlockMonth: (month: string) => request<void>('POST', '/salary/unlock-month', { month }),
  getCoefficients: () => request<Record<string, unknown>[]>('GET', '/salary/coefficients'),
  updateCoefficient: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/salary/coefficients/${encodeURIComponent(id)}`, data),
  deleteCoefficient: (type: string) => request<void>('DELETE', `/salary/coefficients/${encodeURIComponent(type)}`),
  getPermissions: () => request<Record<string, unknown>[]>('GET', '/salary/permissions'),
  setPermission: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/salary/permissions', data),
  revokePermission: (userId: string) => request<void>('DELETE', `/salary/permissions/${encodeURIComponent(userId)}`),
  searchUsers: (q: string) => request<{ id: string; name: string; username: string; role: string; department: string }[]>('GET', '/salary/search-users', undefined, { q }),
  getAttendanceScores: (params: { month: string; page?: number; limit?: number; search?: string; dept?: string; rank?: string; sortBy?: string; sortDir?: string }) => {
    const q: Record<string, string> = { month: params.month };
    if (params.page !== undefined) q.page = String(params.page);
    if (params.limit !== undefined) q.limit = String(params.limit);
    if (params.search) q.search = params.search;
    if (params.dept) q.dept = params.dept;
    if (params.rank) q.rank = params.rank;
    if (params.sortBy) q.sortBy = params.sortBy;
    if (params.sortDir) q.sortDir = params.sortDir;
    return request<{ month: string; data: Record<string, unknown>[]; total: number; page: number; totalPages: number; departments?: string[] }>('GET', '/salary/attendance-scores', undefined, q);
  },
  adjustOt: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/salary/records/${encodeURIComponent(id)}/adjust-ot`, data),
  // Deduction items
  getDeductionItems: () => request<Record<string, unknown>[]>('GET', '/salary/deduction-items'),
  createDeductionItem: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/salary/deduction-items', data),
  updateDeductionItem: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/salary/deduction-items/${encodeURIComponent(id)}`, data),
  deleteDeductionItem: (id: string) => request<void>('DELETE', `/salary/deduction-items/${encodeURIComponent(id)}`),
};

// ============ Holidays ============
export const holidaysApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/holidays'),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/holidays', data),
  delete: (id: string) => request<void>('DELETE', `/holidays/${encodeURIComponent(id)}`),
};

// ============ Timesheets ============
export const timesheetsApi = {
  list: (params?: Record<string, string>) => request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/timesheets', undefined, params),
  daily: (params?: Record<string, string>) => request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number }; date: string; isLocked: boolean; lockedBy: string | null; stats: { present: number; late: number; noRecord: number; noCheckout: number; totalHours: number } }>('GET', '/timesheets/daily', undefined, params),
  generate: (month: string) => request<{ message: string; count: number }>('POST', '/timesheets/generate', { month }),
  lock: (month: string) => request<void>('POST', '/timesheets/lock', { month }),
  unlock: (month: string) => request<void>('POST', '/timesheets/unlock', { month }),
  lockDay: (date: string) => request<void>('POST', '/timesheets/lock-day', { date }),
  unlockDay: (date: string) => request<void>('POST', '/timesheets/unlock-day', { date }),
};

// ============ Audit Logs ============
export const auditLogsApi = {
  list: (params?: Record<string, string>) =>
    request<{ data: Record<string, unknown>[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>('GET', '/audit-logs', undefined, params),
};

// ============ Time Corrections ============
export const timeCorrectionsApi = {
  list: (params?: { status?: string }) =>
    request<Record<string, unknown>[]>('GET', '/time-corrections', undefined, params),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/time-corrections', data),
  update: (id: string, data: { status: string }) => request<Record<string, unknown>>('PUT', `/time-corrections/${encodeURIComponent(id)}`, data),
};

// ============ Shift Swaps ============
export const shiftSwapsApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/shift-swaps'),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/shift-swaps', data),
  update: (id: string, data: { status: string }) => request<Record<string, unknown>>('PUT', `/shift-swaps/${encodeURIComponent(id)}`, data),
};

// ============ Export Templates ============
export const exportTemplatesApi = {
  list: () => request<Record<string, unknown>[]>('GET', '/export-templates'),
  get: (id: string) => request<Record<string, unknown>>('GET', `/export-templates/${encodeURIComponent(id)}`),
  create: (data: Record<string, unknown>) => request<Record<string, unknown>>('POST', '/export-templates', data),
  update: (id: string, data: Record<string, unknown>) => request<Record<string, unknown>>('PUT', `/export-templates/${encodeURIComponent(id)}`, data),
  delete: (id: string) => request<void>('DELETE', `/export-templates/${encodeURIComponent(id)}`),
  setDefault: (id: string) => request<Record<string, unknown>>('PUT', `/export-templates/${encodeURIComponent(id)}/set-default`),
  fields: () => request<{ field: string; label: string; format: string }[]>('GET', '/export-payroll/fields'),
};
