import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isToday,
  startOfMonth,
  subMonths,
} from "date-fns";
import { vi } from "date-fns/locale";
import { useEffect, useState } from "react";
import Pagination from "../components/Pagination";
import { showToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../services/api";
import {
  getAttendanceRecordsPaginated,
  getEmployeesPaginated,
} from "../store/storage";
import type { AttendanceRecord, Employee } from "../types";

export default function AttendanceHistory() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function init() {
      const res = await getEmployeesPaginated({ limit: "50" });
      setEmployees(res.data);
    }
    init();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filterEmployee, filterDate, filterStatus]);

  useEffect(() => {
    loadRecords();
  }, [page, filterEmployee, filterDate, filterStatus]);

  async function loadRecords() {
    const params: Record<string, string> = { page: String(page), limit: "30" };
    if (filterEmployee) params.employeeCode = filterEmployee;
    if (filterDate) params.date = filterDate;
    const res = await getAttendanceRecordsPaginated(params);
    setRecords(res.data);
    setTotalPages(res.pagination.totalPages);
    setTotal(res.pagination.total);
  }

  const statusLabels: Record<string, string> = {
    "on-time": "Đúng giờ",
    late: "Đi muộn",
    "early-leave": "Về sớm",
    absent: "Vắng",
    pending: "Chưa chấm",
  };
  const statusStyles: Record<string, string> = {
    "on-time": "bg-green-100 text-green-700",
    late: "bg-yellow-100 text-yellow-700",
    "early-leave": "bg-orange-100 text-orange-700",
    absent: "bg-red-100 text-red-700",
    pending: "bg-gray-100 text-gray-700",
  };

  // Client-side search filter (name search works within current page)
  const filtered = records.filter((r) => {
    const matchSearch =
      !search || r.employeeName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay();

  function getRecordsForDay(date: Date): AttendanceRecord[] {
    const dateStr = format(date, "yyyy-MM-dd");
    return records.filter((r) => {
      const matchDate = r.date === dateStr;
      const matchEmployee = !filterEmployee || r.employeeId === filterEmployee;
      return matchDate && matchEmployee;
    });
  }

  async function handleExportExcel() {
    try {
      const token = localStorage.getItem("auth_token");
      const params = new URLSearchParams();
      if (filterEmployee) params.set("employeeCode", filterEmployee);
      if (filterDate) params.set("date", filterDate);
      const res = await fetch(
        buildApiUrl(`/attendance/export?${params.toString()}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lich-su-cham-cong-${filterDate || "all"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Đã xuất", "File Excel đã được tải xuống");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi xuất file";
      showToast("error", "Lỗi xuất Excel", msg);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Lịch sử chấm công
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString()} bản ghi
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all"
            >
              📊 Xuất Excel
            </button>
          )}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
            >
              Danh sách
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "calendar" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
            >
              Lịch
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              placeholder="🔍 Tìm theo tên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-[200px]">
            <input
              type="text"
              placeholder="🔍 Mã nhân viên..."
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            label="bản ghi"
          />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Ngày
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Nhân viên
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Ca
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Giờ vào
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Giờ ra
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Muộn
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Giờ làm
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Trạng thái
                  </th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Ảnh
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-400">
                      Không có dữ liệu chấm công
                    </td>
                  </tr>
                ) : (
                  filtered.map((record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {format(
                          new Date(record.date + "T00:00:00"),
                          "dd/MM/yyyy",
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary-700">
                              {record.employeeName.charAt(0)}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {record.employeeName}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {record.shiftName}
                      </td>
                      <td className="px-5 py-3 text-center text-sm text-gray-600 tabular-nums">
                        {record.checkInTime
                          ? format(new Date(record.checkInTime), "HH:mm:ss")
                          : "--:--"}
                      </td>
                      <td className="px-5 py-3 text-center text-sm text-gray-600 tabular-nums">
                        {record.checkOutTime
                          ? format(new Date(record.checkOutTime), "HH:mm:ss")
                          : "--:--"}
                      </td>
                      <td className="px-5 py-3 text-center text-sm tabular-nums">
                        {record.lateMinutes > 0 ? (
                          <span className="text-yellow-600 font-medium">
                            {record.lateMinutes}p
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-sm tabular-nums">
                        {record.workingHours > 0 ? (
                          <span className="text-blue-600 font-medium">
                            {record.workingHours}h
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[record.status] || "bg-gray-100 text-gray-600"}`}
                        >
                          {statusLabels[record.status] || record.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {(record.checkInImage || record.checkOutImage) && (
                          <button
                            onClick={() => setSelectedRecord(record)}
                            className="px-2 py-1 rounded-lg hover:bg-gray-100 text-xs text-primary-600 font-medium transition-colors"
                          >
                            Xem
                          </button>
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
            label="bản ghi"
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm"
            >
              ◀ Trước
            </button>
            <h3 className="text-lg font-semibold text-gray-900">
              {format(currentMonth, "MMMM 'năm' yyyy", { locale: vi })}
            </h3>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm"
            >
              Sau ▶
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold text-gray-500 py-2"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div
                key={`pad-${i}`}
                className="bg-gray-50 rounded-lg min-h-[80px]"
              />
            ))}
            {daysInMonth.map((day) => {
              const dayRecords = getRecordsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`rounded-lg min-h-[80px] p-2 border transition-colors ${
                    isToday(day)
                      ? "border-primary-300 bg-primary-50"
                      : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <div className="text-xs font-medium text-gray-600 mb-1">
                    {format(day, "d")}
                  </div>
                  {dayRecords.length > 0 && (
                    <div className="space-y-0.5">
                      {dayRecords.slice(0, 3).map((r) => (
                        <div
                          key={r.id}
                          className={`text-[10px] px-1 py-0.5 rounded truncate ${statusStyles[r.status]}`}
                          title={`${r.employeeName} - ${statusLabels[r.status]}`}
                        >
                          {r.employeeName.split(" ").pop()}
                        </div>
                      ))}
                      {dayRecords.length > 3 && (
                        <div className="text-[10px] text-gray-400 px-1">
                          +{dayRecords.length - 3} khác
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedRecord && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Ảnh chấm công — {selectedRecord.employeeName}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {selectedRecord.checkInImage && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Vào ca</p>
                  <img
                    src={selectedRecord.checkInImage}
                    alt="Check-in"
                    className="w-full rounded-lg border border-gray-200"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedRecord.checkInTime
                      ? format(
                          new Date(selectedRecord.checkInTime),
                          "HH:mm:ss dd/MM/yyyy",
                        )
                      : ""}
                  </p>
                </div>
              )}
              {selectedRecord.checkOutImage && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Ra ca</p>
                  <img
                    src={selectedRecord.checkOutImage}
                    alt="Check-out"
                    className="w-full rounded-lg border border-gray-200"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedRecord.checkOutTime
                      ? format(
                          new Date(selectedRecord.checkOutTime),
                          "HH:mm:ss dd/MM/yyyy",
                        )
                      : ""}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedRecord(null)}
              className="mt-4 w-full py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
