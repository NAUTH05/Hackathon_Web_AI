import { X } from "lucide-react";
import { useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import {
  addShift,
  addShiftAssignment,
  deleteShift,
  deleteShiftAssignment,
  getEmployeesPaginated,
  getShiftAssignments,
  getShifts,
  updateShift,
} from "../store/storage";
import type { Employee, Shift, ShiftAssignment } from "../types";

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];
const DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DAY_LABELS = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
];

export default function ShiftManagement() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"shifts" | "schedule">("shifts");
  const [empPage, setEmpPage] = useState(1);
  const [empTotalPages, setEmpTotalPages] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);
  const [empSearch, setEmpSearch] = useState("");
  const [confirmDeleteShift, setConfirmDeleteShift] = useState<Shift | null>(null);

  const [shiftForm, setShiftForm] = useState({
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    color: COLORS[0],
    allowLateMinutes: 15,
    allowEarlyLeaveMinutes: 10,
    breakStartTime: "",
    breakEndTime: "",
    isOvernight: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const delay = empSearch ? 400 : 0;
    const timer = setTimeout(() => {
      loadEmployees(1, empSearch);
    }, delay);
    return () => clearTimeout(timer);
  }, [empSearch]);

  async function loadData() {
    setShifts(await getShifts());
    setAssignments(await getShiftAssignments());
    loadEmployees(1, "");
  }

  async function loadEmployees(page: number, search: string) {
    const params: Record<string, string> = { page: String(page), limit: '30', isActive: 'true' };
    if (search.trim()) params.search = search.trim();
    const res = await getEmployeesPaginated(params);
    setEmployees(res.data);
    setEmpPage(res.pagination.page);
    setEmpTotalPages(res.pagination.totalPages);
    setEmpTotal(res.pagination.total);
  }

  function openCreateForm() {
    setShiftForm({
      name: "",
      startTime: "08:00",
      endTime: "17:00",
      color: COLORS[shifts.length % COLORS.length],
      allowLateMinutes: 15,
      allowEarlyLeaveMinutes: 10,
      breakStartTime: "",
      breakEndTime: "",
      isOvernight: false,
    });
    setIsCreating(true);
    setEditingShift(null);
  }

  function openEditForm(shift: Shift) {
    setShiftForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      color: shift.color,
      allowLateMinutes: shift.allowLateMinutes,
      allowEarlyLeaveMinutes: shift.allowEarlyLeaveMinutes,
      breakStartTime: shift.breakStartTime || "",
      breakEndTime: shift.breakEndTime || "",
      isOvernight: shift.isOvernight,
    });
    setEditingShift(shift);
    setIsCreating(false);
  }

  async function handleSaveShift() {
    if (!shiftForm.name.trim()) return;
    const data = {
      ...shiftForm,
      breakStartTime: shiftForm.breakStartTime || undefined,
      breakEndTime: shiftForm.breakEndTime || undefined,
    };
    if (editingShift) {
      await updateShift(editingShift.id, data);
    } else {
      await addShift(data);
    }
    setEditingShift(null);
    setIsCreating(false);
    await loadData();
  }

  async function handleDeleteShift(shift: Shift) {
    await deleteShift(shift.id);
    setConfirmDeleteShift(null);
    await loadData();
  }

  async function toggleAssignment(
    employeeId: string,
    dayOfWeek: number,
    shiftId: string,
  ) {
    const existing = assignments.find(
      (a) => a.employeeId === employeeId && a.dayOfWeek === dayOfWeek,
    );
    if (existing) await deleteShiftAssignment(existing.id);
    if (!existing || existing.shiftId !== shiftId) {
      await addShiftAssignment({
        employeeId,
        shiftId,
        dayOfWeek,
        effectiveFrom: new Date().toISOString().split("T")[0],
      });
    }
    setAssignments(await getShiftAssignments());
  }

  function getAssignment(
    employeeId: string,
    dayOfWeek: number,
  ): ShiftAssignment | undefined {
    return assignments.find(
      (a) => a.employeeId === employeeId && a.dayOfWeek === dayOfWeek,
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Quản lý ca làm việc
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Thiết lập ca và phân công lịch làm việc
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("shifts")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "shifts"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Danh sách ca
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "schedule"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Phân ca
        </button>
      </div>

      {activeTab === "shifts" && (
        <div className="space-y-4">
          {(isCreating || editingShift) && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-primary-50 to-white border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800">
                    {editingShift ? "Sửa ca làm việc" : "Tạo ca mới"}
                  </h3>
                  <button
                    onClick={() => { setEditingShift(null); setIsCreating(false); }}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Tên ca
                  </label>
                  <input
                    type="text"
                    value={shiftForm.name}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, name: e.target.value })
                    }
                    placeholder="Ca Sáng"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Giờ bắt đầu
                  </label>
                  <input
                    type="time"
                    value={shiftForm.startTime}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, startTime: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Giờ kết thúc
                  </label>
                  <input
                    type="time"
                    value={shiftForm.endTime}
                    onChange={(e) =>
                      setShiftForm({ ...shiftForm, endTime: e.target.value })
                    }
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      !shiftForm.isOvernight && shiftForm.endTime < shiftForm.startTime
                        ? "border-red-400 bg-red-50"
                        : "border-gray-200"
                    }`}
                  />
                  {!shiftForm.isOvernight && shiftForm.endTime < shiftForm.startTime && (
                    <p className="text-xs text-red-500 mt-1">Giờ kết thúc phải ≥ giờ bắt đầu (hoặc bật &quot;Ca qua đêm&quot;)</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Nghỉ trưa từ
                  </label>
                  <input
                    type="time"
                    value={shiftForm.breakStartTime}
                    onChange={(e) =>
                      setShiftForm({
                        ...shiftForm,
                        breakStartTime: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Nghỉ trưa đến
                  </label>
                  <input
                    type="time"
                    value={shiftForm.breakEndTime}
                    onChange={(e) =>
                      setShiftForm({
                        ...shiftForm,
                        breakEndTime: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Cho phép đi muộn (phút)
                  </label>
                  <input
                    type="number"
                    value={shiftForm.allowLateMinutes}
                    onChange={(e) =>
                      setShiftForm({
                        ...shiftForm,
                        allowLateMinutes: Number(e.target.value),
                      })
                    }
                    min={0}
                    max={120}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Cho phép về sớm (phút)
                  </label>
                  <input
                    type="number"
                    value={shiftForm.allowEarlyLeaveMinutes}
                    onChange={(e) =>
                      setShiftForm({
                        ...shiftForm,
                        allowEarlyLeaveMinutes: Number(e.target.value),
                      })
                    }
                    min={0}
                    max={120}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Màu sắc
                  </label>
                  <div className="flex items-center gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setShiftForm({ ...shiftForm, color: c })}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${shiftForm.color === c ? "border-gray-800 scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shiftForm.isOvernight}
                      onChange={(e) =>
                        setShiftForm({
                          ...shiftForm,
                          isOvernight: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-600">Ca qua đêm</span>
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleSaveShift}
                  disabled={!shiftForm.isOvernight && shiftForm.endTime < shiftForm.startTime}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Lưu
                </button>
                <button
                  onClick={() => {
                    setEditingShift(null);
                    setIsCreating(false);
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Hủy
                </button>
              </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-600">
              {shifts.length} ca làm việc
            </h3>
            {!isCreating && !editingShift && (
              <button
                onClick={openCreateForm}
                className="px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                + Tạo ca mới
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map((shift) => (
              <div
                key={shift.id}
                className="bg-white rounded-xl border border-gray-200 p-5 card-hover"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-10 rounded-full"
                      style={{ backgroundColor: shift.color }}
                    />
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {shift.name}
                      </h4>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {shift.startTime} → {shift.endTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditForm(shift)}
                      className="px-2 py-1 rounded-lg hover:bg-gray-100 text-xs text-primary-600 font-medium transition-colors"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => setConfirmDeleteShift(shift)}
                      className="px-2 py-1 rounded-lg hover:bg-red-50 text-xs text-red-600 font-medium transition-colors"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                  <span>Muộn: {shift.allowLateMinutes}p</span>
                  <span>Sớm: {shift.allowEarlyLeaveMinutes}p</span>
                  {shift.breakStartTime && shift.breakEndTime && (
                    <span>
                      Nghỉ: {shift.breakStartTime}–{shift.breakEndTime}
                    </span>
                  )}
                  {shift.isOvernight && (
                    <span className="text-purple-500">Qua đêm</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center gap-3">
            <input
              type="text"
              placeholder="🔍 Tìm nhân viên..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
            />
            <span className="text-sm text-gray-500">{empTotal.toLocaleString()} nhân viên</span>
          </div>
          <Pagination page={empPage} totalPages={empTotalPages} total={empTotal} onPageChange={(p) => loadEmployees(p, empSearch)} label="nhân viên" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[180px]">
                    Nhân viên
                  </th>
                  {DAY_LABELS.map((day, i) => (
                    <th
                      key={i}
                      className="text-center px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[100px]"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      Chưa có nhân viên
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary-700">
                              {emp.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {emp.name}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {emp.employeeCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      {DAYS.map((_, dayIdx) => {
                        const assignment = getAssignment(emp.id, dayIdx);
                        const assignedShift = assignment
                          ? shifts.find((s) => s.id === assignment.shiftId)
                          : null;
                        return (
                          <td key={dayIdx} className="px-2 py-3 text-center">
                            <select
                              value={assignment?.shiftId || ""}
                              onChange={(e) =>
                                toggleAssignment(emp.id, dayIdx, e.target.value)
                              }
                              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-primary-500"
                              style={
                                assignedShift
                                  ? {
                                      backgroundColor:
                                        assignedShift.color + "15",
                                      borderColor: assignedShift.color,
                                      color: assignedShift.color,
                                    }
                                  : {}
                              }
                            >
                              <option value="">Nghỉ</option>
                              {shifts.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={empPage} totalPages={empTotalPages} total={empTotal} onPageChange={(p) => loadEmployees(p, empSearch)} label="nhân viên" />
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteShift}
        title="Xóa ca làm việc"
        message={`Bạn có chắc muốn xóa ca "${confirmDeleteShift?.name}"?`}
        confirmLabel="Xóa"
        onConfirm={() => confirmDeleteShift && handleDeleteShift(confirmDeleteShift)}
        onCancel={() => setConfirmDeleteShift(null)}
      />
    </div>
  );
}
