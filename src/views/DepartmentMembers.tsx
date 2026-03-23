"use client";

import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  Search,
  Shield,
  UserCircle,
  UserMinus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getDepartmentMembers,
  getDepartments,
  removeDepartmentMember,
  updateDepartmentMemberRole,
} from "../store/storage";
import type { Department, Employee } from "../types";
import { ROLE_LEVEL_LABELS } from "../types";
import { showToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";

interface Props {
  departmentId: string;
}

export default function DepartmentMembers({ departmentId }: Props) {
  const [department, setDepartment] = useState<Department | null>(null);
  const [members, setMembers] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<Employee | null>(null);

  useEffect(() => {
    loadDepartment();
  }, [departmentId]);

  useEffect(() => {
    loadMembers();
  }, [departmentId, pagination.page, search]);

  async function loadDepartment() {
    const depts = await getDepartments();
    const found = depts.find((d) => d.id === departmentId);
    setDepartment(found || null);
  }

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await getDepartmentMembers(departmentId, {
        page: String(pagination.page),
        limit: String(pagination.limit),
        search: search || "",
      });
      setMembers(res.data);
      setPagination((p) => ({ ...p, ...res.pagination }));
    } catch (err) {
      console.error("Load members error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(employeeId: string, roleLevel: number) {
    try {
      await updateDepartmentMemberRole(departmentId, { employeeId, roleLevel });
      await loadMembers();
    } catch (err) {
      showToast('error', 'Lỗi', (err as Error).message);
    }
  }

  async function handleRemove(emp: Employee) {
    try {
      await removeDepartmentMember(departmentId, { employeeId: emp.id });
      await loadMembers();
      await loadDepartment();
      setConfirmRemove(null);
    } catch (err) {
      showToast('error', 'Lỗi', (err as Error).message);
    }
  }

  const roleBadgeColor: Record<number, string> = {
    1: "bg-red-100 text-red-700",
    2: "bg-purple-100 text-purple-700",
    3: "bg-indigo-100 text-indigo-700",
    4: "bg-blue-100 text-blue-700",
    5: "bg-gray-100 text-gray-600",
  };

  return (
    <>
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <Link
          href="/departments"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Quay lại Quản lý phòng ban
        </Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {department?.name || "Phòng ban"}
              </h1>
              <p className="text-sm text-gray-500">
                {pagination.total} nhân viên
                {department?.managerName && (
                  <>
                    {" "}
                    · Trưởng phòng:{" "}
                    <span className="font-medium text-indigo-600">
                      {department.managerName}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            placeholder="Tìm theo tên hoặc mã nhân viên..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="w-8 h-8 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Đang tải...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Chưa có nhân viên trong phòng ban này</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Nhân viên
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Mã NV
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Chức vụ
                    </th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Vai trò
                      </div>
                    </th>
                    <th className="px-5 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {m.avatar ? (
                              <img
                                src={m.avatar}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <UserCircle className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {m.name}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {m.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-gray-600 font-mono bg-gray-50 px-2 py-0.5 rounded">
                          {m.employeeCode}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-gray-600">
                          {m.position || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={m.roleLevel}
                          onChange={(e) =>
                            handleRoleChange(m.id, Number(e.target.value))
                          }
                          className={`text-[11px] font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            roleBadgeColor[m.roleLevel] || "bg-gray-100"
                          }`}
                        >
                          {Object.entries(ROLE_LEVEL_LABELS).map(
                            ([level, label]) => (
                              <option key={level} value={level}>
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setConfirmRemove(m)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Gỡ khỏi phòng ban"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Hiển thị {(pagination.page - 1) * pagination.limit + 1} -{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )}{" "}
                  / {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setPagination((p) => ({ ...p, page: p.page - 1 }))
                    }
                    disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: pagination.totalPages }, (_, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setPagination((p) => ({ ...p, page: i + 1 }))
                      }
                      className={`w-8 h-8 rounded-lg text-xs font-medium ${
                        pagination.page === i + 1
                          ? "bg-indigo-500 text-white"
                          : "hover:bg-gray-100 text-gray-600"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() =>
                      setPagination((p) => ({ ...p, page: p.page + 1 }))
                    }
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    <ConfirmDialog
      open={!!confirmRemove}
      title="Gỡ nhân viên"
      message={`Gỡ "${confirmRemove?.name}" khỏi phòng ban "${department?.name}"?`}
      confirmLabel="Gỡ"
      onConfirm={() => confirmRemove && handleRemove(confirmRemove)}
      onCancel={() => setConfirmRemove(null)}
    />
    </>
  );
}
