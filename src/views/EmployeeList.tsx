import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import {
  deleteEmployee,
  deleteFaceDescriptor,
  getEmployeesPaginated,
  getFaceDescriptors,
} from "../store/storage";
import type { Employee } from "../types";
import { ROLE_LEVEL_LABELS } from "../types";
import { useAuth } from "../contexts/AuthContext";

const PAGE_SIZE = 30;

export default function EmployeeList() {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [faceRegistered, setFaceRegistered] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterRoleLevel, setFilterRoleLevel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [confirmDeleteEmployee, setConfirmDeleteEmployee] = useState<Employee | null>(null);

  // Sort
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Departments for filter dropdown
  const [departments, setDepartments] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy,
        sortDir,
      };
      if (search) params.search = search;
      if (filterDept) params.department = filterDept;
      if (filterRoleLevel) params.roleLevel = filterRoleLevel;
      if (filterStatus) params.isActive = filterStatus;
      if (filterPosition) params.position = filterPosition;

      const res = await getEmployeesPaginated(params);
      setEmployees(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterDept, filterRoleLevel, filterStatus, filterPosition, sortBy, sortDir]);

  // Load face descriptors once
  useEffect(() => {
    getFaceDescriptors().then((descriptors) =>
      setFaceRegistered(new Set(descriptors.keys())),
    );
    // Load departments list
    import("../services/api").then(({ departmentsApi }) => {
      departmentsApi.list().then((depts: Record<string, unknown>[]) => {
        setDepartments(depts.map((d) => d.name as string).filter(Boolean));
      });
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reset to page 1 when filters change
  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortIcon(field: string) {
    if (sortBy !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  async function handleDelete(employee: Employee) {
    await deleteEmployee(employee.id);
    await deleteFaceDescriptor(employee.id);
    setConfirmDeleteEmployee(null);
    loadData();
  }

  return (
    <>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Quản lý nhân viên
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString()} nhân viên trong hệ thống
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/employees/new"
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            + Thêm nhân viên
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              placeholder="🔍 Tìm theo tên hoặc mã NV..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={filterDept}
            onChange={(e) => handleFilterChange(setFilterDept, e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={filterRoleLevel}
            onChange={(e) => handleFilterChange(setFilterRoleLevel, e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tất cả cấp bậc</option>
            {Object.entries(ROLE_LEVEL_LABELS).map(([level, label]) => (
              <option key={level} value={level}>{label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => handleFilterChange(setFilterStatus, e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="true">Hoạt động</option>
            <option value="false">Nghỉ việc</option>
          </select>
          <input
            type="text"
            placeholder="Lọc chức vụ..."
            value={filterPosition}
            onChange={(e) => handleFilterChange(setFilterPosition, e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[140px]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} label="nhân viên" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Nhân viên
                </th>
                <th
                  className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("employee_code")}
                >
                  Mã NV {sortIcon("employee_code")}
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Phòng ban
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Chức vụ
                </th>
                <th
                  className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("role_level")}
                >
                  Cấp bậc {sortIcon("role_level")}
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Face ID
                </th>
                <th
                  className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700"
                  onClick={() => toggleSort("is_active")}
                >
                  Trạng thái {sortIcon("is_active")}
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    Đang tải...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    {total === 0 && !search && !filterDept && !filterRoleLevel && !filterStatus ? (
                      <div>
                        <p className="mb-2">Chưa có nhân viên nào</p>
                        <Link
                          href="/employees/new"
                          className="text-primary-600 hover:underline text-sm"
                        >
                          Thêm nhân viên đầu tiên →
                        </Link>
                      </div>
                    ) : (
                      "Không tìm thấy nhân viên phù hợp"
                    )}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          {emp.faceImage ? (
                            <img
                              src={emp.faceImage}
                              alt={emp.name}
                              className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-semibold text-primary-700">
                              {emp.name.charAt(0)}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {emp.name}
                          </p>
                          <p className="text-xs text-gray-400">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 font-mono">
                      {emp.employeeCode}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {emp.department}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {emp.position}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.roleLevel === 1 ? 'bg-red-100 text-red-700' :
                        emp.roleLevel === 2 ? 'bg-purple-100 text-purple-700' :
                        emp.roleLevel === 3 ? 'bg-blue-100 text-blue-700' :
                        emp.roleLevel === 4 ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {ROLE_LEVEL_LABELS[emp.roleLevel] || 'Nhân viên'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {faceRegistered.has(emp.id) ? (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          Đã đăng ký
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                          Chưa có
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {emp.isActive ? (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                          Hoạt động
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                          Nghỉ việc
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/employees/${emp.id}/edit`}
                          className="px-2 py-1 rounded-lg hover:bg-gray-100 text-xs text-primary-600 font-medium transition-colors"
                        >
                          Sửa
                        </Link>
                        <button
                          onClick={() => setConfirmDeleteEmployee(emp)}
                          className="px-2 py-1 rounded-lg hover:bg-red-50 text-xs text-red-600 font-medium transition-colors"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} label="nhân viên" />
      </div>
    </div>

    <ConfirmDialog
      open={!!confirmDeleteEmployee}
      title="Xóa nhân viên"
      message={`Bạn có chắc muốn xóa nhân viên "${confirmDeleteEmployee?.name}"?`}
      confirmLabel="Xóa"
      onConfirm={() => confirmDeleteEmployee && handleDelete(confirmDeleteEmployee)}
      onCancel={() => setConfirmDeleteEmployee(null)}
    />
    </>
  );
}
