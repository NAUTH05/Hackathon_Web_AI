import { format } from "date-fns";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import Pagination from "../components/Pagination";
import {
  addHoliday,
  addLeaveRequest,
  checkAutoRejectLeave,
  deleteHoliday,
  getEmployeesPaginated,
  getHolidays,
  getLeaveRequestsPaginated,
  updateLeaveRequest,
} from "../store/storage";
import type { Employee, Holiday, LeaveRequest } from "../types";
import { X, Calendar, AlertTriangle, Clock } from "lucide-react";
import { showToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import EmployeeSearchDropdown from "../components/EmployeeSearchDropdown";

export default function LeaveManagement() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || (user?.roleLevel ?? 5) <= 3;
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeTab, setActiveTab] = useState<"leave" | "holiday">("leave");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showHolidayForm, setShowHolidayForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirmDeleteHoliday, setConfirmDeleteHoliday] = useState<string | null>(null);

  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    type: "annual" as LeaveRequest["type"],
    reason: "",
    hours: 0,
  });



  // Validate endDate >= startDate
  function isDateValid(): boolean {
    if (leaveForm.type === "hourly") return true; // hourly leave uses same day
    return leaveForm.endDate >= leaveForm.startDate;
  }

  // Auto-fill maternity end date (6 months)
  function handleTypeChange(type: LeaveRequest["type"]) {
    const updates: Partial<typeof leaveForm> = { type };
    if (type === "maternity") {
      const start = new Date(leaveForm.startDate + "T00:00:00");
      start.setMonth(start.getMonth() + 6);
      updates.endDate = start.toISOString().split("T")[0];
    }
    if (type === "hourly") {
      updates.endDate = leaveForm.startDate;
      updates.hours = 4;
    }
    setLeaveForm({ ...leaveForm, ...updates });
  }

  const [holidayForm, setHolidayForm] = useState({
    name: "",
    date: new Date().toISOString().split("T")[0],
    type: "public" as Holiday["type"],
    salaryMultiplier: 2.0,
  });

  useEffect(() => {
    async function init() {
      setHolidays(await getHolidays());
      const res = await getEmployeesPaginated({
        limit: "50",
        isActive: "true",
      });
      setEmployees(res.data);
      if (!canManage && user?.employeeId) {
        setLeaveForm((prev) => ({ ...prev, employeeId: user.employeeId! }));
      }
    }
    init();
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus]);

  useEffect(() => {
    loadLeaves();
  }, [page, filterStatus]);

  async function loadLeaves() {
    const params: Record<string, string> = { page: String(page), limit: "30" };
    if (filterStatus) params.status = filterStatus;
    const res = await getLeaveRequestsPaginated(params);
    setLeaves(res.data);
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

  async function handleLeaveSubmit() {
    if (!leaveForm.employeeId) {
      showToast('warning', 'Thiếu thông tin', 'Vui lòng chọn nhân viên.');
      return;
    }
    if (!leaveForm.reason.trim()) {
      showToast('warning', 'Thiếu thông tin', 'Vui lòng nhập lý do nghỉ phép.');
      return;
    }

    if (!isDateValid()) {
      showToast('warning', 'Lỗi ngày', 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu.');
      return;
    }

    const emp = employees.find((e) => e.id === leaveForm.employeeId);
    const empName = emp?.name || (leaveForm.employeeId === user?.employeeId ? user?.name : null);
    if (!empName) {
      showToast('warning', 'Lỗi', 'Không tìm thấy thông tin nhân viên.');
      return;
    }

    await addLeaveRequest({
      employeeId: leaveForm.employeeId,
      employeeName: empName,
      startDate: leaveForm.startDate,
      endDate:
        leaveForm.type === "hourly" ? leaveForm.startDate : leaveForm.endDate,
      type: leaveForm.type,
      hours: leaveForm.type === "hourly" ? leaveForm.hours : undefined,
      reason: leaveForm.reason,
      status: "pending",
    });

    await loadLeaves();
    setShowLeaveForm(false);
    setLeaveForm({
      employeeId:
        !canManage && user?.employeeId ? user.employeeId : "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      type: "annual",
      reason: "",
      hours: 0,
    });
  }

  async function handleHolidaySubmit() {
    if (!holidayForm.name.trim()) return;
    await addHoliday({ ...holidayForm });
    setHolidays(await getHolidays());
    setShowHolidayForm(false);
    setHolidayForm({
      name: "",
      date: new Date().toISOString().split("T")[0],
      type: "public",
      salaryMultiplier: 2.0,
    });
  }

  async function handleApproveLeave(leave: LeaveRequest) {
    await updateLeaveRequest(leave.id, { status: "approved" });
    await loadLeaves();
  }

  async function handleRejectLeave(leave: LeaveRequest) {
    await updateLeaveRequest(leave.id, { status: "rejected" });
    await loadLeaves();
  }

  async function handleDeleteHoliday(id: string) {
    await deleteHoliday(id);
    setHolidays(await getHolidays());
    setConfirmDeleteHoliday(null);
  }

  const typeLabel: Record<string, string> = {
    annual: "Phép năm",
    sick: "Bệnh",
    personal: "Việc riêng",
    maternity: "Thai sản",
    unpaid: "Không lương",
    hourly: "Nghỉ theo giờ",
  };
  const statusLabel: Record<string, string> = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Từ chối",
  };
  const statusStyle: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Nghỉ phép & Ngày lễ
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {leaves.filter((l) => l.status === "pending").length} đơn chờ duyệt
            · {holidays.length} ngày lễ
          </p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("leave")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "leave" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Nghỉ phép
        </button>
        <button
          onClick={() => setActiveTab("holiday")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === "holiday" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          Ngày lễ
        </button>
      </div>

      {activeTab === "leave" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ duyệt</option>
              <option value="approved">Đã duyệt</option>
              <option value="rejected">Từ chối</option>
            </select>
            <button
              onClick={() => setShowLeaveForm(true)}
              className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              + Tạo đơn nghỉ
            </button>
            {isAdmin && (
              <button
                onClick={async () => {
                  try {
                    const result = await checkAutoRejectLeave();
                    showToast('success', 'Auto từ chối thành công', `${result.updatedCount} đơn bị từ chối`);
                    loadLeaves();
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
                    showToast('error', 'Lỗi', msg);
                  }
                }}
                className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
              >
                ⏰ Auto từ chối (24h)
              </button>
            )}
          </div>

          {/* ===== LEAVE POPUP MODAL ===== */}
          {showLeaveForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary-600" />
                    Tạo đơn nghỉ phép
                  </h3>
                  <button
                    onClick={() => setShowLeaveForm(false)}
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
                      Đơn nghỉ chưa duyệt sau 24 giờ sẽ tự động bị từ chối.
                    </p>
                  </div>

                  {/* Employee selector — searchable dropdown */}
                  {canManage ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Nhân viên
                      </label>
                      <EmployeeSearchDropdown
                        employees={employees}
                        value={leaveForm.employeeId}
                        onChange={(id) =>
                          setLeaveForm({ ...leaveForm, employeeId: id })
                        }
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

                  {/* Leave type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Loại nghỉ
                    </label>
                    <select
                      value={leaveForm.type}
                      onChange={(e) =>
                        handleTypeChange(e.target.value as LeaveRequest["type"])
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {Object.entries(typeLabel).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {leaveForm.type === "maternity" && (
                      <p className="text-xs text-purple-600 mt-1">
                        ⓘ Thai sản: tự động nghỉ 6 tháng từ ngày bắt đầu
                      </p>
                    )}
                  </div>

                  {/* Hourly leave: hours input */}
                  {leaveForm.type === "hourly" ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Ngày nghỉ
                        </label>
                        <input
                          type="date"
                          value={leaveForm.startDate}
                          onChange={(e) =>
                            setLeaveForm({
                              ...leaveForm,
                              startDate: e.target.value,
                              endDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Số giờ nghỉ
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0.5}
                            max={8}
                            step={0.5}
                            value={leaveForm.hours}
                            onChange={(e) =>
                              setLeaveForm({
                                ...leaveForm,
                                hours: Number(e.target.value),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </div>
                        <div className="flex gap-1 mt-1">
                          {[1, 2, 4, 6].map((h) => (
                            <button
                              key={h}
                              type="button"
                              onClick={() =>
                                setLeaveForm({ ...leaveForm, hours: h })
                              }
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${leaveForm.hours === h ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                            >
                              {h}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Từ ngày
                        </label>
                        <input
                          type="date"
                          value={leaveForm.startDate}
                          onChange={(e) => {
                            const updates: Partial<typeof leaveForm> = {
                              startDate: e.target.value,
                            };
                            if (leaveForm.type === "maternity") {
                              const start = new Date(
                                e.target.value + "T00:00:00"
                              );
                              start.setMonth(start.getMonth() + 6);
                              updates.endDate = start
                                .toISOString()
                                .split("T")[0];
                            }
                            setLeaveForm({ ...leaveForm, ...updates });
                          }}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Đến ngày
                        </label>
                        <input
                          type="date"
                          value={leaveForm.endDate}
                          min={leaveForm.startDate}
                          readOnly={leaveForm.type === "maternity"}
                          onChange={(e) =>
                            setLeaveForm({
                              ...leaveForm,
                              endDate: e.target.value,
                            })
                          }
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                            !isDateValid()
                              ? "border-red-400 bg-red-50"
                              : "border-gray-200"
                          } ${leaveForm.type === "maternity" ? "bg-gray-50 cursor-not-allowed" : ""}`}
                        />
                        {!isDateValid() && (
                          <p className="text-xs text-red-500 mt-1">
                            Ngày kết thúc phải ≥ ngày bắt đầu
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Lý do
                    </label>
                    <textarea
                      value={leaveForm.reason}
                      onChange={(e) =>
                        setLeaveForm({ ...leaveForm, reason: e.target.value })
                      }
                      placeholder="Lý do nghỉ phép..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
                  <button
                    onClick={() => setShowLeaveForm(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleLeaveSubmit}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Gửi đơn
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
              label="đơn nghỉ phép"
            />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Nhân viên
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Từ
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Đến
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Loại
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
                  {leaves.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-12 text-gray-400"
                      >
                        Chưa có đơn nghỉ phép
                      </td>
                    </tr>
                  ) : (
                    leaves.map((leave) => (
                      <tr
                        key={leave.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">
                          {leave.employeeName}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {format(
                            new Date(leave.startDate + "T00:00:00"),
                            "dd/MM/yyyy"
                          )}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600">
                          {leave.type === "hourly" ? (
                            <span className="text-purple-600 font-medium">
                              {(leave as unknown as { hours?: number }).hours ||
                                0}
                              h
                            </span>
                          ) : (
                            format(
                              new Date(leave.endDate + "T00:00:00"),
                              "dd/MM/yyyy"
                            )
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${leave.type === "hourly" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}
                          >
                            {typeLabel[leave.type] || leave.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                          {leave.reason}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[leave.status]}`}
                          >
                            {statusLabel[leave.status]}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {leave.status === "pending" && canManage && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleApproveLeave(leave)}
                                className="px-2 py-1 text-xs text-green-600 font-medium hover:bg-green-50 rounded-lg"
                              >
                                Duyệt
                              </button>
                              <button
                                onClick={() => handleRejectLeave(leave)}
                                className="px-2 py-1 text-xs text-red-600 font-medium hover:bg-red-50 rounded-lg"
                              >
                                Từ chối
                              </button>
                            </div>
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
              label="đơn nghỉ phép"
            />
          </div>
        </>
      )}

      {activeTab === "holiday" && (
        <>
          <div className="flex items-center justify-end mb-4">
            {isAdmin && (
              <button
                onClick={() => setShowHolidayForm(true)}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                + Thêm ngày lễ
              </button>
            )}
          </div>

          {/* Holiday Popup Modal */}
          {showHolidayForm && isAdmin && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary-600" />
                    Thêm ngày lễ
                  </h3>
                  <button
                    onClick={() => setShowHolidayForm(false)}
                    className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Tên ngày lễ
                      </label>
                      <input
                        type="text"
                        value={holidayForm.name}
                        onChange={(e) =>
                          setHolidayForm({ ...holidayForm, name: e.target.value })
                        }
                        placeholder="Tết Nguyên Đán"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Ngày
                      </label>
                      <input
                        type="date"
                        value={holidayForm.date}
                        onChange={(e) =>
                          setHolidayForm({ ...holidayForm, date: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Loại
                      </label>
                      <select
                        value={holidayForm.type}
                        onChange={(e) =>
                          setHolidayForm({
                            ...holidayForm,
                            type: e.target.value as Holiday["type"],
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="public">Lễ quốc gia</option>
                        <option value="company">Công ty</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Hệ số lương
                      </label>
                      <select
                        value={holidayForm.salaryMultiplier}
                        onChange={(e) =>
                          setHolidayForm({
                            ...holidayForm,
                            salaryMultiplier: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value={1.0}>×1.0 (bình thường)</option>
                        <option value={1.5}>×1.5</option>
                        <option value={2.0}>×2.0 (mặc định lễ)</option>
                        <option value={3.0}>×3.0 (Tết Nguyên Đán)</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
                  <button
                    onClick={() => setShowHolidayForm(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleHolidaySubmit}
                    className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Tên
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Ngày
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Loại
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Hệ số lương
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holidays.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-12 text-gray-400"
                      >
                        Chưa có ngày lễ
                      </td>
                    </tr>
                  ) : (
                    holidays
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((h) => (
                        <tr
                          key={h.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-5 py-3 text-sm font-medium text-gray-900">
                            {h.name}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600">
                            {format(
                              new Date(h.date + "T00:00:00"),
                              "dd/MM/yyyy"
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                h.type === "public"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {h.type === "public" ? "Quốc gia" : "Công ty"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              ×{(h as unknown as Record<string, number>).salaryMultiplier || 2.0}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {isAdmin && (
                              <button
                                onClick={() => setConfirmDeleteHoliday(h.id)}
                                className="px-2 py-1 text-xs text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
                              >
                                Xóa
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>

    <ConfirmDialog
      open={!!confirmDeleteHoliday}
      title="Xóa ngày lễ"
      message="Bạn có chắc muốn xóa ngày lễ này?"
      confirmLabel="Xóa"
      onConfirm={() => confirmDeleteHoliday && handleDeleteHoliday(confirmDeleteHoliday)}
      onCancel={() => setConfirmDeleteHoliday(null)}
    />
    </>
  );
}
