import {
  Award,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  RefreshCw,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Pagination from "../components/Pagination";
import { showToast } from "../components/Toast";
import { getAttendanceScores } from "../store/storage";

type ScoreRecord = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  currentScore: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  fullDays: number;
  totalWorkingHours: number;
  otHours: number;
  absentDeduction: number;
  lateDeduction: number;
  otBonus: number;
  monthlyScore: number;
  rank: "S" | "A" | "B" | "C" | "D";
};

const rankConfig = {
  S: {
    label: "S - Xuất sắc",
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-300",
    icon: "⭐",
  },
  A: {
    label: "A - Tốt",
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-300",
    icon: "✅",
  },
  B: {
    label: "B - Khá",
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-300",
    icon: "👍",
  },
  C: {
    label: "C - Trung bình",
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-300",
    icon: "⚠️",
  },
  D: {
    label: "D - Yếu",
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-300",
    icon: "❌",
  },
};

export default function AttendanceScore() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [data, setData] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState(""); // debounced
  const [deptFilter, setDeptFilter] = useState("");
  const [rankFilter, setRankFilter] = useState("");
  const [sortBy, setSortBy] = useState<string>("monthlyScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showRules, setShowRules] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [departments, setDepartments] = useState<string[]>([]);
  const PAGE_SIZE = 50;

  // Debounce search input → reset page when search changes
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Single effect: reload whenever any query param changes
  useEffect(() => {
    setLoading(true);
    getAttendanceScores({
      month: selectedMonth,
      page,
      limit: PAGE_SIZE,
      search,
      dept: deptFilter,
      rank: rankFilter,
      sortBy,
      sortDir,
    })
      .then((res) => {
        setData((res.data as ScoreRecord[]) || []);
        setTotalPages(
          (res as unknown as { totalPages: number }).totalPages ?? 1,
        );
        setTotalCount((res as unknown as { total: number }).total ?? 0);
        const deptList = (res as unknown as { departments?: string[] })
          .departments;
        if (deptList?.length) setDepartments(deptList);
      })
      .catch((err) => {
        showToast("error", "Lỗi", "Không thể tải điểm chuyên cần");
        console.error(err);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, page, search, deptFilter, rankFilter, sortBy, sortDir]);

  // Summary stats from current page data
  const summary = useMemo(() => {
    if (!data.length) return null;
    const avg = data.reduce((s, r) => s + r.monthlyScore, 0) / data.length;
    const rankCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    data.forEach((r) => rankCounts[r.rank]++);
    // topEmployee = first item when sorted desc (server already sorted)
    const sorted = [...data].sort((a, b) => b.monthlyScore - a.monthlyScore);
    return {
      avg: parseFloat(avg.toFixed(1)),
      rankCounts,
      topEmployee: sorted[0],
      worstEmployee: sorted[sorted.length - 1],
    };
  }, [data]);

  function toggleSort(col: string) {
    setPage(1);
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  function sortIcon(col: string) {
    if (sortBy !== col) return <span className="opacity-30">↕</span>;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 inline" />
    ) : (
      <ChevronDown className="w-3 h-3 inline" />
    );
  }

  function ScoreBar({ score }: { score: number }) {
    const color =
      score >= 95
        ? "bg-yellow-500"
        : score >= 85
          ? "bg-green-500"
          : score >= 70
            ? "bg-blue-500"
            : score >= 50
              ? "bg-orange-500"
              : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums w-10 text-right">
          {score}
        </span>
      </div>
    );
  }

  function exportCSV() {
    const headers = [
      "Mã NV",
      "Họ tên",
      "Phòng ban",
      "Ngày đủ công",
      "Ngày trễ",
      "Ngày nghỉ",
      "Tổng giờ làm",
      "Giờ OT",
      "Trừ nghỉ",
      "Trừ trễ",
      "Thưởng OT",
      "Điểm tháng",
      "Xếp loại",
    ];
    const rows = data.map((r) => [
      r.employeeCode,
      r.employeeName,
      r.department,
      r.fullDays,
      r.lateDays,
      r.absentDays,
      r.totalWorkingHours.toFixed(1),
      r.otHours.toFixed(1),
      `-${r.absentDeduction}`,
      `-${r.lateDeduction}`,
      `+${r.otBonus}`,
      r.monthlyScore,
      r.rank,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diem-chuyen-can-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
            <Star className="w-5 h-5 text-violet-600" />
            Điểm chuyên cần tháng
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tự động tính từ dữ liệu chấm công: trễ giờ, vắng mặt, tăng ca
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <button
            onClick={() => {
              setPage(1);
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm font-medium hover:bg-purple-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới
          </button>
          {(data.length > 0 || totalCount > 0) && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100"
            >
              <Download className="w-4 h-4" />
              Xuất CSV
            </button>
          )}
        </div>
      </div>

      {/* Scoring Rules Card */}
      <div className="bg-white rounded-2xl border border-purple-100 overflow-hidden">
        <button
          onClick={() => setShowRules(!showRules)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-purple-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-purple-600" />
            Quy tắc tính điểm chuyên cần
          </div>
          {showRules ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {showRules && (
          <div className="px-5 pb-4 border-t border-purple-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-800">
                    Trừ điểm
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-red-700">
                  <li className="flex justify-between">
                    <span>Mỗi ngày vắng mặt</span>
                    <span className="font-bold">- 5 điểm</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Mỗi ngày đi trễ</span>
                    <span className="font-bold">- 2 điểm</span>
                  </li>
                </ul>
              </div>
              <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">
                    Cộng điểm
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-green-700">
                  <li className="flex justify-between">
                    <span>Mỗi giờ OT duyệt</span>
                    <span className="font-bold">+ 0.5 điểm</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Tối đa cộng OT</span>
                    <span className="font-bold">+ 10 điểm</span>
                  </li>
                </ul>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-800">
                    Xếp loại
                  </span>
                </div>
                <ul className="space-y-1 text-xs text-purple-700">
                  {Object.entries(rankConfig).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span>
                        {v.icon} {v.label}
                      </span>
                      <span className="font-bold">
                        {k === "S"
                          ? "≥95"
                          : k === "A"
                            ? "85–94"
                            : k === "B"
                              ? "70–84"
                              : k === "C"
                                ? "50–69"
                                : "<50"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-gray-400" />
              <p className="text-xs text-gray-500">Tổng nhân viên</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {totalCount.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-purple-200 p-4 bg-gradient-to-br from-purple-50 to-white">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 className="w-4 h-4 text-purple-500" />
              <p className="text-xs text-purple-700">Điểm TB tháng</p>
            </div>
            <p className="text-2xl font-bold text-purple-700">{summary.avg}</p>
          </div>
          <div className="bg-white rounded-2xl border border-yellow-200 p-4 bg-gradient-to-br from-yellow-50 to-white">
            <p className="text-xs text-yellow-700 mb-1">Cao nhất</p>
            <p className="text-sm font-bold text-gray-900 truncate">
              {summary.topEmployee?.employeeName}
            </p>
            <p className="text-xl font-bold text-yellow-700">
              {summary.topEmployee?.monthlyScore} ⭐
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-red-200 p-4 bg-gradient-to-br from-red-50 to-white">
            <p className="text-xs text-red-700 mb-1">Cần cải thiện</p>
            <p className="text-sm font-bold text-gray-900 truncate">
              {summary.worstEmployee?.employeeName}
            </p>
            <p className="text-xl font-bold text-red-700">
              {summary.worstEmployee?.monthlyScore}
            </p>
          </div>
        </div>
      )}

      {/* Rank distribution */}
      {summary && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Phân bổ xếp loại
          </p>
          <div className="flex gap-3 flex-wrap">
            {(
              Object.entries(rankConfig) as [
                keyof typeof rankConfig,
                (typeof rankConfig)[keyof typeof rankConfig],
              ][]
            ).map(([rank, cfg]) => (
              <button
                key={rank}
                onClick={() => {
                  setRankFilter(rankFilter === rank ? "" : rank);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                  rankFilter === rank
                    ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-sm`
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{rank}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}
                >
                  {summary.rankCounts[rank]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm tên, mã NV..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
          />
        </div>
        <select
          value={deptFilter}
          onChange={(e) => {
            setDeptFilter(e.target.value);
            setPage(1);
          }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
        >
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {(searchInput || deptFilter || rankFilter) && (
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setDeptFilter("");
              setRankFilter("");
              setPage(1);
            }}
            className="text-xs text-red-500 hover:text-red-700 font-medium px-2"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <RefreshCw className="w-8 h-8 text-purple-400 mx-auto mb-2 animate-spin" />
          <p className="text-gray-400 text-sm">Đang tính điểm...</p>
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">
            {totalCount === 0
              ? "Chưa có dữ liệu chấm công tháng này."
              : "Không tìm thấy kết quả."}
          </p>
        </div>
      ) : (
        <>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={totalCount}
            onPageChange={setPage}
            label="nhân viên"
          />
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-purple-50 to-violet-50 border-b border-purple-100">
                    <th
                      className="text-left px-4 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("employeeName")}
                    >
                      Nhân viên {sortIcon("employeeName")}
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      Phòng ban
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("totalWorkingHours")}
                    >
                      <Clock className="w-3 h-3 inline mr-1" />
                      Tổng giờ {sortIcon("totalWorkingHours")}
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("fullDays")}
                    >
                      Ngày đủ công {sortIcon("fullDays")}
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-red-600 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("lateDays")}
                    >
                      Trễ {sortIcon("lateDays")}
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-red-600 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("absentDays")}
                    >
                      Nghỉ {sortIcon("absentDays")}
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-blue-600 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("otHours")}
                    >
                      OT {sortIcon("otHours")}
                    </th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">
                      Điểm cộng/trừ
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-purple-700 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("monthlyScore")}
                    >
                      Điểm tháng {sortIcon("monthlyScore")}
                    </th>
                    <th
                      className="text-center px-3 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort("rank")}
                    >
                      Xếp loại {sortIcon("rank")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((r) => {
                    const rc = rankConfig[r.rank];
                    return (
                      <tr
                        key={r.employeeId}
                        className="hover:bg-purple-50/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">
                            {r.employeeName}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {r.employeeCode}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          {r.department || "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="font-medium text-gray-800">
                            {r.totalWorkingHours.toFixed(1)}h
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`font-bold ${r.fullDays > 0 ? "text-green-700" : "text-gray-400"}`}
                          >
                            {r.fullDays}
                          </span>
                          <span className="text-gray-400 text-xs"> ngày</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {r.lateDays > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                              {r.lateDays}
                            </span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {r.absentDays > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                              {r.absentDays}
                            </span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {r.otHours > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                              {r.otHours.toFixed(1)}h
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-0.5 text-xs">
                            {r.absentDeduction > 0 && (
                              <span className="text-red-600">
                                -{r.absentDeduction} nghỉ
                              </span>
                            )}
                            {r.lateDeduction > 0 && (
                              <span className="text-orange-600">
                                -{r.lateDeduction} trễ
                              </span>
                            )}
                            {r.otBonus > 0 && (
                              <span className="text-green-600">
                                +{r.otBonus} OT
                              </span>
                            )}
                            {r.absentDeduction === 0 &&
                              r.lateDeduction === 0 &&
                              r.otBonus === 0 && (
                                <span className="text-gray-300">—</span>
                              )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <ScoreBar score={r.monthlyScore} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold border ${rc.bg} ${rc.text} ${rc.border}`}
                          >
                            {rc.icon} {r.rank}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalCount}
              onPageChange={setPage}
              label="nhân viên"
            />
          </div>
        </>
      )}
    </div>
  );
}
