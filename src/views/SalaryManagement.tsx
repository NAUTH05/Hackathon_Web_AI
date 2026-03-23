import {
  Calculator,
  DollarSign,
  Edit2,
  FileSpreadsheet,
  Filter,
  Lock,
  Plus,
  Save,
  Search,
  Settings,
  Trash2,
  Unlock,
  UserCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Pagination from "../components/Pagination";
import { showToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../services/api";
import type { SalaryCoefficient, SalaryPermission } from "../store/storage";
import {
  addSalaryPreset,
  assignSalaryPreset,
  calculateSalary,
  deleteSalaryPreset,
  getEmployeesPaginated,
  getSalaryAssignments,
  getSalaryCoefficients,
  getSalaryPermissions,
  getSalaryPresets,
  getSalaryRecordsPaginated,
  lockSalaryMonth,
  revokeSalaryPermission,
  searchUsersForRole,
  setSalaryPermission,
  unlockSalaryMonth,
  updateSalaryPreset,
} from "../store/storage";
import type {
  Employee,
  EmployeeSalaryAssignment,
  SalaryPreset,
  SalaryRecord,
} from "../types";
import ExportTemplateBuilder from "./ExportTemplateBuilder";

type Tab =
  | "salary"
  | "presets"
  | "assign"
  | "coefficients"
  | "benefits"
  | "permissions"
  | "export";

export default function SalaryManagement() {
  const { user, isAdmin, isSalaryManager } = useAuth();

  const [tab, setTab] = useState<Tab>("salary");
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [presets, setPresets] = useState<SalaryPreset[]>([]);
  const [assignments, setAssignments] = useState<EmployeeSalaryAssignment[]>(
    [],
  );
  const [employees, setEmployees] = useState<Employee[]>([]);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );

  // Salary pagination
  const [salaryPage, setSalaryPage] = useState(1);
  const [salaryTotalPages, setSalaryTotalPages] = useState(1);
  const [salaryTotal, setSalaryTotal] = useState(0);
  const [salaryTotalNet, setSalaryTotalNet] = useState(0);
  const [salaryTotalGross, setSalaryTotalGross] = useState(0);

  // Salary filters
  const [salarySearch, setSalarySearch] = useState("");
  const [salaryDeptFilter, setSalaryDeptFilter] = useState("");
  const [salaryPresetFilter, setSalaryPresetFilter] = useState("");
  const [salarySortBy, setSalarySortBy] = useState("employee_name");
  const [salarySortDir, setSalarySortDir] = useState<"asc" | "desc">("asc");
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Assign tab pagination
  const [assignPage, setAssignPage] = useState(1);
  const [assignTotalPages, setAssignTotalPages] = useState(1);
  const [assignTotal, setAssignTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [salaryLocked, setSalaryLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [coefficients, setCoefficients] = useState<SalaryCoefficient[]>([]);

  // Benefits (Phụ cấp/BHXH/Khấu trừ) state
  type BenefitItem = {
    id: string;
    name: string;
    category: string;
    amount: number;
    type: "add" | "deduct";
    note: string;
  };
  const [benefits, setBenefits] = useState<BenefitItem[]>([
    {
      id: "1",
      name: "Phụ cấp ăn trưa",
      category: "allowance",
      amount: 730000,
      type: "add",
      note: "Theo tháng",
    },
    {
      id: "2",
      name: "Phụ cấp xăng xe",
      category: "allowance",
      amount: 500000,
      type: "add",
      note: "Theo tháng",
    },
    {
      id: "3",
      name: "Phụ cấp điện thoại",
      category: "allowance",
      amount: 200000,
      type: "add",
      note: "",
    },
    {
      id: "4",
      name: "BHXH (8%)",
      category: "insurance",
      amount: 8,
      type: "deduct",
      note: "% lương CB",
    },
    {
      id: "5",
      name: "BHYT (1.5%)",
      category: "insurance",
      amount: 1.5,
      type: "deduct",
      note: "% lương CB",
    },
    {
      id: "6",
      name: "BHTN (1%)",
      category: "insurance",
      amount: 1,
      type: "deduct",
      note: "% lương CB",
    },
  ]);
  const [showBenefitForm, setShowBenefitForm] = useState(false);
  const [benefitForm, setBenefitForm] = useState({
    name: "",
    category: "allowance",
    amount: 0,
    type: "add" as "add" | "deduct",
    note: "",
  });

  // Permissions state
  const [permissions, setPermissions] = useState<SalaryPermission[]>([]);
  const [permUserId, setPermUserId] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<
    {
      id: string;
      name: string;
      username: string;
      role: string;
      department: string;
    }[]
  >([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [selectedUserName, setSelectedUserName] = useState("");

  // Preset form
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    description: "",
    baseSalary: 0,
    allowances: 0,
    isDefault: false,
    salaryBasis: "hourly" as "hourly" | "daily" | "fixed",
    otMultiplier: 1.5,
    latePenaltyPerDay: 50000,
    includeOT: true,
    includeAllowances: true,
    includeDeductions: true,
    includeLatePenalty: true,
  });

  useEffect(() => {
    reloadPresets();
  }, []);

  async function reloadPresets() {
    setPresets(await getSalaryPresets());
    setAssignments(await getSalaryAssignments());
  }

  const loadSalaryRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        month: selectedMonth,
        page: String(salaryPage),
        limit: "30",
        sortBy: salarySortBy,
        sortDir: salarySortDir,
      };
      if (salarySearch) params.search = salarySearch;
      if (salaryDeptFilter) params.department = salaryDeptFilter;
      if (salaryPresetFilter) params.preset = salaryPresetFilter;
      const res = await getSalaryRecordsPaginated(params);
      setRecords(res.data);
      setSalaryTotalPages(res.pagination.totalPages);
      setSalaryTotal(res.pagination.total);
      setSalaryTotalNet(
        res.summary?.totalNet ?? res.data.reduce((s, r) => s + r.netSalary, 0),
      );
      setSalaryTotalGross(
        res.summary?.totalGross ??
          res.data.reduce((s, r) => s + r.grossSalary, 0),
      );
      if (res.departments) setAvailableDepts(res.departments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [
    selectedMonth,
    salaryPage,
    salarySearch,
    salaryDeptFilter,
    salaryPresetFilter,
    salarySortBy,
    salarySortDir,
  ]);

  const loadAssignEmployees = useCallback(async () => {
    try {
      const res = await getEmployeesPaginated({
        page: String(assignPage),
        limit: "30",
        isActive: "true",
      });
      setEmployees(res.data);
      setAssignTotalPages(res.pagination.totalPages);
      setAssignTotal(res.pagination.total);
    } catch (err) {
      console.error(err);
    }
  }, [assignPage]);

  useEffect(() => {
    if (tab === "salary") loadSalaryRecords();
    if (tab === "coefficients") loadCoefficients();
    if (tab === "permissions") loadPermissions();
  }, [tab, loadSalaryRecords]);

  useEffect(() => {
    if (tab === "assign") loadAssignEmployees();
  }, [tab, loadAssignEmployees]);

  // ============ Salary Tab ============
  async function handleCalculate() {
    setCalculating(true);
    try {
      await calculateSalary(selectedMonth);
      setSalaryPage(1);
      await loadSalaryRecords();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      showToast("error", "Lỗi tính lương", msg);
      console.error("Calculate salary error:", err);
    } finally {
      setCalculating(false);
    }
  }

  async function handleLockToggle() {
    setLocking(true);
    try {
      if (salaryLocked) {
        await unlockSalaryMonth(selectedMonth);
        setSalaryLocked(false);
      } else {
        await lockSalaryMonth(selectedMonth);
        setSalaryLocked(true);
      }
      await loadSalaryRecords();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      showToast("error", "Lỗi", msg);
    } finally {
      setLocking(false);
    }
  }

  async function loadCoefficients() {
    try {
      setCoefficients(await getSalaryCoefficients());
    } catch (err) {
      console.error("Load coefficients error:", err);
    }
  }

  async function loadPermissions() {
    try {
      setPermissions(await getSalaryPermissions());
    } catch (err) {
      console.error("Load permissions error:", err);
    }
  }

  async function handleAddPermission() {
    if (!permUserId.trim()) return;
    try {
      await setSalaryPermission({ userId: permUserId });
      setPermUserId("");
      setUserSearchQuery("");
      setSelectedUserName("");
      setUserSearchResults([]);
      await loadPermissions();
      showToast("success", "Đã gán quyền", "Quyền Quản lý lương đã được cấp.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi", msg);
    }
  }

  async function handleRevokePermission(userId: string) {
    try {
      await revokeSalaryPermission(userId);
      await loadPermissions();
      showToast("success", "Đã thu hồi", "Quyền Quản lý lương đã bị thu hồi.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi", msg);
    }
  }

  async function handleExportPayroll() {
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(
        buildApiUrl(`/export-payroll?month=${selectedMonth}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bang-luong-${selectedMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi xuất file";
      showToast("error", "Lỗi xuất Excel", msg);
    }
  }

  function handleSalarySearch(val: string) {
    setSalarySearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSalaryPage(1), 400);
  }

  function toggleSort(col: string) {
    if (salarySortBy === col) {
      setSalarySortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSalarySortBy(col);
      setSalarySortDir("asc");
    }
    setSalaryPage(1);
  }

  function sortIcon(col: string) {
    if (salarySortBy !== col) return "↕";
    return salarySortDir === "asc" ? "↑" : "↓";
  }

  const displayRecords = records;
  const totalNet = salaryTotalNet;

  // ============ Preset Form ============
  function openAddPreset() {
    setPresetForm({
      name: "",
      description: "",
      baseSalary: 0,
      allowances: 0,
      isDefault: false,
      salaryBasis: "hourly",
      otMultiplier: 1.5,
      latePenaltyPerDay: 50000,
      includeOT: true,
      includeAllowances: true,
      includeDeductions: true,
      includeLatePenalty: true,
    });
    setEditingPresetId(null);
    setShowPresetForm(true);
  }

  function openEditPreset(p: SalaryPreset) {
    const cfg = parsePresetConfig(p.customFormula);
    setPresetForm({
      name: p.name,
      description: p.description,
      baseSalary: p.baseSalary,
      allowances: p.allowances,
      isDefault: p.isDefault,
      salaryBasis: cfg.salaryBasis,
      otMultiplier: cfg.otMultiplier,
      latePenaltyPerDay: cfg.latePenaltyPerDay,
      includeOT: cfg.includeOT,
      includeAllowances: cfg.includeAllowances,
      includeDeductions: cfg.includeDeductions,
      includeLatePenalty: cfg.includeLatePenalty,
    });
    setEditingPresetId(p.id);
    setShowPresetForm(true);
  }

  async function savePreset() {
    if (!presetForm.name || presetForm.baseSalary <= 0) return;
    const config = JSON.stringify({
      salaryBasis: presetForm.salaryBasis,
      otMultiplier: presetForm.otMultiplier,
      latePenaltyPerDay: presetForm.latePenaltyPerDay,
      includeOT: presetForm.includeOT,
      includeAllowances: presetForm.includeAllowances,
      includeDeductions: presetForm.includeDeductions,
      includeLatePenalty: presetForm.includeLatePenalty,
    });
    const payload = {
      name: presetForm.name,
      description: presetForm.description,
      baseSalary: presetForm.baseSalary,
      formulaType: "custom",
      customFormula: config,
      allowances: presetForm.allowances,
      isDefault: presetForm.isDefault,
    };
    if (editingPresetId) {
      await updateSalaryPreset(editingPresetId, payload);
    } else {
      await addSalaryPreset(payload);
    }
    setShowPresetForm(false);
    await reloadPresets();
  }

  async function handleDeletePreset(id: string) {
    if (assignments.some((a) => a.presetId === id)) {
      showToast(
        "warning",
        "Không thể xóa",
        "Preset đang được gán cho nhân viên!",
      );
      return;
    }
    await deleteSalaryPreset(id);
    await reloadPresets();
  }

  // ============ Assignment ============
  async function handleAssign(employeeId: string, presetId: string) {
    await assignSalaryPreset(employeeId, presetId);
    await reloadPresets();
  }

  function fmt(n: number) {
    return n.toLocaleString("vi-VN") + "đ";
  }

  function parsePresetConfig(customFormula?: string) {
    try {
      const c = JSON.parse(customFormula || "{}");
      return {
        salaryBasis: (c.salaryBasis || "hourly") as
          | "hourly"
          | "daily"
          | "fixed",
        otMultiplier: c.otMultiplier ?? 1.5,
        latePenaltyPerDay: c.latePenaltyPerDay ?? 50000,
        includeOT: c.includeOT !== false,
        includeAllowances: c.includeAllowances !== false,
        includeDeductions: c.includeDeductions !== false,
        includeLatePenalty: c.includeLatePenalty !== false,
      };
    } catch {
      return {
        salaryBasis: "hourly" as const,
        otMultiplier: 1.5,
        latePenaltyPerDay: 50000,
        includeOT: true,
        includeAllowances: true,
        includeDeductions: true,
        includeLatePenalty: true,
      };
    }
  }

  function getFormulaPreview() {
    const lines: string[] = [];
    if (presetForm.salaryBasis === "hourly") {
      lines.push("Giờ làm thực tế × Lương/giờ");
    } else if (presetForm.salaryBasis === "daily") {
      lines.push("Số ngày công × Lương/ngày");
    } else {
      lines.push("Lương cố định hàng tháng");
    }
    if (presetForm.includeOT)
      lines.push(`+ Giờ OT × Lương/giờ × ${presetForm.otMultiplier}`);
    if (presetForm.includeAllowances)
      lines.push(
        "+ Phụ cấp" +
          (presetForm.allowances > 0 ? ` (${fmt(presetForm.allowances)})` : ""),
      );
    if (presetForm.includeLatePenalty)
      lines.push(
        `- Phạt trễ (${presetForm.latePenaltyPerDay.toLocaleString("vi-VN")}đ × số ngày trễ)`,
      );
    if (presetForm.includeDeductions) lines.push("- Khấu trừ vi phạm");
    return lines;
  }

  const tabs: {
    key: Tab;
    label: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
    requireElevated?: boolean; // admin OR salary_manager
  }[] = [
    {
      key: "salary",
      label: "Bảng lương",
      icon: <DollarSign className="w-4 h-4" />,
    },
    {
      key: "presets",
      label: "Tính Lương",
      icon: <Settings className="w-4 h-4" />,
      requireElevated: true,
    },
    {
      key: "assign",
      label: "Gán Lương",
      icon: <UserCheck className="w-4 h-4" />,
      requireElevated: true,
    },
    {
      key: "coefficients",
      label: "Hệ số",
      icon: <Settings className="w-4 h-4" />,
      requireElevated: true,
    },
    {
      key: "benefits",
      label: "Phụ cấp/BH",
      icon: <DollarSign className="w-4 h-4" />,
      requireElevated: true,
    },
    {
      key: "permissions",
      label: "Quyền",
      icon: <Lock className="w-4 h-4" />,
      adminOnly: true,
    },
    {
      key: "export",
      label: "Xuất Excel",
      icon: <FileSpreadsheet className="w-4 h-4" />,
      requireElevated: true,
    },
  ];

  const visibleTabs = tabs.filter((t) => {
    if (t.requireElevated) return isAdmin || isSalaryManager;
    if (t.adminOnly) return isAdmin;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            Quản lý lương
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? "Xem và tính lương cho toàn bộ nhân viên"
              : "Xem bảng lương cá nhân"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* =================== Salary Tab =================== */}
      {tab === "salary" && (
        <div className="space-y-4">
          {/* Controls Row 1: Month + Calculate */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Tháng
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setSalaryPage(1);
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
            </div>
            {isSalaryManager && (
              <button
                onClick={handleCalculate}
                disabled={calculating}
                className="mt-5 flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {calculating ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>{" "}
                    Đang tính lương...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" /> Tính lương
                  </>
                )}
              </button>
            )}
            {isSalaryManager && salaryTotal > 0 && (
              <button
                onClick={handleLockToggle}
                disabled={locking}
                className={`mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                  salaryLocked
                    ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                    : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                }`}
              >
                {salaryLocked ? (
                  <Unlock className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {locking
                  ? "..."
                  : salaryLocked
                    ? "Mở khóa tháng"
                    : "Khóa tháng"}
              </button>
            )}
            {(isAdmin || isSalaryManager) && displayRecords.length > 0 && (
              <button
                onClick={handleExportPayroll}
                className="mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all"
              >
                📊 Xuất Excel (Payroll)
              </button>
            )}
          </div>

          {/* Controls Row 2: Search + Filters */}
          {(isAdmin || isSalaryManager) && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm tên, mã NV, phòng ban..."
                  value={salarySearch}
                  onChange={(e) => handleSalarySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
                {salarySearch && (
                  <button
                    onClick={() => {
                      setSalarySearch("");
                      setSalaryPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={salaryDeptFilter}
                  onChange={(e) => {
                    setSalaryDeptFilter(e.target.value);
                    setSalaryPage(1);
                  }}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                >
                  <option value="">Tất cả phòng ban</option>
                  {availableDepts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={salaryPresetFilter}
                  onChange={(e) => {
                    setSalaryPresetFilter(e.target.value);
                    setSalaryPage(1);
                  }}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                >
                  <option value="">Tất cả preset</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {(salarySearch || salaryDeptFilter || salaryPresetFilter) && (
                <button
                  onClick={() => {
                    setSalarySearch("");
                    setSalaryDeptFilter("");
                    setSalaryPresetFilter("");
                    setSalaryPage(1);
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          )}

          {/* Summary */}
          {salaryTotal > 0 && (isAdmin || isSalaryManager) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Tổng nhân viên</p>
                <p className="text-2xl font-bold text-gray-900">
                  {salaryTotal}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Tổng lương trước thuế</p>
                <p className="text-2xl font-bold text-gray-700">
                  {fmt(salaryTotalGross)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Tổng lương ròng</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {fmt(totalNet)}
                </p>
              </div>
            </div>
          )}

          {/* Salary Table */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400">Đang tải...</p>
            </div>
          ) : displayRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {salarySearch || salaryDeptFilter || salaryPresetFilter
                  ? "Không tìm thấy kết quả phù hợp."
                  : isAdmin || isSalaryManager
                    ? 'Chưa có dữ liệu lương. Nhấn "Tính lương" để tạo bảng lương.'
                    : "Chưa có dữ liệu lương cho tháng này."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <Pagination
                page={salaryPage}
                totalPages={salaryTotalPages}
                total={salaryTotal}
                onPageChange={setSalaryPage}
                label="bản ghi lương"
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th
                        className="text-left px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                        onClick={() => toggleSort("employee_name")}
                      >
                        Nhân viên {sortIcon("employee_name")}
                      </th>
                      <th
                        className="text-left px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                        onClick={() => toggleSort("department")}
                      >
                        Phòng ban {sortIcon("department")}
                      </th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Preset
                      </th>
                      <th
                        className="text-right px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                        onClick={() => toggleSort("base_salary")}
                      >
                        Lương CB {sortIcon("base_salary")}
                      </th>
                      <th
                        className="text-center px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                        onClick={() => toggleSort("present_days")}
                      >
                        Ngày công {sortIcon("present_days")}
                      </th>
                      <th
                        className="text-right px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                        onClick={() => toggleSort("ot_hours")}
                      >
                        OT {sortIcon("ot_hours")}
                      </th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Phụ cấp
                      </th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Khấu trừ
                      </th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                        Phạt trễ
                      </th>
                      <th
                        className="text-right px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                        onClick={() => toggleSort("gross_salary")}
                      >
                        Lương trước thuế {sortIcon("gross_salary")}
                      </th>
                      <th
                        className="text-right px-3 py-3 font-semibold text-emerald-700 cursor-pointer hover:text-emerald-900 select-none whitespace-nowrap"
                        onClick={() => toggleSort("net_salary")}
                      >
                        Lương ròng {sortIcon("net_salary")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRecords.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-3 py-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {r.employeeName}
                            </p>
                            {r.employeeCode && (
                              <p className="text-[11px] text-gray-400">
                                {r.employeeCode}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs">
                          <div>
                            <p>{r.department || "—"}</p>
                            {r.position && (
                              <p className="text-[11px] text-gray-400">
                                {r.position}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                            {r.presetName}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {fmt(r.baseSalary)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`font-medium ${r.presentDays > 0 ? "text-gray-700" : "text-red-400"}`}
                          >
                            {r.presentDays}
                          </span>
                          <span className="text-gray-400">
                            /{r.totalWorkDays}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div>
                            <span className="text-gray-700">{r.otHours}h</span>
                            {r.otPay > 0 && (
                              <p className="text-[11px] text-blue-500">
                                {fmt(r.otPay)}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right text-blue-600">
                          {r.allowances > 0 ? (
                            `+${fmt(r.allowances)}`
                          ) : (
                            <span className="text-gray-300">0đ</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-red-500">
                          {r.deductions > 0 ? (
                            `-${fmt(r.deductions)}`
                          ) : (
                            <span className="text-gray-300">0đ</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-orange-500">
                          {r.latePenalty > 0 ? (
                            `-${fmt(r.latePenalty)}`
                          ) : (
                            <span className="text-gray-300">0đ</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-gray-800">
                          {fmt(r.grossSalary)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-600">
                          {fmt(r.netSalary)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {(isAdmin || isSalaryManager) &&
                    displayRecords.length > 1 && (
                      <tfoot>
                        <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                          <td
                            colSpan={9}
                            className="px-3 py-3 font-semibold text-emerald-800"
                          >
                            Tổng cộng ({salaryTotal} NV)
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-gray-800">
                            {fmt(salaryTotalGross)}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-700">
                            {fmt(totalNet)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                </table>
              </div>
              <Pagination
                page={salaryPage}
                totalPages={salaryTotalPages}
                total={salaryTotal}
                onPageChange={setSalaryPage}
                label="bản ghi lương"
              />
            </div>
          )}
        </div>
      )}

      {/* =================== Presets Tab =================== */}
      {tab === "presets" && (isAdmin || isSalaryManager) && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={openAddPreset}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              Thêm preset
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {presets.map((p) => {
              const assignedCount = assignments.filter(
                (a) => a.presetId === p.id,
              ).length;
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl border p-5 transition-shadow hover:shadow-md ${
                    p.isDefault
                      ? "border-emerald-300 ring-1 ring-emerald-100"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {p.name}
                        </h3>
                        {p.isDefault && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-medium">
                            Mặc định
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.description}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditPreset(p)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletePreset(p.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Lương cơ bản:</span>
                      <p className="font-semibold text-gray-900">
                        {fmt(p.baseSalary)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Phụ cấp:</span>
                      <p className="font-semibold text-blue-600">
                        {fmt(p.allowances)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Đang dùng:</span>
                      <p className="font-semibold text-gray-900">
                        {assignedCount} NV
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const cfg = parsePresetConfig(p.customFormula);
                    const basisLabel =
                      cfg.salaryBasis === "hourly"
                        ? "⏱ Theo giờ"
                        : cfg.salaryBasis === "daily"
                          ? "📅 Theo ngày"
                          : "💰 Cố định";
                    return (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                          {basisLabel}
                        </span>
                        {cfg.includeOT && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                            OT ×{cfg.otMultiplier}
                          </span>
                        )}
                        {cfg.includeAllowances && p.allowances > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                            Phụ cấp
                          </span>
                        )}
                        {cfg.includeLatePenalty && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                            Phạt trễ {cfg.latePenaltyPerDay / 1000}K/ngày
                          </span>
                        )}
                        {cfg.includeDeductions && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                            Trừ vi phạm
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Preset Form Modal */}
          {showPresetForm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-gray-900">
                    {editingPresetId ? "Sửa preset" : "Thêm preset lương"}
                  </h2>
                  <button
                    onClick={() => setShowPresetForm(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Tên preset *
                    </label>
                    <input
                      value={presetForm.name}
                      onChange={(e) =>
                        setPresetForm({ ...presetForm, name: e.target.value })
                      }
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                      placeholder="VD: Nhân viên cấp cao"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Mô tả
                    </label>
                    <input
                      value={presetForm.description}
                      onChange={(e) =>
                        setPresetForm({
                          ...presetForm,
                          description: e.target.value,
                        })
                      }
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Lương cơ bản (VNĐ) *
                      </label>
                      <input
                        type="number"
                        value={presetForm.baseSalary || ""}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            baseSalary: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Phụ cấp (VNĐ)
                      </label>
                      <input
                        type="number"
                        value={presetForm.allowances || ""}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            allowances: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* === CÁCH TÍNH LƯƠNG === */}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-600" />
                      Cách tính lương
                    </h3>
                    <div className="space-y-2">
                      {[
                        {
                          value: "hourly" as const,
                          label: "Theo giờ làm thực tế",
                          desc: "Lương = Số giờ làm × (Lương CB ÷ tổng giờ chuẩn tháng)",
                          rec: true,
                        },
                        {
                          value: "daily" as const,
                          label: "Theo ngày công",
                          desc: "Lương = Số ngày đi làm × (Lương CB ÷ số ngày chuẩn tháng)",
                          rec: false,
                        },
                        {
                          value: "fixed" as const,
                          label: "Lương cố định hàng tháng",
                          desc: "Nhận đủ lương cơ bản mỗi tháng, không phụ thuộc ngày công",
                          rec: false,
                        },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            presetForm.salaryBasis === opt.value
                              ? "border-emerald-400 bg-emerald-50 shadow-sm"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="salaryBasis"
                            value={opt.value}
                            checked={presetForm.salaryBasis === opt.value}
                            onChange={(e) =>
                              setPresetForm({
                                ...presetForm,
                                salaryBasis: e.target.value as
                                  | "hourly"
                                  | "daily"
                                  | "fixed",
                              })
                            }
                            className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              {opt.label}
                            </span>
                            {opt.rec && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                                Khuyến nghị
                              </span>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5">
                              {opt.desc}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* === CÁC KHOẢN CỘNG THÊM === */}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">
                      <span className="text-blue-600">＋</span> Các khoản cộng
                      thêm
                    </h3>
                    <div className="space-y-3">
                      <div
                        className={`p-3 rounded-xl border transition-all ${presetForm.includeOT ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"}`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={presetForm.includeOT}
                            onChange={(e) =>
                              setPresetForm({
                                ...presetForm,
                                includeOT: e.target.checked,
                              })
                            }
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              Tính lương tăng ca (OT)
                            </span>
                            <p className="text-xs text-gray-500">
                              Cộng thêm tiền khi làm ngoài giờ
                            </p>
                          </div>
                        </label>
                        {presetForm.includeOT && (
                          <div className="mt-3 ml-8">
                            <label className="text-xs font-medium text-gray-600">
                              Hệ số tăng ca (× lương/giờ)
                            </label>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {[1, 1.5, 2, 3].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    setPresetForm({
                                      ...presetForm,
                                      otMultiplier: v,
                                    })
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                    presetForm.otMultiplier === v
                                      ? "bg-blue-600 text-white shadow-sm"
                                      : "bg-white border border-gray-200 text-gray-700 hover:border-blue-300"
                                  }`}
                                >
                                  ×{v}
                                </button>
                              ))}
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={presetForm.otMultiplier}
                                onChange={(e) =>
                                  setPresetForm({
                                    ...presetForm,
                                    otMultiplier: Number(e.target.value) || 1.5,
                                  })
                                }
                                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div
                        className={`p-3 rounded-xl border transition-all ${presetForm.includeAllowances ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-gray-50"}`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={presetForm.includeAllowances}
                            onChange={(e) =>
                              setPresetForm({
                                ...presetForm,
                                includeAllowances: e.target.checked,
                              })
                            }
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              Cộng phụ cấp hàng tháng
                            </span>
                            <p className="text-xs text-gray-500">
                              Cộng thêm{" "}
                              {presetForm.allowances > 0
                                ? fmt(presetForm.allowances)
                                : "(chưa nhập số tiền ở trên)"}{" "}
                              mỗi tháng
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* === CÁC KHOẢN TRỪ === */}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">
                      <span className="text-red-500">－</span> Các khoản trừ
                    </h3>
                    <div className="space-y-3">
                      <div
                        className={`p-3 rounded-xl border transition-all ${presetForm.includeLatePenalty ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={presetForm.includeLatePenalty}
                            onChange={(e) =>
                              setPresetForm({
                                ...presetForm,
                                includeLatePenalty: e.target.checked,
                              })
                            }
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              Trừ phạt đi trễ
                            </span>
                            <p className="text-xs text-gray-500">
                              Mỗi ngày đi trễ bị trừ tiền
                            </p>
                          </div>
                        </label>
                        {presetForm.includeLatePenalty && (
                          <div className="mt-3 ml-8">
                            <label className="text-xs font-medium text-gray-600">
                              Số tiền phạt mỗi ngày trễ
                            </label>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {[20000, 50000, 100000, 200000].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() =>
                                    setPresetForm({
                                      ...presetForm,
                                      latePenaltyPerDay: v,
                                    })
                                  }
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    presetForm.latePenaltyPerDay === v
                                      ? "bg-red-600 text-white shadow-sm"
                                      : "bg-white border border-gray-200 text-gray-700 hover:border-red-300"
                                  }`}
                                >
                                  {v.toLocaleString("vi-VN")}đ
                                </button>
                              ))}
                              <input
                                type="number"
                                value={presetForm.latePenaltyPerDay}
                                onChange={(e) =>
                                  setPresetForm({
                                    ...presetForm,
                                    latePenaltyPerDay:
                                      Number(e.target.value) || 0,
                                  })
                                }
                                className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div
                        className={`p-3 rounded-xl border transition-all ${presetForm.includeDeductions ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={presetForm.includeDeductions}
                            onChange={(e) =>
                              setPresetForm({
                                ...presetForm,
                                includeDeductions: e.target.checked,
                              })
                            }
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              Trừ khấu trừ / vi phạm
                            </span>
                            <p className="text-xs text-gray-500">
                              Trừ các khoản phạt vi phạm nội quy từ mục Quản lý
                              phạt
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* === XEM TRƯỚC CÔNG THỨC === */}
                  <div className="border-t pt-4">
                    <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-purple-600" />
                      Xem trước công thức
                    </h3>
                    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
                      <p className="text-sm font-bold text-purple-800 mb-2">
                        Lương ròng =
                      </p>
                      <div className="space-y-1 text-sm ml-4">
                        {getFormulaPreview().map((line, i) => (
                          <p
                            key={i}
                            className={`font-medium ${
                              line.startsWith("+")
                                ? "text-blue-700"
                                : line.startsWith("-")
                                  ? "text-red-600"
                                  : "text-gray-800"
                            }`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={presetForm.isDefault}
                      onChange={(e) =>
                        setPresetForm({
                          ...presetForm,
                          isDefault: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-700">
                      Đặt làm preset mặc định
                    </span>
                  </label>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setShowPresetForm(false)}
                      className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={savePreset}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all"
                    >
                      <Save className="w-4 h-4" />
                      {editingPresetId ? "Cập nhật" : "Tạo preset"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================== Assignment Tab =================== */}
      {tab === "assign" && (isAdmin || isSalaryManager) && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Gán preset lương cho từng nhân viên. Nhân viên chưa được gán sẽ dùng
            preset mặc định.
          </p>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <Pagination
              page={assignPage}
              totalPages={assignTotalPages}
              total={assignTotal}
              onPageChange={setAssignPage}
              label="nhân viên"
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Nhân viên
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Phòng ban
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Chức vụ
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Preset hiện tại
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">
                    Đổi preset
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => {
                  const current = assignments.find(
                    (a) => a.employeeId === emp.id,
                  );
                  const currentPreset = current
                    ? presets.find((p) => p.id === current.presetId)
                    : null;
                  const defaultPreset = presets.find((p) => p.isDefault);

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {emp.avatar ? (
                            <img
                              src={emp.avatar}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-bold">
                              {emp.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">
                              {emp.name}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              {emp.employeeCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {emp.department || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {emp.position || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            currentPreset
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {currentPreset?.name ||
                            defaultPreset?.name ||
                            "Chưa gán"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={current?.presetId || ""}
                          onChange={(e) => handleAssign(emp.id, e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                        >
                          <option value="">-- Dùng mặc định --</option>
                          {presets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({fmt(p.baseSalary)})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={assignPage}
              totalPages={assignTotalPages}
              total={assignTotal}
              onPageChange={setAssignPage}
              label="nhân viên"
            />
          </div>
        </div>
      )}

      {/* =================== Coefficients Tab =================== */}
      {tab === "coefficients" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Hệ số lương
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Các hệ số dùng để tính lương OT, ca đêm, cuối tuần, ngày lễ,
              chuyên cần.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Loại
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">
                      Hệ số
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Mô tả
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {coefficients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-8 text-gray-400"
                      >
                        Chưa có hệ số nào. Hãy chạy seed để tạo dữ liệu.
                      </td>
                    </tr>
                  ) : (
                    coefficients.map((coeff) => {
                      const typeLabels: Record<string, string> = {
                        overtime: "Tăng ca (OT)",
                        night_shift: "Ca đêm",
                        weekend: "Cuối tuần",
                        holiday: "Ngày lễ",
                        dedication: "Chuyên cần",
                      };
                      return (
                        <tr key={coeff.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {typeLabels[coeff.type] || coeff.type}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-3 py-1 rounded-full text-sm font-bold bg-emerald-100 text-emerald-700">
                              x{coeff.multiplier}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {coeff.description}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${coeff.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                            >
                              {coeff.isActive ? "Đang dùng" : "Tắt"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================== Benefits Tab =================== */}
      {tab === "benefits" && (isAdmin || isSalaryManager) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Cấu hình phụ cấp, bảo hiểm xã hội, y tế và khấu trừ áp dụng cho
              bảng lương.
            </p>
            <button
              onClick={() => setShowBenefitForm(!showBenefitForm)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              {showBenefitForm ? "Đóng" : "Thêm mục"}
            </button>
          </div>

          {showBenefitForm && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Tên
                  </label>
                  <input
                    type="text"
                    value={benefitForm.name}
                    onChange={(e) =>
                      setBenefitForm({ ...benefitForm, name: e.target.value })
                    }
                    placeholder="Phụ cấp ăn trưa"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Danh mục
                  </label>
                  <select
                    value={benefitForm.category}
                    onChange={(e) =>
                      setBenefitForm({
                        ...benefitForm,
                        category: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="allowance">Phụ cấp</option>
                    <option value="insurance">Bảo hiểm (BHXH/BHYT)</option>
                    <option value="deduction">Khấu trừ khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Số tiền / %
                  </label>
                  <input
                    type="number"
                    value={benefitForm.amount}
                    onChange={(e) =>
                      setBenefitForm({
                        ...benefitForm,
                        amount: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                    Loại
                  </label>
                  <select
                    value={benefitForm.type}
                    onChange={(e) =>
                      setBenefitForm({
                        ...benefitForm,
                        type: e.target.value as "add" | "deduct",
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="add">Cộng (+)</option>
                    <option value="deduct">Trừ (-)</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={benefitForm.note}
                  onChange={(e) =>
                    setBenefitForm({ ...benefitForm, note: e.target.value })
                  }
                  placeholder="Ghi chú..."
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  onClick={() => {
                    if (!benefitForm.name.trim()) return;
                    setBenefits([
                      ...benefits,
                      { ...benefitForm, id: String(Date.now()) },
                    ]);
                    setBenefitForm({
                      name: "",
                      category: "allowance",
                      amount: 0,
                      type: "add",
                      note: "",
                    });
                    setShowBenefitForm(false);
                  }}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Lưu
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Tên
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">
                      Danh mục
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">
                      Số tiền / %
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">
                      Loại
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Ghi chú
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {benefits.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-12 text-gray-400"
                      >
                        Chưa có mục nào
                      </td>
                    </tr>
                  ) : (
                    benefits.map((b) => {
                      const catLabels: Record<string, string> = {
                        allowance: "Phụ cấp",
                        insurance: "Bảo hiểm",
                        deduction: "Khấu trừ",
                      };
                      const catStyles: Record<string, string> = {
                        allowance: "bg-blue-100 text-blue-700",
                        insurance: "bg-purple-100 text-purple-700",
                        deduction: "bg-red-100 text-red-700",
                      };
                      return (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {b.name}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${catStyles[b.category] || "bg-gray-100 text-gray-600"}`}
                            >
                              {catLabels[b.category] || b.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {b.category === "insurance"
                              ? `${b.amount}%`
                              : `${b.amount.toLocaleString("vi-VN")}đ`}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.type === "add" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                            >
                              {b.type === "add" ? "+Cộng" : "-Trừ"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {b.note || "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() =>
                                setBenefits(
                                  benefits.filter((x) => x.id !== b.id),
                                )
                              }
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                              Xóa
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {benefits.length > 0 && (
              <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {benefits.length} mục cấu hình
                </span>
                <div className="flex gap-4 text-sm">
                  <span className="text-blue-600 font-medium">
                    Tổng phụ cấp: +
                    {benefits
                      .filter(
                        (b) => b.type === "add" && b.category === "allowance",
                      )
                      .reduce((s, b) => s + b.amount, 0)
                      .toLocaleString("vi-VN")}
                    đ
                  </span>
                  <span className="text-purple-600 font-medium">
                    BH:{" "}
                    {benefits
                      .filter((b) => b.category === "insurance")
                      .reduce((s, b) => s + b.amount, 0)}
                    %
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== Permissions Tab =================== */}
      {tab === "permissions" && isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                Gán quyền <strong>Quản lý lương</strong> cho người dùng. Chỉ
                người có quyền này mới được tính lương, khóa/mở khóa, quản lý
                mẫu lương.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                ⚠ Admin không có quyền này sẽ chỉ xem được bảng lương, không
                tính được.
              </p>
            </div>
          </div>

          {/* Add permission form */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Gán quyền Quản lý lương
            </h3>
            <div className="flex items-end gap-3">
              <div className="flex-1 relative">
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
                  Tìm người dùng
                </label>
                <input
                  type="text"
                  value={selectedUserName || userSearchQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUserSearchQuery(v);
                    setSelectedUserName("");
                    setPermUserId("");
                    if (searchTimerRef.current)
                      clearTimeout(searchTimerRef.current);
                    if (v.length >= 1) {
                      searchTimerRef.current = setTimeout(async () => {
                        try {
                          const results = await searchUsersForRole(v);
                          setUserSearchResults(results);
                          setShowUserDropdown(true);
                        } catch {
                          setUserSearchResults([]);
                        }
                      }, 300);
                    } else {
                      setUserSearchResults([]);
                      setShowUserDropdown(false);
                    }
                  }}
                  onFocus={() => {
                    if (userSearchResults.length > 0) setShowUserDropdown(true);
                  }}
                  placeholder="Gõ tên hoặc username..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                {showUserDropdown && userSearchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {userSearchResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setPermUserId(u.id);
                          setSelectedUserName(`${u.name} (${u.username})`);
                          setShowUserDropdown(false);
                          setUserSearchQuery("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {u.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {u.username} • {u.department || u.role}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {showUserDropdown &&
                  userSearchResults.length === 0 &&
                  userSearchQuery.length >= 1 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-center text-xs text-gray-400">
                      Không tìm thấy người dùng
                    </div>
                  )}
              </div>
              <button
                onClick={handleAddPermission}
                disabled={!permUserId}
                className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Cấp quyền
              </button>
            </div>
          </div>

          {/* Permissions list */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Người dùng
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">
                      Vai trò
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600">
                      Ngày cấp
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {permissions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-12 text-gray-400"
                      >
                        Chưa có ai được cấp quyền Quản lý lương
                      </td>
                    </tr>
                  ) : (
                    permissions.map((p) => {
                      const emp = employees.find((e) => e.id === p.userId);
                      return (
                        <tr key={p.userId} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">
                                {((p as Record<string, unknown>)
                                  .name as string) ||
                                  emp?.name ||
                                  p.userId}
                              </p>
                              <p className="text-xs text-gray-400">
                                {((p as Record<string, unknown>)
                                  .username as string) ||
                                  emp?.employeeCode ||
                                  ""}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                              Quản lý lương
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">
                            {(p as Record<string, unknown>).grantedAt
                              ? new Date(
                                  (p as Record<string, unknown>)
                                    .grantedAt as string,
                                ).toLocaleDateString("vi-VN")
                              : ""}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevokePermission(p.userId)}
                              className="px-2 py-1 text-xs text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
                            >
                              Thu hồi
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {permissions.length > 0 && (
              <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
                <span className="text-xs text-gray-500">
                  {permissions.length} người dùng có quyền Quản lý lương
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== Export Tab =================== */}
      {tab === "export" && (isAdmin || isSalaryManager) && (
        <ExportTemplateBuilder selectedMonth={selectedMonth} />
      )}
    </div>
  );
}
