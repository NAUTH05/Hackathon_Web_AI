const MOCK_INIT_KEY = 'fa_mock_initialized';

export function seedMockData(): void {
  // No-op: all data is managed via the backend API
}

export function resetMockData(): void {
  const keys = [
    'fa_employees', 'fa_shifts', 'fa_attendance', 'fa_shift_assignments',
    'fa_face_descriptors', 'fa_ot_requests', 'fa_audit_logs', 'fa_time_corrections',
    'fa_penalties', 'fa_shift_swaps', 'fa_holidays', 'fa_leave_requests',
    'fa_monthly_timesheets', 'fa_users', 'fa_current_user', 'fa_company_locations',
    'fa_departments', 'fa_penalty_templates', 'fa_salary_presets',
    'fa_salary_assignments', 'fa_salary_records',
    MOCK_INIT_KEY,
  ];
  keys.forEach((k) => localStorage.removeItem(k));
}
