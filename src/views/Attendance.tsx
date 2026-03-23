import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Monitor,
  Navigation,
  Shield,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  checkIn,
  checkOut,
  getEmployeesPaginated,
  getShifts,
  getTodayAttendance,
  isWithinCompanyRange,
} from "../store/storage";
import type { AttendanceRecord, Employee, Shift } from "../types";
import { showToast } from "../components/Toast";

type Mode = "check-in" | "check-out";
type GPSState =
  | "idle"
  | "locating"
  | "in-range"
  | "out-of-range"
  | "error"
  | "denied";

// Detect if device is mobile
function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(
    ua,
  );
}

// Detect developer tools (DevTools) open via debugger timing
function detectDevTools(callback: () => void): () => void {
  let devToolsOpen = false;

  function check() {
    const start = performance.now();
    // debugger statement causes a pause when DevTools is open
    // Using Function constructor to avoid linters stripping debugger
    try {
      const fn = new Function("debugger");
      fn();
    } catch {
      // ignore
    }
    const duration = performance.now() - start;
    // If debugger took >100ms, DevTools is likely open
    if (duration > 100 && !devToolsOpen) {
      devToolsOpen = true;
      callback();
    }
  }

  const id = setInterval(check, 3000);
  return () => clearInterval(id);
}

export default function Attendance() {
  const { user, isAdmin, logout } = useAuth();

  const [mode, setMode] = useState<Mode>("check-in");
  const [gpsState, setGpsState] = useState<GPSState>("idle");
  const [gpsMessage, setGpsMessage] = useState("");
  const [currentCoords, setCurrentCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [locationName, setLocationName] = useState("");
  const [distance, setDistance] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [selectedShift, setSelectedShift] = useState("");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [resultType, setResultType] = useState<
    "success" | "error" | "warning" | "info"
  >("info");
  const [processing, setProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(true); // assume mobile until checked

  // Check if device is mobile (client-side only)
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // Detect developer mode — if DevTools open on mobile, force logout
  const handleDevToolsDetected = useCallback(() => {
    showToast(
      'error',
      'Cảnh báo',
      'Phát hiện chế độ nhà phát triển. Bạn sẽ bị đăng xuất.'
    );
    setTimeout(() => logout(), 2000);
  }, [logout]);

  useEffect(() => {
    if (!isMobile) return; // only check on mobile
    const cleanup = detectDevTools(handleDevToolsDetected);
    return cleanup;
  }, [isMobile, handleDevToolsDetected]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function init() {
      const s = await getShifts();
      const res = await getEmployeesPaginated({ limit: '50', isActive: 'true' });
      const e = res.data;
      setShifts(s);
      setEmployees(e);
      setTodayRecords(await getTodayAttendance());
      if (s.length > 0) setSelectedShift(s[0].id);

      if (!isAdmin && user?.employeeId) {
        setSelectedEmployee(user.employeeId);
      } else if (isAdmin && e.length > 0) {
        setSelectedEmployee(e[0].id);
      }
    }
    init();
  }, [user]);

  function checkGPS() {
    setGpsState("locating");
    setGpsMessage("Đang xác định vị trí...");
    setResultMessage("");

    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsMessage("Trình duyệt không hỗ trợ GPS");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCurrentCoords({ lat, lon });

        const result = await isWithinCompanyRange(lat, lon);
        if (result) {
          setGpsState("in-range");
          setLocationName(result.location.name);
          setDistance(result.distance);
          setGpsMessage(
            `Đã xác nhận vị trí: ${result.location.name} (${result.distance}m)`,
          );
        } else {
          setGpsState("out-of-range");
          setGpsMessage(
            "Bạn không ở trong phạm vi công ty. Không thể chấm công.",
          );
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setGpsState("denied");
          setGpsMessage("Bạn cần cấp quyền truy cập vị trí để chấm công.");
        } else {
          setGpsState("error");
          setGpsMessage("Không thể xác định vị trí. Vui lòng thử lại.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function handleCheckInOut() {
    if (gpsState !== "in-range") {
      setResultMessage("Vui lòng xác nhận vị trí GPS trước khi chấm công.");
      setResultType("warning");
      return;
    }
    if (!selectedEmployee || !selectedShift) return;

    setProcessing(true);
    const employee = employees.find((e) => e.id === selectedEmployee);
    if (!employee) {
      setProcessing(false);
      return;
    }

    try {
      if (mode === "check-in") {
        const record = await checkIn({
          employeeId: employee.id,
          shiftId: selectedShift,
          latitude: currentCoords?.lat,
          longitude: currentCoords?.lon,
        });
        const isLate = record.status === "late";
        setResultMessage(
          `${employee.name} — Vào ca thành công! ${isLate ? `Muon ${record.lateMinutes} phut` : "Dung gio"} · ${locationName}`,
        );
        setResultType(isLate ? "warning" : "success");
      } else {
        const record = await checkOut({
          employeeId: employee.id,
          shiftId: selectedShift,
        });
        const isEarly = record.status === "early-leave";
        setResultMessage(
          `${employee.name} — Ra ca thành công! ${isEarly ? `Ve som ${record.earlyLeaveMinutes}p` : "Dung gio"} · ${record.workingHours}h · ${locationName}`,
        );
        setResultType(isEarly ? "warning" : "success");
      }
      setTodayRecords(await getTodayAttendance());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Loi cham cong";
      setResultMessage(msg);
      setResultType("error");
    } finally {
      setProcessing(false);
    }
  }

  const gpsIcon = () => {
    switch (gpsState) {
      case "locating":
        return <Loader2 className="w-5 h-5 animate-spin text-primary-600" />;
      case "in-range":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "out-of-range":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "denied":
        return <Shield className="w-5 h-5 text-yellow-600" />;
      case "error":
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <MapPin className="w-5 h-5 text-gray-400" />;
    }
  };

  const gpsStatusStyle = () => {
    switch (gpsState) {
      case "in-range":
        return "bg-green-50 border-green-200 text-green-800";
      case "out-of-range":
        return "bg-red-50 border-red-200 text-red-800";
      case "denied":
      case "error":
        return "bg-yellow-50 border-yellow-200 text-yellow-800";
      case "locating":
        return "bg-blue-50 border-blue-200 text-blue-800";
      default:
        return "bg-gray-50 border-gray-200 text-gray-600";
    }
  };

  // If not mobile, show blocked UI
  if (!isMobile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 max-w-md">
          <Monitor className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-700 mb-2">
            Không thể chấm công
          </h2>
          <p className="text-red-600 mb-4">
            Hệ thống chỉ cho phép chấm công từ{" "}
            <strong>điện thoại di động</strong>. Vui lòng sử dụng điện thoại để
            thực hiện chấm công.
          </p>
          <div className="text-xs text-red-400 bg-red-100 rounded-lg p-3">
            Phát hiện thiết bị: Máy tính / Laptop
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
            Chấm công
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {format(currentTime, "EEEE, dd/MM/yyyy", { locale: vi })} —{" "}
            <span className="text-primary-600 font-semibold tabular-nums">
              {format(currentTime, "HH:mm:ss")}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Mode & Shift selector */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              {/* Mode toggle */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setMode("check-in")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    mode === "check-in"
                      ? "bg-white text-green-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  Vào ca
                </button>
                <button
                  onClick={() => setMode("check-out")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    mode === "check-out"
                      ? "bg-white text-orange-700 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                  Ra ca
                </button>
              </div>

              {/* Shift select */}
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>

              {/* Employee select (admin only can choose) */}
              {isAdmin && (
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employeeCode})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* GPS Status Card */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 transition-all ${gpsStatusStyle()}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {gpsIcon()}
                <div>
                  <p className="text-sm font-semibold">
                    {gpsState === "idle" && "Chưa xác nhận vị trí"}
                    {gpsState === "locating" && "Đang xác định vị trí GPS..."}
                    {gpsState === "in-range" && `Đã xác nhận: ${locationName}`}
                    {gpsState === "out-of-range" && "Ngoài phạm vi công ty"}
                    {gpsState === "denied" && "Chưa cấp quyền GPS"}
                    {gpsState === "error" && "Lỗi GPS"}
                  </p>
                  <p className="text-xs opacity-75 mt-0.5">
                    {gpsState === "idle" &&
                      "Nhấn nút để xác nhận vị trí trước khi chấm công"}
                    {gpsState === "in-range" && `Khoảng cách: ${distance}m`}
                    {gpsState === "out-of-range" &&
                      "Bạn cần ở trong phạm vi công ty để chấm công"}
                    {gpsState === "locating" && "Vui lòng đợi..."}
                    {gpsState === "denied" &&
                      "Cho phép trình duyệt truy cập vị trí"}
                    {gpsState === "error" && "Kiểm tra kết nối GPS và thử lại"}
                  </p>
                </div>
              </div>
              <button
                onClick={checkGPS}
                disabled={gpsState === "locating"}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Navigation className="w-4 h-4" />
                {gpsState === "idle" ? "Xác nhận vị trí" : "Kiểm tra lại"}
              </button>
            </div>
            {currentCoords && (
              <div className="mt-2 text-[11px] opacity-60 font-mono">
                {Number(currentCoords.lat).toFixed(6)}, {Number(currentCoords.lon).toFixed(6)}
              </div>
            )}
          </div>

          {/* Check-in/out Button */}
          <button
            onClick={handleCheckInOut}
            disabled={gpsState !== "in-range" || processing}
            className={`w-full py-4 sm:py-4 rounded-2xl text-white font-bold text-base sm:text-lg transition-all shadow-lg disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-3 active:scale-[0.98] ${
              mode === "check-in"
                ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            }`}
          >
            {processing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : mode === "check-in" ? (
              <LogIn className="w-5 h-5" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
            {processing
              ? "Đang xử lý..."
              : mode === "check-in"
                ? "CHẤM CÔNG VÀO"
                : "CHẤM CÔNG RA"}
          </button>

          {/* Result message */}
          {resultMessage && (
            <div
              className={`rounded-xl p-4 text-sm font-medium flex items-center gap-2 ${
                resultType === "success"
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : resultType === "error"
                    ? "bg-red-50 border border-red-200 text-red-700"
                    : resultType === "warning"
                      ? "bg-yellow-50 border border-yellow-200 text-yellow-700"
                      : "bg-blue-50 border border-blue-200 text-blue-700"
              }`}
            >
              {resultType === "success" && (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              )}
              {resultType === "error" && (
                <XCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {resultType === "warning" && (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              {resultMessage}
            </div>
          )}
        </div>

        {/* Sidebar — today's records */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Chấm công hôm nay ({todayRecords.length})
          </h3>
          {todayRecords.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Chưa có dữ liệu</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto">
              {todayRecords
                .sort((a, b) =>
                  (b.checkInTime || "").localeCompare(a.checkInTime || ""),
                )
                .map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary-700">
                        {record.employeeName.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {record.employeeName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="flex items-center gap-0.5">
                          <LogIn className="w-3 h-3" />
                          {record.checkInTime
                            ? format(new Date(record.checkInTime), "HH:mm")
                            : "--:--"}
                        </span>
                        <span className="text-gray-300">→</span>
                        <span className="flex items-center gap-0.5">
                          <LogOut className="w-3 h-3" />
                          {record.checkOutTime
                            ? format(new Date(record.checkOutTime), "HH:mm")
                            : "--:--"}
                        </span>
                        {record.lateMinutes > 0 && (
                          <span className="text-yellow-600 font-medium">
                            +{record.lateMinutes}p
                          </span>
                        )}
                        {record.workingHours > 0 && (
                          <span className="text-blue-600">
                            {record.workingHours}h
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        record.status === "on-time"
                          ? "bg-green-100 text-green-700"
                          : record.status === "late"
                            ? "bg-yellow-100 text-yellow-700"
                            : record.status === "early-leave"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {record.status === "on-time"
                        ? "Đúng giờ"
                        : record.status === "late"
                          ? "Muộn"
                          : record.status === "early-leave"
                            ? "Về sớm"
                            : "Chờ"}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
