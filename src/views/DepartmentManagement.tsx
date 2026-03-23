import {
  Building2,
  ChevronDown,
  ChevronRight,
  Edit2,
  ExternalLink,
  Plus,
  Trash2,
  UserCircle,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { showToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import EmployeeSearchDropdown from "../components/EmployeeSearchDropdown";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDepartment,
  addDepartmentMember,
  deleteDepartment,
  getDepartments,
  getEmployeesPaginated,
  updateDepartment,
} from "../store/storage";
import type { Department, Employee } from "../types";
import { ROLE_LEVEL_LABELS } from "../types";

interface TreeNode extends Department {
  children: TreeNode[];
}

function buildTree(departments: Department[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  departments.forEach((d) => map.set(d.id, { ...d, children: [] }));

  departments.forEach((d) => {
    const node = map.get(d.id)!;
    if (d.parentId && map.has(d.parentId)) {
      map.get(d.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: "",
    description: "",
    managerId: "",
    parentId: "",
  });
  const [empSearch, setEmpSearch] = useState("");
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<string | null>(null);

  // Add-member popup state
  const [showAddMember, setShowAddMember] = useState<string | null>(null); // dept id
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addMemberResults, setAddMemberResults] = useState<Employee[]>([]);
  const [addMemberRole, setAddMemberRole] = useState(5);
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  async function reload() {
    setDepartments(await getDepartments());
    const res = await getEmployeesPaginated({
      limit: "200",
      isActive: "true",
    });
    setEmployees(res.data);
  }

  useEffect(() => {
    if (!empSearch) return;
    const timer = setTimeout(async () => {
      const res = await getEmployeesPaginated({
        limit: "100",
        isActive: "true",
        search: empSearch,
      });
      setEmployees(res.data);
    }, 400);
    return () => clearTimeout(timer);
  }, [empSearch]);

  // Search for add-member popup
  useEffect(() => {
    if (!showAddMember) return;
    const timer = setTimeout(async () => {
      const res = await getEmployeesPaginated({
        limit: "20",
        isActive: "true",
        search: addMemberSearch || "",
      });
      // Filter out employees already in this department
      setAddMemberResults(
        res.data.filter((e) => {
          const dept = departments.find((d) => d.id === showAddMember);
          return e.department !== dept?.name;
        })
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [addMemberSearch, showAddMember, departments]);

  const tree = useMemo(() => buildTree(departments), [departments]);

  function toggleExpand(id: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAdd(parentId?: string) {
    setForm({ name: "", description: "", managerId: "", parentId: parentId || "" });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(d: Department) {
    setForm({
      name: d.name,
      description: d.description || "",
      managerId: d.managerId || "",
      parentId: d.parentId || "",
    });
    setEditingId(d.id);
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      managerId: form.managerId || undefined,
      parentId: form.parentId || null,
    };
    if (editingId) {
      await updateDepartment(editingId, payload);
    } else {
      await addDepartment(payload);
    }
    setShowForm(false);
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id: string) {
    const dept = departments.find((d) => d.id === id);
    const memberCount = employees.filter(
      (e) => e.department === dept?.name
    ).length;
    const childCount = departments.filter((d) => d.parentId === id).length;

    if (childCount > 0) {
      showToast(
        'warning',
        'Không thể xóa',
        `Phòng ban "${dept?.name}" còn ${childCount} phòng ban con. Hãy xóa hoặc chuyển trước.`
      );
      return;
    }
    if (memberCount > 0) {
      showToast(
        'warning',
        'Không thể xóa',
        `Phòng ban "${dept?.name}" còn ${memberCount} nhân viên. Hãy chuyển nhân viên trước khi xóa.`
      );
      return;
    }
    await deleteDepartment(id);
    setConfirmDeleteDept(null);
    await reload();
  }

  function getDeptMembers(deptName: string): Employee[] {
    return employees.filter((e) => e.department === deptName);
  }

  async function handleAddMember(employeeId: string) {
    if (!showAddMember) return;
    setAddMemberLoading(true);
    try {
      await addDepartmentMember(showAddMember, {
        employeeId,
        roleLevel: addMemberRole,
      });
      await reload();
      // Refresh add-member results
      setAddMemberSearch((s) => s + " ");
      setTimeout(() => setAddMemberSearch(""), 100);
    } catch (err) {
      showToast('error', 'Lỗi', (err as Error).message);
    } finally {
      setAddMemberLoading(false);
    }
  }

  function renderTree(nodes: TreeNode[], depth = 0) {
    return nodes.map((node) => {
      const isExpanded = expandedDepts.has(node.id);
      const hasChildren = node.children.length > 0;

      return (
        <div key={node.id} style={{ marginLeft: depth * 24 }}>
          <div
            className={`bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden mb-3 ${
              depth > 0 ? "border-l-4 border-l-indigo-300" : ""
            }`}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  {/* Expand/collapse toggle */}
                  <button
                    onClick={() => toggleExpand(node.id)}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      {node.name}
                    </h3>
                    {node.description && (
                      <p className="text-[11px] text-gray-400 line-clamp-1">
                        {node.description}
                      </p>
                    )}
                    {depth > 0 && node.parentId && (
                      <p className="text-[10px] text-indigo-400 mt-0.5">
                        Thuộc: {departments.find((d) => d.id === node.parentId)?.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openAdd(node.id)}
                    className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                    title="Thêm phòng ban con"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setShowAddMember(node.id);
                      setAddMemberSearch("");
                      setAddMemberRole(5);
                    }}
                    className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Thêm nhân viên"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEdit(node)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Sửa"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteDept(node.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Manager */}
              {node.managerName && (
                <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-indigo-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-indigo-700">
                      {node.managerName.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-indigo-800 truncate">
                      {node.managerName}
                    </p>
                    <p className="text-[10px] text-indigo-500">Trưởng phòng</p>
                  </div>
                </div>
              )}

              {/* Stats & View link */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-medium text-gray-700">
                    {node.memberCount ?? 0}
                  </span>
                  <span>nhân viên</span>
                  {hasChildren && (
                    <>
                      <span className="text-gray-300">|</span>
                      <Building2 className="w-3 h-3" />
                      <span className="font-medium text-gray-700">
                        {node.children.length}
                      </span>
                      <span>phòng ban con</span>
                    </>
                  )}
                </div>
                <Link
                  href={`/departments/${node.id}/members`}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                >
                  <span>Xem nhân viên</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Children */}
          {isExpanded && hasChildren && (
            <div className="ml-2 pl-4 border-l-2 border-indigo-100">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Quản lý phòng ban
            </h1>
            <p className="text-sm text-gray-500">
              {departments.length} phòng ban · {departments.reduce((sum, d) => sum + (d.memberCount ?? 0), 0)} nhân viên
            </p>
          </div>
        </div>
        <button
          onClick={() => openAdd()}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Thêm phòng ban
        </button>
      </div>

      {/* Department Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-indigo-50 to-white border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">
                {editingId ? "Sửa phòng ban" : "Thêm phòng ban mới"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Tên phòng ban *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: Phòng Kỹ thuật"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Phòng ban cha
                  </label>
                  <select
                    value={form.parentId}
                    onChange={(e) =>
                      setForm({ ...form, parentId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Không (cấp cao nhất)</option>
                    {departments
                      .filter((d) => d.id !== editingId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Trưởng phòng
                </label>
                <EmployeeSearchDropdown
                  employees={employees}
                  value={form.managerId}
                  onChange={(id) => setForm({ ...form, managerId: id })}
                  onSearch={(q) => setEmpSearch(q)}
                  placeholder="Tìm trưởng phòng (tên, mã NV)..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Mô tả
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={2}
                  placeholder="Mô tả chức năng phòng ban..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSubmit}
                  className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-indigo-600 hover:to-indigo-700 transition-all"
                >
                  {editingId ? "Cập nhật" : "Thêm"}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Popup */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-blue-50 to-white border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">
                Thêm nhân viên vào{" "}
                <span className="text-indigo-600">
                  {departments.find((d) => d.id === showAddMember)?.name}
                </span>
              </h3>
              <button
                onClick={() => setShowAddMember(null)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Tìm nhân viên
                  </label>
                  <input
                    type="text"
                    value={addMemberSearch}
                    onChange={(e) => setAddMemberSearch(e.target.value)}
                    placeholder="Tên hoặc mã NV..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                    Vai trò trong phòng ban
                  </label>
                  <select
                    value={addMemberRole}
                    onChange={(e) => setAddMemberRole(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(ROLE_LEVEL_LABELS).map(([level, label]) => (
                      <option key={level} value={level}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Results list */}
              <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto">
                {addMemberResults.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-gray-400">
                    Không tìm thấy nhân viên phù hợp
                  </p>
                ) : (
                  addMemberResults.map((emp) => (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          {emp.avatar ? (
                            <img
                              src={emp.avatar}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <UserCircle className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-900">
                            {emp.name}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {emp.employeeCode} · {emp.position || "N/A"}
                            {emp.department
                              ? ` · ${emp.department}`
                              : " · Chưa có PB"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddMember(emp.id)}
                        disabled={addMemberLoading}
                        className="px-3 py-1.5 bg-blue-500 text-white text-[11px] font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                      >
                        Thêm
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Tree */}
      <div>{renderTree(tree)}</div>

      {departments.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Chưa có phòng ban nào</p>
          <button
            onClick={() => openAdd()}
            className="mt-2 text-sm text-indigo-600 hover:underline"
          >
            Thêm phòng ban đầu tiên →
          </button>
        </div>
      )}
    </div>

    <ConfirmDialog
      open={!!confirmDeleteDept}
      title="Xóa phòng ban"
      message={`Bạn có chắc muốn xóa phòng ban "${departments.find(d => d.id === confirmDeleteDept)?.name}"?`}
      confirmLabel="Xóa"
      onConfirm={() => confirmDeleteDept && handleDelete(confirmDeleteDept)}
      onCancel={() => setConfirmDeleteDept(null)}
    />
    </>
  );
}
