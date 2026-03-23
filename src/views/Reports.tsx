import {
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { vi } from "date-fns/locale";
import { useEffect, useState } from "react";
import Pagination from "../components/Pagination";
import {
  getAttendanceRecords,
  getEmployeesPaginated,
  getLeaveRequests,
  getOTRequests,
  getPenalties,
} from "../store/storage";
import type { Employee } from "../types";

interface EmployeeReport {
  employee: Employee;
  totalDays: number;
  presentDays: number;
  lateDays: number;
  totalLateMinutes: number;
  totalWorkingHours: number;
  totalOTHours: number;
  leaveDays: number;
  penalties: number;
  onTimeRate: number;
}

export default function Reports() {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [report, setReport] = useState<EmployeeReport[]>([]);
  const [reportType, setReportType] = useState<
    "summary" | "late" | "ot" | "leave"
  >("summary");
  const [empPage, setEmpPage] = useState(1);
  const [empTotalPages, setEmpTotalPages] = useState(1);
  const [empTotal, setEmpTotal] = useState(0);
  const [empSearch, setEmpSearch] = useState("");

  useEffect(() => {
    generateReport();
  }, [month, empPage]);

  useEffect(() => {
    const delay = empSearch ? 400 : 0;
    const timer = setTimeout(() => {
      setEmpPage(1);
      generateReport(1);
    }, delay);
    return () => clearTimeout(timer);
  }, [empSearch]);

  async function generateReport(page?: number) {
    const currentPage = page ?? empPage;
    const params: Record<string, string> = { page: String(currentPage), limit: '30', isActive: 'true' };
    if (empSearch.trim()) params.search = empSearch.trim();
    const empRes = await getEmployeesPaginated(params);
    const employees = empRes.data;
    setEmpPage(empRes.pagination.page);
    setEmpTotalPages(empRes.pagination.totalPages);
    setEmpTotal(empRes.pagination.total);
    const allRecords = await getAttendanceRecords();
    const allOT = await getOTRequests();
    const allLeaves = await getLeaveRequests();
    const allPenalties = await getPenalties();

    const start = startOfMonth(parseISO(month + "-01"));
    const end = endOfMonth(start);
    const workDays = eachDayOfInterval({ start, end }).filter(
      (d) => d.getDay() !== 0 && d.getDay() !== 6,
    );
    const totalWorkDays = workDays.length;

    const monthStr = month;

    const data = employees.map((emp): EmployeeReport => {
      const records = allRecords.filter(
        (r) => r.employeeId === emp.id && r.date.startsWith(monthStr),
      );
      const presentDays = records.filter((r) => r.checkInTime).length;
      const lateDays = records.filter((r) => (r.lateMinutes ?? 0) > 0).length;
      const totalLateMinutes = records.reduce(
        (s, r) => s + (r.lateMinutes ?? 0),
        0,
      );
      const totalWorkingHours = records.reduce(
        (s, r) => s + (r.workingHours ?? 0),
        0,
      );

      const otRequests = allOT.filter(
        (o) =>
          o.employeeId === emp.id &&
          o.date.startsWith(monthStr) &&
          o.status === "approved",
      );
      const totalOTHours = otRequests.reduce((s, o) => {
        const [sh, sm] = o.startTime.split(":").map(Number);
        const [eh, em] = o.endTime.split(":").map(Number);
        return s + (eh + em / 60 - (sh + sm / 60));
      }, 0);

      const leaves = allLeaves.filter(
        (l) =>
          l.employeeId === emp.id &&
          l.status === "approved" &&
          l.startDate.startsWith(monthStr),
      );
      const leaveDays = leaves.length;

      const penalties = allPenalties.filter(
        (p) => p.employeeId === emp.id && p.date.startsWith(monthStr),
      ).length;

      const onTimeRate =
        presentDays > 0
          ? Math.round(((presentDays - lateDays) / presentDays) * 100)
          : 0;

      return {
        employee: emp,
        totalDays: totalWorkDays,
        presentDays,
        lateDays,
        totalLateMinutes,
        totalWorkingHours: Math.round(totalWorkingHours * 10) / 10,
        totalOTHours: Math.round(totalOTHours * 10) / 10,
        leaveDays,
        penalties,
        onTimeRate,
      };
    });

    setReport(data);
  }

  const totals = report.reduce(
    (acc, r) => ({
      presentDays: acc.presentDays + r.presentDays,
      lateDays: acc.lateDays + r.lateDays,
      totalLateMinutes: acc.totalLateMinutes + r.totalLateMinutes,
      totalWorkingHours: acc.totalWorkingHours + r.totalWorkingHours,
      totalOTHours: acc.totalOTHours + r.totalOTHours,
      leaveDays: acc.leaveDays + r.leaveDays,
      penalties: acc.penalties + r.penalties,
    }),
    {
      presentDays: 0,
      lateDays: 0,
      totalLateMinutes: 0,
      totalWorkingHours: 0,
      totalOTHours: 0,
      leaveDays: 0,
      penalties: 0,
    },
  );

  const avgOnTime =
    report.length > 0
      ? Math.round(report.reduce((s, r) => s + r.onTimeRate, 0) / report.length)
      : 0;


  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo cáo tổng hợp</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(parseISO(month + "-01"), "MMMM yyyy", { locale: vi })} ·{" "}
            {report.length} nhân viên
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            type="text"
            placeholder="🔍 Tìm nhân viên..."
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-56"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Tổng giờ làm</p>
          <p className="text-xl font-bold text-gray-900">
            {totals.totalWorkingHours}h
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Tổng OT</p>
          <p className="text-xl font-bold text-blue-600">
            {totals.totalOTHours}h
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Đi muộn</p>
          <p className="text-xl font-bold text-yellow-600">
            {totals.lateDays} lượt
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Đúng giờ TB</p>
          <p className="text-xl font-bold text-green-600">{avgOnTime}%</p>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(["summary", "late", "ot", "leave"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setReportType(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${reportType === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {
              {
                summary: "Tổng hợp",
                late: "Đi muộn",
                ot: "Tăng ca",
                leave: "Nghỉ phép",
              }[t]
            }
          </button>
        ))}
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Pagination page={empPage} totalPages={empTotalPages} total={empTotal} onPageChange={setEmpPage} label="nhân viên" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Nhân viên
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Phòng ban
                </th>
                {reportType === "summary" && (
                  <>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Có mặt
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Giờ làm
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      OT
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Muộn
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Nghỉ
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Đúng giờ
                    </th>
                  </>
                )}
                {reportType === "late" && (
                  <>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Số lần
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Tổng phút
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      TB/lần
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Vi phạm
                    </th>
                  </>
                )}
                {reportType === "ot" && (
                  <>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Giờ OT
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Giờ làm
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      % OT
                    </th>
                  </>
                )}
                {reportType === "leave" && (
                  <>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Nghỉ phép
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Có mặt
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Vắng
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    Chưa có dữ liệu
                  </td>
                </tr>
              ) : (
                report
                  .sort((a, b) => {
                    if (reportType === "late")
                      return b.totalLateMinutes - a.totalLateMinutes;
                    if (reportType === "ot")
                      return b.totalOTHours - a.totalOTHours;
                    if (reportType === "leave")
                      return b.leaveDays - a.leaveDays;
                    return b.totalWorkingHours - a.totalWorkingHours;
                  })
                  .map((r) => (
                    <tr
                      key={r.employee.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {r.employee.name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {r.employee.employeeCode}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {r.employee.department}
                      </td>
                      {reportType === "summary" && (
                        <>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.presentDays}/{r.totalDays}
                          </td>
                          <td className="px-5 py-3 text-center text-sm font-medium">
                            {r.totalWorkingHours}h
                          </td>
                          <td className="px-5 py-3 text-center text-sm text-blue-600">
                            {r.totalOTHours}h
                          </td>
                          <td className="px-5 py-3 text-center">
                            {r.lateDays > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                {r.lateDays} lần
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">0</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.leaveDays}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                r.onTimeRate >= 90
                                  ? "bg-green-100 text-green-700"
                                  : r.onTimeRate >= 70
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                            >
                              {r.onTimeRate}%
                            </span>
                          </td>
                        </>
                      )}
                      {reportType === "late" && (
                        <>
                          <td className="px-5 py-3 text-center text-sm font-medium">
                            {r.lateDays}
                          </td>
                          <td className="px-5 py-3 text-center text-sm text-yellow-600 font-medium">
                            {r.totalLateMinutes}p
                          </td>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.lateDays > 0
                              ? Math.round(r.totalLateMinutes / r.lateDays)
                              : 0}
                            p
                          </td>
                          <td className="px-5 py-3 text-center text-sm text-red-600">
                            {r.penalties}
                          </td>
                        </>
                      )}
                      {reportType === "ot" && (
                        <>
                          <td className="px-5 py-3 text-center text-sm font-medium text-blue-600">
                            {r.totalOTHours}h
                          </td>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.totalWorkingHours}h
                          </td>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.totalWorkingHours > 0
                              ? Math.round(
                                  (r.totalOTHours / r.totalWorkingHours) * 100,
                                )
                              : 0}
                            %
                          </td>
                        </>
                      )}
                      {reportType === "leave" && (
                        <>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.leaveDays}
                          </td>
                          <td className="px-5 py-3 text-center text-sm">
                            {r.presentDays}/{r.totalDays}
                          </td>
                          <td className="px-5 py-3 text-center text-sm text-red-600">
                            {r.totalDays - r.presentDays - r.leaveDays}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={empPage} totalPages={empTotalPages} total={empTotal} onPageChange={setEmpPage} label="nhân viên" />
      </div>
    </div>
  );
}
