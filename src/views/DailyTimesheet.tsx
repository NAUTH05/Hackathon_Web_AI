"use client";

import { format } from "date-fns";
import { CalendarDays, Lock, Search, Unlock, X } from "lucide-react";
import { useEffect, useState } from "react";
import Pagination from "../components/Pagination";
import { showToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { timesheetsApi } from "../services/api";
import { getDailyTimesheetPaginated } from "../store/storage";

// DB datetime comes from API as "YYYY-MM-DDTHH:mm:ss+07:00" (Vietnam local time).
// Extract time part directly to avoid any browser timezone conversion.
const fmtTime = (dt: string | undefined | null): string => {
  if (!dt) return "--:--";
  const sep = dt.includes("T") ? "T" : " ";
  const time = (dt.split(sep)[1] ?? "").replace(/[+Z].*$/, "");
  return time.slice(0, 5) || "--:--";
};

interface DailyRecord {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  attendanceId: string | null;
  date: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  attendanceStatus: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workingHours: number;
  shiftName: string | null;
}

export default function DailyTimesheet() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    noRecord: 0,
    noCheckout: 0,
    totalHours: 0,
  });

  useEffect(() => {
    setPage(1);
  }, [selectedDate, search]);

  useEffect(() => {
    loadRecords();
  }, [selectedDate, page, search]);

  async function loadRecords() {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        date: selectedDate,
        page: String(page),
        limit: "30",
      };
      if (search) params.search = search;
      const res = await getDailyTimesheetPaginated(params);
      setRecords(res.data as unknown as DailyRecord[]);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
      setIsLocked(!!(res as unknown as Record<string, unknown>).isLocked);
      const s = (res as unknown as Record<string, unknown>).stats as
        | typeof stats
        | undefined;
      if (s) setStats(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLockToggle() {
    setLocking(true);
    try {
      if (isLocked) {
        await timesheetsApi.unlockDay(selectedDate);
        showToast(
          "success",
          "Đã mở khóa",
          `Bảng công ngày ${selectedDate} đã được mở khóa.`,
        );
      } else {
        await timesheetsApi.lockDay(selectedDate);
        showToast(
          "success",
          "Đã khóa",
          `Bảng công ngày ${selectedDate} đã bị khóa.`,
        );
      }
      await loadRecords();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi", msg);
    } finally {
      setLocking(false);
    }
  }

  const statusLabel: Record<string, string> = {
    "on-time": "Đúng giờ",
    late: "Đi trễ",
    "early-leave": "Về sớm",
    absent: "Vắng",
    pending: "Chưa về",
  };

  const statusStyle: Record<string, string> = {
    "on-time": "bg-green-100 text-green-700",
    late: "bg-yellow-100 text-yellow-700",
    "early-leave": "bg-orange-100 text-orange-700",
    absent: "bg-red-100 text-red-700",
    pending: "bg-blue-100 text-blue-700",
  };

  // Summary stats from server (aggregated across all employees, not just current page)
  const totalPresent = stats.present;
  const totalLate = stats.late;
  const totalNoRecord = stats.noRecord;
  const totalHours = stats.totalHours;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary-600" />
            Bảng công ngày
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tất cả nhân viên — dữ liệu chấm công ngày{" "}
            {format(new Date(selectedDate + "T00:00:00"), "dd/MM/yyyy")}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">
            Ngày
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
        </div>
        {isAdmin && (
          <button
            onClick={handleLockToggle}
            disabled={locking}
            className={`mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
              isLocked
                ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            }`}
          >
            {isLocked ? (
              <Unlock className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            {locking ? "..." : isLocked ? "Mở khóa ngày" : "Khóa ngày"}
          </button>
        )}
        {isLocked && (
          <span className="mt-5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            🔒 Đã khóa
          </span>
        )}
        <div className="relative flex-1 min-w-[200px] max-w-md mt-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã NV..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {total > 0 && isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Có mặt</p>
            <p className="text-2xl font-bold text-green-600">{totalPresent}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Đi trễ</p>
            <p className="text-2xl font-bold text-yellow-600">{totalLate}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Chưa chấm công</p>
            <p className="text-2xl font-bold text-red-600">{totalNoRecord}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Tổng giờ làm</p>
            <p className="text-2xl font-bold text-blue-600">
              {totalHours.toFixed(1)}h
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="nhân viên"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                  Mã NV
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                  Nhân viên
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                  Phòng ban
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                  Ca
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">
                  Vào
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">
                  Ra
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">
                  Giờ làm
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">
                  Trễ (phút)
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">
                  Trạng thái
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    Đang tải...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    {search ? "Không tìm thấy kết quả" : "Không có nhân viên"}
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr
                    key={r.employeeId}
                    className={`hover:bg-gray-50 transition-colors ${!r.attendanceId ? "bg-gray-50/50" : ""}`}
                  >
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                      {r.employeeCode}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {r.employeeName}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.department || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.shiftName || "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 tabular-nums">
                      {r.checkInTime ? fmtTime(r.checkInTime) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 tabular-nums">
                      {r.checkOutTime ? fmtTime(r.checkOutTime) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-blue-600 tabular-nums">
                      {r.workingHours ? `${r.workingHours}h` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.lateMinutes > 0 ? (
                        <span className="text-yellow-600 font-medium">
                          {r.lateMinutes}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.attendanceId ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[r.attendanceStatus || ""] || "bg-gray-100 text-gray-600"}`}
                        >
                          {statusLabel[r.attendanceStatus || ""] ||
                            r.attendanceStatus}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Chưa chấm công
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
          label="nhân viên"
        />
      </div>
    </div>
  );
}
