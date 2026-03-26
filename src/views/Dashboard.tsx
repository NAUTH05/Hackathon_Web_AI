import { eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  MapPin,
  Palmtree,
  Timer,
  UserCheck,
  UserMinus,
  UserX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { attendanceApi } from "../services/api";
import { getAttendanceRecords, getPenaltiesPaginated } from "../store/storage";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    earlyLeaveToday: 0,
    onTimeRate: 0,
    pendingOT: 0,
    pendingLeave: 0,
    activePenalties: 0,
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [heatmapData, setHeatmapData] = useState<
    Map<string, { total: number; onTime: number; late: number; absent: number }>
  >(new Map());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  function loadData() {
    Promise.all([
      attendanceApi.stats(),
      getPenaltiesPaginated({ status: "active", limit: "1" }),
      getAttendanceRecords(),
    ]).then(([statsRes, penaltyRes, allRecords]) => {
      const s = statsRes as {
        today: {
          totalEmployees: number;
          checkedIn: number;
          late: number;
          onTime: number;
          notCheckedIn: number;
        };
        pendingRequests: { overtime: number; leave: number };
      };
      const onTimeRate =
        s.today.checkedIn > 0
          ? Math.round((s.today.onTime / s.today.checkedIn) * 100)
          : 0;

      setStats({
        totalEmployees: s.today.totalEmployees,
        presentToday: s.today.checkedIn,
        lateToday: s.today.late,
        absentToday: s.today.notCheckedIn,
        earlyLeaveToday: 0,
        onTimeRate,
        pendingOT: s.pendingRequests.overtime,
        pendingLeave: s.pendingRequests.leave,
        activePenalties: penaltyRes.pagination.total,
      });

      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const map = new Map<
        string,
        { total: number; onTime: number; late: number; absent: number }
      >();
      days.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const dayRecords = (
          allRecords as { date: string; status: string }[]
        ).filter((r) => r.date === dateStr);
        map.set(dateStr, {
          total: dayRecords.length,
          onTime: dayRecords.filter((r) => r.status === "on-time").length,
          late: dayRecords.filter((r) => r.status === "late").length,
          absent: dayRecords.filter((r) => r.status === "absent").length,
        });
      });
      setHeatmapData(map);
    });
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
    pending: "bg-gray-100 text-gray-600",
  };

  // Heatmap helpers
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay();

  function getHeatColor(dateStr: string): string {
    const data = heatmapData.get(dateStr);
    if (!data || data.total === 0) return "bg-gray-100";
    const ratio = data.onTime / Math.max(data.total, 1);
    if (data.late > 0 && ratio < 0.5) return "bg-red-200";
    if (data.late > 0) return "bg-yellow-200";
    if (ratio >= 0.8) return "bg-green-200";
    return "bg-green-100";
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Tổng quan hệ thống
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(currentTime, "EEEE, dd/MM/yyyy", { locale: vi })}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-primary-600 tabular-nums">
            {format(currentTime, "HH:mm:ss")}
          </div>
          <Link
            href="/attendance"
            className="inline-flex items-center gap-2 mt-1 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 transition-colors shadow-sm"
          >
            <MapPin className="w-4 h-4" />
            Chấm công ngay
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          {
            label: "Tổng NV",
            value: stats.totalEmployees,
            color: "text-primary-700",
            bg: "bg-primary-50",
            icon: <Users className="w-5 h-5 text-primary-400" />,
          },
          {
            label: "Có mặt",
            value: stats.presentToday,
            color: "text-green-700",
            bg: "bg-green-50",
            icon: <UserCheck className="w-5 h-5 text-green-400" />,
          },
          {
            label: "Đi muộn",
            value: stats.lateToday,
            color: "text-yellow-700",
            bg: "bg-yellow-50",
            icon: <Clock className="w-5 h-5 text-yellow-400" />,
          },
          {
            label: "Vắng mặt",
            value: stats.absentToday,
            color: "text-red-700",
            bg: "bg-red-50",
            icon: <UserX className="w-5 h-5 text-red-400" />,
          },
          {
            label: "Về sớm",
            value: stats.earlyLeaveToday,
            color: "text-orange-700",
            bg: "bg-orange-50",
            icon: <UserMinus className="w-5 h-5 text-orange-400" />,
          },
          {
            label: "Đúng giờ",
            value: `${stats.onTimeRate}%`,
            color: "text-emerald-700",
            bg: "bg-emerald-50",
            icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`${card.bg} rounded-2xl p-4 border border-gray-200/50 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              {card.icon}
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Pending actions row */}
      {(stats.pendingOT > 0 ||
        stats.pendingLeave > 0 ||
        stats.activePenalties > 0) && (
        <div className="flex gap-3 mb-6">
          {stats.pendingOT > 0 && (
            <Link
              href="/overtime"
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Timer className="w-4 h-4" />
              <span className="w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                {stats.pendingOT}
              </span>
              OT chờ duyệt
              <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
            </Link>
          )}
          {stats.pendingLeave > 0 && (
            <Link
              href="/leave"
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-700 hover:bg-purple-100 transition-colors"
            >
              <Palmtree className="w-4 h-4" />
              <span className="w-5 h-5 bg-purple-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                {stats.pendingLeave}
              </span>
              Nghỉ phép chờ duyệt
              <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
            </Link>
          )}
          {stats.activePenalties > 0 && (
            <Link
              href="/penalties"
              className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 hover:bg-red-100 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              <span className="w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                {stats.activePenalties}
              </span>
              Vi phạm chưa xử lý
              <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Heatmap chấm công — {format(now, "MMMM yyyy", { locale: vi })}
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-green-200" /> Tốt
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-yellow-200" /> Có muộn
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-red-200" /> Nhiều muộn
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-gray-100" /> Trống
              </span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}
            {daysInMonth.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const data = heatmapData.get(dateStr);
              const isToday =
                format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              return (
                <div
                  key={dateStr}
                  className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] transition-colors ${getHeatColor(dateStr)} ${isToday ? "ring-2 ring-primary-400 ring-offset-1" : ""}`}
                  title={
                    data
                      ? `${dateStr}: ${data.total} records, ${data.onTime} đúng giờ, ${data.late} muộn`
                      : dateStr
                  }
                >
                  <span className="font-medium text-gray-700">
                    {format(day, "d")}
                  </span>
                  {data && data.total > 0 && (
                    <span className="text-[8px] text-gray-500">
                      {data.total}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* On-time rate ring + stats */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Tỉ lệ đúng giờ hôm nay
          </h3>
          <div className="flex items-center justify-center py-4">
            <div className="relative w-32 h-32">
              <svg
                className="w-32 h-32 transform -rotate-90"
                viewBox="0 0 120 120"
              >
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke="#e5e7eb"
                  strokeWidth="10"
                  fill="none"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  stroke="#22c55e"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(stats.onTimeRate / 100) * 314} 314`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-800">
                  {stats.onTimeRate}%
                </span>
              </div>
            </div>
          </div>
          <div className="text-center text-sm text-gray-500 mb-4">
            {stats.presentToday}/{stats.totalEmployees} đã chấm công
          </div>

          {/* Quick stats */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tổng giờ OT chờ duyệt</span>
              <span className="font-medium text-gray-900">
                {stats.pendingOT}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Đơn nghỉ phép chờ</span>
              <span className="font-medium text-gray-900">
                {stats.pendingLeave}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Vi phạm đang xử lý</span>
              <span className="font-medium text-gray-900">
                {stats.activePenalties}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
