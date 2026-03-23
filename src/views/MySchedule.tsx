import { addDays, format, getISOWeek, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getEmployeesPaginated,
  getShiftAssignments,
  getShifts,
} from "../store/storage";
import type {
  Employee,
  Shift,
  ShiftAssignment,
} from "../types";

// Time period definitions matching LHU style (Sáng / Chiều / Tối)
interface TimePeriod {
  id: string;
  label: string;
  timeRange: string;
  gradient: string;
  lightBg: string;
  textColor: string;
  borderColor: string;
}

const TIME_PERIODS: TimePeriod[] = [
  {
    id: "morning",
    label: "Sáng",
    timeRange: "06:00 – 12:00",
    gradient: "from-amber-400 to-orange-500",
    lightBg: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
  },
  {
    id: "afternoon",
    label: "Chiều",
    timeRange: "12:00 – 18:00",
    gradient: "from-blue-400 to-indigo-500",
    lightBg: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
  },
  {
    id: "evening",
    label: "Tối",
    timeRange: "18:00 – 06:00",
    gradient: "from-violet-500 to-purple-700",
    lightBg: "bg-violet-50",
    textColor: "text-violet-700",
    borderColor: "border-violet-200",
  },
];

function classifyShiftPeriod(shift: Shift): string[] {
  const startH = parseInt(shift.startTime.split(":")[0], 10);
  const endH = parseInt(shift.endTime.split(":")[0], 10);

  if (shift.isOvernight) return ["evening"];

  const periods: string[] = [];
  if (startH < 12 && endH > 6) periods.push("morning");
  if (startH < 18 && endH > 12) periods.push("afternoon");
  if (endH > 18 || startH >= 18) periods.push("evening");

  return periods.length ? periods : ["morning"];
}

const DAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

export default function MySchedule() {
  const { user, isAdmin } = useAuth();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [weekStart, setWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [empSearch, setEmpSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const userRoleLevel = user?.roleLevel ?? 5;
  // Only admin or managers (level ≤3) can view other employees' schedules
  const canViewOthers = isAdmin || userRoleLevel <= 3;

  useEffect(() => {
    async function init() {
      const res = await getEmployeesPaginated({ limit: '200', isActive: 'true' });
      const emps = res.data;
      setAllEmployees(emps);
      setShifts(await getShifts());
      setAssignments(await getShiftAssignments());

      // Always default to own schedule
      if (user?.employeeId) {
        setSelectedEmployee(user.employeeId);
      } else if (emps.length > 0) {
        setSelectedEmployee(emps[0].id);
      }
    }
    init();
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter employees by department + role for the dropdown
  const employees = useMemo(() => {
    let filtered = allEmployees;

    // Non-admin managers: only same department
    if (!isAdmin && user) {
      const userDept = user.department;
      filtered = filtered.filter((e) => e.department === userDept);
    }

    return filtered;
  }, [allEmployees, isAdmin, user]);

  // Employees matching search query (for dropdown)
  const searchResults = useMemo(() => {
    if (!empSearch.trim()) return employees;
    const q = empSearch.toLowerCase();
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const weekNumber = getISOWeek(weekStart);

  function getShiftForDay(employeeId: string, date: Date): Shift | undefined {
    const dow = date.getDay();
    const assignment = assignments.find(
      (a) => a.employeeId === employeeId && a.dayOfWeek === dow,
    );
    if (!assignment) return undefined;
    return shifts.find((s) => s.id === assignment.shiftId);
  }

  const timetable = useMemo(() => {
    if (!selectedEmployee) return [];

    return TIME_PERIODS.map((period) => ({
      period,
      days: weekDays.map((day) => {
        const shift = getShiftForDay(selectedEmployee, day);
        if (!shift) return { day, shift: undefined, active: false };
        const periods = classifyShiftPeriod(shift);
        const active = periods.includes(period.id);
        return { day, shift: active ? shift : undefined, active };
      }),
    }));
  }, [selectedEmployee, weekStart, assignments, shifts, weekDays]);

  const emp = employees.find((e) => e.id === selectedEmployee) ||
    allEmployees.find((e) => e.id === selectedEmployee);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-200">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lịch làm việc</h1>
            <p className="text-sm text-gray-500">
              {emp
                ? `${emp.name} · ${emp.department}`
                : "Xem lịch làm việc cá nhân"}
            </p>
          </div>
        </div>
        {/* Employee search/selector — only for admin + managers */}
        {canViewOthers && (
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={empSearch}
                onChange={(e) => {
                  setEmpSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Tìm nhân viên (tên, mã NV)..."
                className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm w-72"
              />
              {empSearch && (
                <button
                  onClick={() => { setEmpSearch(""); setShowDropdown(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 text-gray-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400">Không tìm thấy nhân viên</div>
                ) : (
                  searchResults.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelectedEmployee(e.id);
                        setEmpSearch("");
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 transition-colors flex items-center justify-between ${
                        e.id === selectedEmployee ? "bg-primary-50 text-primary-700 font-medium" : "text-gray-700"
                      }`}
                    >
                      <div>
                        <span className="font-medium">{e.name}</span>
                        <span className="text-gray-400 ml-2">{e.employeeCode}</span>
                      </div>
                      <span className="text-xs text-gray-400">{e.department}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Week navigation */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-600 hover:text-gray-900"
          >
            <ChevronLeft className="w-4 h-4" />
            Tuần trước
          </button>
          <div className="text-center">
            <span className="text-sm font-bold text-gray-800">
              Tuần {weekNumber}
            </span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="text-sm text-gray-600">
              {format(weekStart, "dd/MM/yyyy", { locale: vi })} —{" "}
              {format(addDays(weekStart, 6), "dd/MM/yyyy", { locale: vi })}
            </span>
          </div>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-sm text-gray-600 hover:text-gray-900"
          >
            Tuần sau
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* LHU-style Timetable */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                <th className="w-28 px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/80 border-b border-gray-100">
                  Buổi
                </th>
                {weekDays.map((day, i) => {
                  const isToday = format(day, "yyyy-MM-dd") === todayStr;
                  return (
                    <th
                      key={i}
                      className={`px-2 py-3 text-center border-b border-l border-gray-100 transition-colors ${
                        isToday ? "bg-primary-50/70" : "bg-gray-50/50"
                      }`}
                    >
                      <div
                        className={`text-xs font-medium ${isToday ? "text-primary-600" : "text-gray-400"}`}
                      >
                        {DAY_LABELS[i]}
                      </div>
                      <div
                        className={`text-lg font-bold leading-tight ${
                          isToday ? "text-primary-700" : "text-gray-800"
                        }`}
                      >
                        {format(day, "dd")}
                      </div>
                      <div
                        className={`text-[10px] ${isToday ? "text-primary-500" : "text-gray-400"}`}
                      >
                        {format(day, "MM/yyyy")}
                      </div>
                      {isToday && (
                        <div className="mt-1 mx-auto w-1.5 h-1.5 rounded-full bg-primary-500" />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {timetable.map(({ period, days }) => (
                <tr key={period.id} className="group">
                  {/* Period label cell */}
                  <td className="px-3 py-4 border-b border-gray-100 align-top">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`text-sm font-bold ${period.textColor}`}>
                        {period.label}
                      </span>
                      <span className="text-[10px] text-gray-400 leading-tight">
                        {period.timeRange}
                      </span>
                    </div>
                  </td>

                  {/* Day cells */}
                  {days.map(({ day, shift }, i) => {
                    const isToday = format(day, "yyyy-MM-dd") === todayStr;
                    return (
                      <td
                        key={i}
                        className={`px-2 py-2 border-b border-l border-gray-100 align-top transition-colors min-h-[80px] ${
                          isToday ? "bg-primary-50/30" : "hover:bg-gray-50/50"
                        }`}
                      >
                        {shift ? (
                          <div
                            className={`rounded-xl p-2.5 h-full transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-default ${period.lightBg} ${period.borderColor} border`}
                          >
                            <div className="flex items-start justify-between mb-1.5">
                              <span
                                className="inline-block w-2 h-2 rounded-full mt-1 flex-shrink-0"
                                style={{ backgroundColor: shift.color }}
                              />
                              <span
                                className={`text-[10px] font-medium ${period.textColor} opacity-70`}
                              >
                                {shift.isOvernight ? "🌙" : ""}
                              </span>
                            </div>
                            <p
                              className={`text-xs font-bold ${period.textColor} leading-tight mb-1`}
                            >
                              {shift.name}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] text-gray-500">
                              <Clock className="w-3 h-3 flex-shrink-0" />
                              <span>
                                {shift.startTime} - {shift.endTime}
                              </span>
                            </div>
                            {shift.breakStartTime && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                                <span>
                                  Nghỉ: {shift.breakStartTime} -{" "}
                                  {shift.breakEndTime}
                                </span>
                              </div>
                            )}
                            {emp && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1.5">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">
                                  {emp.department}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full min-h-[60px] flex items-center justify-center">
                            <span className="text-[10px] text-gray-300">—</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {shifts.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 text-xs text-gray-500"
          >
            <span
              className="w-3 h-3 rounded-full border border-white shadow-sm flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-medium text-gray-700">{s.name}</span>
            <span>
              ({s.startTime}–{s.endTime})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
