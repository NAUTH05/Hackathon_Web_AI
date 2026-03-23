import { format } from "date-fns";
import { useEffect, useState } from "react";
import Pagination from "../components/Pagination";
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import {
  getMonthlyTimesheetsPaginated,
  generateMonthlyTimesheet,
  lockTimesheet,
  unlockTimesheet,
} from "../store/storage";
import type { MonthlyTimesheet as MonthlyTimesheetType } from "../types";
import { Search, X, FileSpreadsheet, Lock, Unlock } from "lucide-react";

export default function MonthlyTimesheet() {
  const { isAdmin } = useAuth();
  const [timesheets, setTimesheets] = useState<MonthlyTimesheetType[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [locking, setLocking] = useState(false);
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth, search]);

  useEffect(() => {
    loadTimesheets();
  }, [selectedMonth, page, search]);

  async function loadTimesheets() {
    const params: Record<string, string> = {
      month: selectedMonth,
      page: String(page),
      limit: "30",
    };
    if (search) params.search = search;
    const res = await getMonthlyTimesheetsPaginated(params);
    setTimesheets(res.data);
    setTotalPages(res.pagination.totalPages);
    setTotal(res.pagination.total);
  }

  const isLocked = timesheets.length > 0 && timesheets.every((t) => t.isLocked);
  const totalHours = timesheets.reduce(
    (s, t) => s + Number(t.totalWorkingHours),
    0,
  );
  const totalOT = timesheets.reduce((s, t) => s + Number(t.totalOTHours), 0);

  async function handleGenerate() {
    setGenerating(true);
    setShowConfirmGenerate(false);
    try {
      const result = await generateMonthlyTimesheet(selectedMonth);
      showToast('success', 'Tổng hợp thành công', result.message);
      await loadTimesheets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      showToast('error', 'Lỗi tổng hợp', msg);
    } finally {
      setGenerating(false);
    }
  }

  async function handleLockToggle() {
    setLocking(true);
    try {
      if (isLocked) {
        await unlockTimesheet(selectedMonth);
        showToast('success', 'Đã mở khóa', `Mở khóa bảng công tháng ${selectedMonth}`);
      } else {
        await lockTimesheet(selectedMonth);
        showToast('success', 'Đã khóa', `Khóa bảng công tháng ${selectedMonth}`);
      }
      await loadTimesheets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      showToast('error', 'Lỗi', msg);
    } finally {
      setLocking(false);
    }
  }

  return (
    <>
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bảng công tháng</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tổng hợp từ bảng công ngày (chỉ hiển thị, không tính toán)
            {isLocked && " — 🔒 Đã khóa"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {isAdmin && (
            <>
              <button
                onClick={() => setShowConfirmGenerate(true)}
                disabled={generating}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50"
              >
                {generating ? (
                  <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Đang tổng hợp...</>
                ) : (
                  <><FileSpreadsheet className="w-4 h-4" /> Tổng hợp tháng</>
                )}
              </button>
              <button
                onClick={handleLockToggle}
                disabled={locking}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                  isLocked
                    ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                {locking ? '...' : isLocked ? 'Mở khóa' : 'Khóa tháng'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm tên nhân viên..."
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

      {/* Summary  */}
      {timesheets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Nhân viên</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{total}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Tổng giờ làm</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {totalHours.toFixed(1)}h
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Tổng OT</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {totalOT.toFixed(1)}h
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Trạng thái</p>
            <p className={`text-2xl font-bold mt-1 ${isLocked ? 'text-red-600' : 'text-green-600'}`}>
              {isLocked ? '🔒 Đã khóa' : '🔓 Mở'}
            </p>
          </div>
        </div>
      )}

      {/* Table — merge+sum only, simplified columns */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="bảng công"
        />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Nhân viên
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Ngày công
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-blue-600 uppercase">
                  Giờ làm
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-purple-600 uppercase">
                  OT
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-violet-600 uppercase">
                  Ca đêm
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase">
                  Lễ
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-indigo-600 uppercase">
                  Tổng Giờ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {timesheets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    Chưa có dữ liệu. Vào "Bảng công ngày" → nhấn "Tổng hợp tháng" để tạo bảng công.
                  </td>
                </tr>
              ) : (
                timesheets.map((t) => {
                  const nightHours = (t as unknown as Record<string,number>).nightShiftHours || 0;
                  const holidayHours = (t as unknown as Record<string,number>).holidayHours || 0;
                  const totalWeighted = (t as unknown as Record<string,number>).totalWeightedHours || Number(t.totalWorkingHours);

                  return (
                    <tr
                      key={t.employeeId}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">
                        {t.employeeName}
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums">
                        <span className="text-green-600 font-medium">{t.presentDays}</span>
                        <span className="text-gray-400">/{t.totalWorkDays}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-blue-600 font-medium tabular-nums">
                        {t.totalWorkingHours}h
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums">
                        {Number(t.totalOTHours) > 0 ? (
                          <span className="text-purple-600 font-medium">
                            {t.totalOTHours}h
                          </span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums">
                        {nightHours > 0 ? (
                          <span className="text-violet-600 font-medium">
                            {nightHours}h
                          </span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums">
                        {holidayHours > 0 ? (
                          <span className="text-red-500 font-medium">
                            {holidayHours}h
                          </span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-indigo-600 tabular-nums">
                        {totalWeighted}h
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="bảng công"
        />
      </div>
    </div>

    <ConfirmDialog
      open={showConfirmGenerate}
      title="Tổng hợp bảng công tháng"
      message={`Tổng hợp bảng công tháng ${selectedMonth}? Dữ liệu cũ sẽ được cập nhật.`}
      confirmLabel="Tổng hợp"
      variant="warning"
      onConfirm={handleGenerate}
      onCancel={() => setShowConfirmGenerate(false)}
    />
    </>
  );
}
