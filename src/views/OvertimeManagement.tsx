import { format } from "date-fns";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import Pagination from "../components/Pagination";
import {
  addOTRequest,
  getEmployeesPaginated,
  getOTRequestsPaginated,
  getShifts,
  updateOTRequest,
} from "../store/storage";
import type { Employee, OTRequest, Shift } from "../types";
import { X, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { showToast } from "../components/Toast";
import EmployeeSearchDropdown from "../components/EmployeeSearchDropdown";

export default function OvertimeManagement() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || (user?.roleLevel ?? 5) <= 3;
  const [requests, setRequests] = useState<OTRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [empSearch, setEmpSearch] = useState(""); // kept for server-side search
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [form, setForm] = useState({
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    shiftId: "",
    startTime: "17:00",
    endTime: "19:00",
    multiplier: 1.5,
    reason: "",
  });



  // Validate time: allow overnight (e.g. 17:00 → 07:00) — just check both are set
  function isTimeValid(): boolean {
    if (!form.startTime || !form.endTime) return false;
    // start == end is invalid
    return form.startTime !== form.endTime;
  }

  // Calculate OT hours (supports overnight)
  function calcOTHours(): number {
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60; // overnight
    return Math.round((mins / 60) * 100) / 100;
  }

  useEffect(() => {
    async function init() {
      const res = await getEmployeesPaginated({
        limit: "50",
        isActive: "true",
      });
      setEmployees(res.data);
      setShifts(await getShifts());

      // Auto-set employeeId for non-manager users (they don't see the dropdown)
      if (!canManage && user?.employeeId) {
        setForm((prev) => ({ ...prev, employeeId: user.employeeId! }));
      }
    }
    init();
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus]);

  useEffect(() => {
    loadRequests();
  }, [page, filterStatus]);

  async function loadRequests() {
    const params: Record<string, string> = { page: String(page), limit: "30" };
    if (filterStatus) params.status = filterStatus;
    const res = await getOTRequestsPaginated(params);
    setRequests(res.data);
    setTotalPages(res.pagination.totalPages);
    setTotal(res.pagination.total);
  }

  useEffect(() => {
    if (!empSearch) return;
    const timer = setTimeout(async () => {
      const res = await getEmployeesPaginated({
        limit: "50",
        isActive: "true",
        search: empSearch,
      });
      setEmployees(res.data);
    }, 400);
    return () => clearTimeout(timer);
  }, [empSearch]);

  async function handleSubmit() {
    if (!form.employeeId) {
      showToast('warning', 'Thiếu thông tin', 'Vui lòng chọn nhân viên.');
      return;
    }
    if (!form.reason.trim()) {
      showToast('warning', 'Thiếu thông tin', 'Vui lòng nhập lý do tăng ca.');
      return;
    }

    const emp = employees.find((e) => e.id === form.employeeId);
    // For non-managers, employee might not be in the paginated list — use user info
    const empName = emp?.name || (form.employeeId === user?.employeeId ? user?.name : null);
    if (!empName) {
      showToast('warning', 'Lỗi', 'Không tìm thấy thông tin nhân viên.');
      return;
    }
    if (!isTimeValid()) {
      showToast('warning', 'Lỗi giờ', 'Giờ bắt đầu và kết thúc không được trùng nhau.');
      return;
    }

    const hours = calcOTHours();

    await addOTRequest({
      employeeId: form.employeeId,
      employeeName: empName,
      date: form.date,
      shiftId: form.shiftId,
      startTime: form.startTime,
      endTime: form.endTime,
      hours: Math.max(0, hours),
      multiplier: form.multiplier,
      reason: form.reason,
      status: "pending",
    });

    await loadRequests();
    setShowForm(false);
    setForm({
      employeeId:
        !canManage && user?.employeeId ? user.employeeId : "",
      date: new Date().toISOString().split("T")[0],
      shiftId: "",
      startTime: "17:00",
      endTime: "19:00",
      multiplier: 1.5,
      reason: "",
    });
  }

  async function handleApprove(req: OTRequest) {
    await updateOTRequest(req.id, { status: "approved" });
    await loadRequests();
  }

  async function handleReject(req: OTRequest) {
    await updateOTRequest(req.id, { status: "rejected" });
    await loadRequests();
  }

  const statusLabel: Record<string, string> = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Từ chối",
    "auto-rejected": "Tự động từ chối",
  };
  const statusStyle: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    "auto-rejected": "bg-gray-100 text-gray-600",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Quản lý tăng ca (OT)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {requests.filter((r) => r.status === "pending").length} yêu cầu chờ
            duyệt
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          + Đăng ký OT
        </button>
      </div>

      {/* ===== POPUP MODAL ===== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-600" />
                Đăng ký tăng ca
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">


              {/* 24h auto reject notice */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Yêu cầu OT chưa duyệt sau 24 giờ sẽ tự động bị từ chối.
                </p>
              </div>

              {/* Employee selector — searchable dropdown for managers */}
              {canManage ? (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Nhân viên
                  </label>
                  <EmployeeSearchDropdown
                    employees={employees}
                    value={form.employeeId}
                    onChange={(id) => setForm({ ...form, employeeId: id })}
                    onSearch={(q) => setEmpSearch(q)}
                  />
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Đăng ký cho:</span>{" "}
                    {user?.name || "Bản thân"}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Ngày OT
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Ca liên quan
                  </label>
                  <select
                    value={form.shiftId}
                    onChange={(e) => {
                      const shiftId = e.target.value;
                      const s = shifts.find((x) => x.id === shiftId);
                      if (s) {
                        // Auto-fill times: OT typically starts after shift ends
                        setForm({ ...form, shiftId, startTime: s.endTime, endTime: s.endTime === s.startTime ? s.endTime : s.startTime });
                      } else {
                        setForm({ ...form, shiftId });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Không</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Từ
                  </label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm({ ...form, startTime: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Đến
                  </label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm({ ...form, endTime: e.target.value })
                    }
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      form.endTime && !isTimeValid()
                        ? "border-red-400 bg-red-50"
                        : "border-gray-200"
                    }`}
                  />
                  {form.endTime && !isTimeValid() && (
                    <p className="text-xs text-red-500 mt-1">
                      Giờ bắt đầu và kết thúc không được trùng nhau
                    </p>
                  )}
                </div>
              </div>

              {isTimeValid() && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Tổng: {calcOTHours()}h OT
                  {form.startTime > form.endTime && (
                    <span className="text-xs text-blue-500 ml-1">(qua đêm)</span>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Hệ số
                </label>
                <select
                  value={form.multiplier}
                  onChange={(e) =>
                    setForm({ ...form, multiplier: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={1.5}>x1.5 (Ngày thường)</option>
                  <option value={2.0}>x2.0 (Cuối tuần)</option>
                  <option value={3.0}>x3.0 (Lễ/Tết)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Lý do
                </label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Lý do tăng ca..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Gửi yêu cầu
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="auto-rejected">Tự động từ chối</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="yêu cầu OT"
        />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Nhân viên
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Ngày
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Thời gian
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Số giờ
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Hệ số
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Lý do
                </th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Trạng thái
                </th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    Chưa có yêu cầu tăng ca
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">
                      {req.employeeName}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {format(new Date(req.date + "T00:00:00"), "dd/MM/yyyy")}
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-gray-600 tabular-nums">
                      {req.startTime} – {req.endTime}
                    </td>
                    <td className="px-5 py-3 text-center text-sm font-medium text-blue-600 tabular-nums">
                      {req.hours}h
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-gray-600">
                      x{req.multiplier}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                      {req.reason}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[req.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {statusLabel[req.status] || req.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {req.status === "pending" && canManage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleApprove(req)}
                            className="px-2 py-1 rounded-lg hover:bg-green-50 text-xs text-green-600 font-medium transition-colors"
                          >
                            Duyệt
                          </button>
                          <button
                            onClick={() => handleReject(req)}
                            className="px-2 py-1 rounded-lg hover:bg-red-50 text-xs text-red-600 font-medium transition-colors"
                          >
                            Từ chối
                          </button>
                        </div>
                      )}
                      {req.status !== "pending" && req.approvedAt && (
                        <span className="text-xs text-gray-400">
                          {format(new Date(req.approvedAt), "dd/MM HH:mm")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="yêu cầu OT"
        />
      </div>
    </div>
  );
}
