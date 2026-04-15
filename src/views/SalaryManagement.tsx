import {
  Calculator,
  Clock,
  DollarSign,
  Edit2,
  FileSpreadsheet,
  Filter,
  GripVertical,
  Lock,
  Plus,
  Save,
  Search,
  Settings,
  Shield,
  Star,
  Trash2,
  Unlock,
  UserCheck,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Pagination from "../components/Pagination";
import { showToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../services/api";
import type { SalaryCoefficient, SalaryPermission } from "../store/storage";
import {
  addSalaryPreset,
  adjustSalaryOt,
  assignSalaryPreset,
  calculateSalary,
  deleteSalaryCoefficient,
  deleteSalaryPreset,
  getDepartments,
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
  updateSalaryCoefficient,
  updateSalaryPreset,
} from "../store/storage";
import type {
  Employee,
  EmployeeSalaryAssignment,
  SalaryPreset,
  SalaryRecord,
} from "../types";
import AttendanceScore from "./AttendanceScore";
import ExportTemplateBuilder from "./ExportTemplateBuilder";

type Tab =
  | "salary"
  | "attendance"
  | "presets"
  | "assign"
  | "coefficients"
  | "rules"
  | "deductions"
  | "benefits"
  | "permissions"
  | "export";

type PayrollRule = {
  id: string;
  rule_type: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  priority: number;
  is_active: number;
};

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

  // Assign tab pagination + filters
  const [assignPage, setAssignPage] = useState(1);
  const [assignTotalPages, setAssignTotalPages] = useState(1);
  const [assignTotal, setAssignTotal] = useState(0);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDeptFilter, setAssignDeptFilter] = useState("");
  const [assignPresetFilter, setAssignPresetFilter] = useState("");
  const assignSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [salaryLocked, setSalaryLocked] = useState(false);
  const [locking, setLocking] = useState(false);
  const [coefficients, setCoefficients] = useState<SalaryCoefficient[]>([]);
  const [coeffEditMap, setCoeffEditMap] = useState<
    Record<string, { multiplier: string; description: string }>
  >({});
  const [savingCoeff, setSavingCoeff] = useState<string | null>(null);
  const [deletingCoeff, setDeletingCoeff] = useState<string | null>(null);
  const [showAddCoeff, setShowAddCoeff] = useState(false);
  const [addCoeffForm, setAddCoeffForm] = useState({
    type: "",
    multiplier: "1",
    description: "",
  });
  const [savingNewCoeff, setSavingNewCoeff] = useState(false);

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
    hourlyRate: 0, // explicit hourly rate — if >0 overrides baseSalary÷(days×8)
    workDaysPerMonth: 22, // standard work days used to derive daily/hourly rate
    allowances: 0,
    isDefault: false,
    salaryBasis: "hourly" as "hourly" | "daily" | "fixed",
    otMultiplier: 1.5,
    latePenaltyPerDay: 50000,
    includeOT: true,
    includeAllowances: true,
    includeDeductions: true,
    includeLatePenalty: true,
    customExpression: "",
  });

  // Custom user-defined variables (e.g. "thuế", "thưởng")
  const [customVars, setCustomVars] = useState<
    { id: string; label: string; value: number; desc: string }[]
  >([]);
  const [showAddVar, setShowAddVar] = useState(false);
  const [newVarForm, setNewVarForm] = useState({
    label: "",
    value: "",
    desc: "",
  });

  // Drag-and-drop formula builder
  type FormulaNode = {
    uid: string;
    blockId: string; // variable ID or "(" or ")" or "number"
    operator: "+" | "-" | "×" | "÷";
    value?: number; // for custom number nodes
  };
  const BUILTIN_BLOCKS = [
    {
      id: "working_hours",
      label: "Giờ làm thực tế",
      color: "blue",
      desc: "Tổng giờ làm có check-out trong tháng",
    },
    {
      id: "present_days",
      label: "Ngày công",
      color: "green",
      desc: "Số ngày có chấm công (check-in) trong tháng",
    },
    {
      id: "hourly_rate",
      label: "Lương 1 giờ",
      color: "emerald",
      desc: "= Lương CB ÷ (Ngày chuẩn × 8h)",
    },
    {
      id: "daily_rate",
      label: "Lương 1 ngày",
      color: "teal",
      desc: "= Lương CB ÷ Ngày chuẩn tháng",
    },
    {
      id: "base_salary",
      label: "Lương cơ bản (cố định)",
      color: "purple",
      desc: "Nhận đủ mỗi tháng",
    },
    {
      id: "ot_hours",
      label: "Giờ OT đã duyệt",
      color: "orange",
      desc: "Giờ OT được phê duyệt trong tháng",
    },
    {
      id: "ot_multiplier",
      label: "Hệ số OT",
      color: "amber",
      desc: "Hệ số nhân lương OT (×1.5, ×2…)",
    },
    {
      id: "allowances",
      label: "Phụ cấp (Preset)",
      color: "sky",
      desc: "Phụ cấp cố định theo preset",
    },
    {
      id: "late_days",
      label: "Số ngày trễ",
      color: "red",
      desc: "Số ngày đi muộn trong tháng",
    },
    {
      id: "late_penalty_rate",
      label: "Tiền phạt/ngày trễ",
      color: "rose",
      desc: "Số tiền phạt mỗi ngày đi trễ",
    },
    {
      id: "deductions",
      label: "Trừ vi phạm",
      color: "orange",
      desc: "Khấu trừ từ quản lý phạt",
    },
    {
      id: "effective_hours",
      label: "Giờ làm hiệu dụng",
      color: "cyan",
      desc: "Giờ làm sau khi trừ đi trễ (theo rule engine)",
    },
    {
      id: "late_hours_deducted",
      label: "Giờ bị trừ (đi trễ)",
      color: "rose",
      desc: "Số giờ bị trừ do đi trễ",
    },
    {
      id: "late_count",
      label: "Số lần đi trễ",
      color: "red",
      desc: "Tổng số lần đi trễ trong tháng",
    },
    {
      id: "total_late_minutes",
      label: "Tổng phút đi trễ",
      color: "red",
      desc: "Tổng số phút đi trễ trong tháng",
    },
  ] as const;

  // Combine built-in + custom variable blocks
  const FORMULA_BLOCKS: {
    id: string;
    label: string;
    color: string;
    desc: string;
  }[] = [
    ...BUILTIN_BLOCKS,
    ...customVars.map((v) => ({
      id: v.id,
      label: v.label,
      color: "indigo" as const,
      desc: `${v.desc || "Biến tùy chỉnh"} = ${v.value.toLocaleString("vi-VN")}`,
    })),
  ];

  type BlockId = string;
  const blockColorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    green: "bg-green-100 text-green-800 border-green-200",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
    teal: "bg-teal-100 text-teal-800 border-teal-200",
    purple: "bg-purple-100 text-purple-800 border-purple-200",
    orange: "bg-orange-100 text-orange-800 border-orange-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    sky: "bg-sky-100 text-sky-800 border-sky-200",
    red: "bg-red-100 text-red-800 border-red-200",
    rose: "bg-rose-100 text-rose-800 border-rose-200",
    indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
    pink: "bg-pink-100 text-pink-800 border-pink-200",
    cyan: "bg-cyan-100 text-cyan-800 border-cyan-200",
  };

  async function addCustomVar() {
    const label = newVarForm.label.trim();
    if (!label) return;
    const val = parseFloat(newVarForm.value) || 0;
    const id =
      "custom_" +
      label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    if (FORMULA_BLOCKS.some((b) => b.id === id)) {
      showToast("warning", "Trùng tên", "Biến này đã tồn tại");
      return;
    }
    try {
      const res = await fetch(buildApiUrl("/salary/variables"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          id,
          label,
          value: val,
          description: newVarForm.desc.trim() || `Biến tùy chỉnh: ${label}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast("error", "Lỗi", err.error || "Không thể tạo biến");
        return;
      }
      await loadFormulaVars();
      setNewVarForm({ label: "", value: "", desc: "" });
      setShowAddVar(false);
    } catch {
      showToast("error", "Lỗi", "Không thể kết nối server");
    }
  }

  async function removeCustomVar(varId: string) {
    try {
      await fetch(
        buildApiUrl(`/salary/variables/${encodeURIComponent(varId)}`),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        },
      );
      await loadFormulaVars();
      setFormulaNodes((prev) => prev.filter((n) => n.blockId !== varId));
    } catch {
      showToast("error", "Lỗi", "Không thể xóa biến");
    }
  }
  const [formulaNodes, setFormulaNodes] = useState<FormulaNode[]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragBlockRef = useRef<BlockId | null>(null);
  const [formulaMode, setFormulaMode] = useState<"blocks" | "text">("blocks");

  // Convert formula nodes → expression string for backend
  function nodesToExpression(nodes: FormulaNode[]): string {
    if (!nodes.length) return "";
    const opMap: Record<string, string> = {
      "+": "+",
      "-": "-",
      "×": "*",
      "÷": "/",
    };
    return nodes
      .map((n, i) => {
        const varName =
          n.blockId === "number" ? String(n.value ?? 0) : n.blockId;
        if (n.blockId === "(" || n.blockId === ")") return n.blockId;
        return i === 0 ? varName : `${opMap[n.operator] || "+"} ${varName}`;
      })
      .join(" ");
  }

  // Validate formula nodes — returns error message or null
  // NOTE: operators (+,-,×,÷) are stored as .operator on each node (for idx > 0),
  // so consecutive var nodes are fine — they implicitly have operators between them.
  function validateFormula(nodes: FormulaNode[]): string | null {
    if (!nodes.length) return null;
    let parenDepth = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.blockId === "(") {
        parenDepth++;
      } else if (n.blockId === ")") {
        parenDepth--;
        if (parenDepth < 0) return "Dấu ) thừa ở vị trí " + (i + 1);
      }
    }
    if (parenDepth !== 0) return `Thiếu ${parenDepth} dấu đóng ngoặc )`;
    // Check: at least one variable (not just parens)
    const hasVar = nodes.some((n) => n.blockId !== "(" && n.blockId !== ")");
    if (!hasVar) return "Công thức phải có ít nhất 1 biến";
    return null;
  }

  // Sample data for formula preview
  // Sample data for formula preview — includes custom vars
  const SAMPLE_VARS: Record<string, number> = {
    working_hours: 160,
    present_days: 22,
    hourly_rate:
      presetForm.baseSalary > 0
        ? presetForm.baseSalary / ((presetForm.workDaysPerMonth || 22) * 8)
        : 34091,
    daily_rate:
      presetForm.baseSalary > 0
        ? presetForm.baseSalary / (presetForm.workDaysPerMonth || 22)
        : 272727,
    base_salary: presetForm.baseSalary || 6000000,
    ot_hours: 8,
    ot_multiplier: presetForm.otMultiplier || 1.5,
    allowances: presetForm.allowances || 0,
    late_days: 2,
    late_penalty_rate: presetForm.latePenaltyPerDay || 50000,
    deductions: 0,
    effective_hours: 158,
    late_hours_deducted: 2,
    late_count: 3,
    total_late_minutes: 120,
    ...Object.fromEntries(customVars.map((v) => [v.id, v.value])),
  };

  // Evaluate expression client-side for preview
  function evalExpressionPreview(expr: string): number | null {
    if (!expr.trim()) return null;
    try {
      const tokens: { type: string; value: any }[] = [];
      let i = 0;
      const s = expr.replace(/\s+/g, "");
      while (i < s.length) {
        if ("+-*/()".includes(s[i])) {
          tokens.push({ type: "op", value: s[i] });
          i++;
        } else if (/[0-9.]/.test(s[i])) {
          let num = "";
          while (i < s.length && /[0-9.]/.test(s[i])) {
            num += s[i];
            i++;
          }
          tokens.push({ type: "num", value: parseFloat(num) || 0 });
        } else if (/[a-z_]/i.test(s[i])) {
          let name = "";
          while (i < s.length && /[a-z_0-9]/i.test(s[i])) {
            name += s[i];
            i++;
          }
          tokens.push({ type: "num", value: SAMPLE_VARS[name] ?? 0 });
        } else {
          i++;
        }
      }
      let pos = 0;
      function peek() {
        return pos < tokens.length ? tokens[pos] : null;
      }
      function consume() {
        return tokens[pos++];
      }
      function parseE(): number {
        let left = parseT();
        while (peek() && (peek()!.value === "+" || peek()!.value === "-")) {
          const op = consume()!.value;
          const right = parseT();
          left = op === "+" ? left + right : left - right;
        }
        return left;
      }
      function parseT(): number {
        let left = parseF();
        while (peek() && (peek()!.value === "*" || peek()!.value === "/")) {
          const op = consume()!.value;
          const right = parseF();
          left = op === "*" ? left * right : right !== 0 ? left / right : 0;
        }
        return left;
      }
      function parseF(): number {
        const tok = peek();
        if (!tok) return 0;
        if (tok.type === "num") {
          consume();
          return tok.value;
        }
        if (tok.value === "(") {
          consume();
          const v = parseE();
          if (peek()?.value === ")") consume();
          return v;
        }
        if (tok.value === "-") {
          consume();
          return -parseF();
        }
        consume();
        return 0;
      }
      const result = parseE();
      return Math.max(0, isNaN(result) ? 0 : result);
    } catch {
      return null;
    }
  }

  // Get the effective expression (from text or auto-generated from blocks)
  function getEffectiveExpression(): string {
    if (formulaMode === "text" && presetForm.customExpression) {
      return presetForm.customExpression;
    }
    return nodesToExpression(formulaNodes);
  }

  // Payroll table column config
  const [tableColumns, setTableColumns] = useState<
    { key: string; label: string; visible: boolean; order: number }[]
  >([]);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  const DEFAULT_COLUMNS = [
    { key: "employee_name", label: "Nhân viên", visible: true, order: 1 },
    { key: "department", label: "Phòng ban", visible: true, order: 2 },
    { key: "preset", label: "Preset", visible: true, order: 3 },
    { key: "base_salary", label: "Lương CB", visible: true, order: 4 },
    {
      key: "total_working_hours",
      label: "Tổng giờ làm",
      visible: true,
      order: 5,
    },
    {
      key: "effective_hours",
      label: "Giờ hiệu dụng",
      visible: false,
      order: 6,
    },
    { key: "present_days", label: "Ngày công", visible: true, order: 7 },
    { key: "ot", label: "OT", visible: true, order: 8 },
    { key: "allowances", label: "Phụ cấp", visible: true, order: 9 },
    { key: "deductions", label: "Khấu trừ", visible: true, order: 10 },
    { key: "late_penalty", label: "Phạt trễ", visible: true, order: 11 },
    { key: "rule_details", label: "Ràng buộc", visible: false, order: 12 },
    {
      key: "gross_salary",
      label: "Lương trước thuế",
      visible: true,
      order: 13,
    },
    { key: "net_salary", label: "Lương ròng", visible: true, order: 14 },
  ];

  // OT adjustment popup
  const [otPopupRecord, setOtPopupRecord] = useState<SalaryRecord | null>(null);
  const [otPopupForm, setOtPopupForm] = useState({
    otHoursOverride: 0,
    bonusDesc: "1 giờ OT = 1.5 giờ thưởng",
    note: "",
  });
  const [savingOt, setSavingOt] = useState(false);

  async function loadFormulaVars() {
    try {
      const res = await fetch(buildApiUrl("/salary/variables"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      if (res.ok) {
        const rows = await res.json();
        setCustomVars(
          rows.map((r: any) => ({
            id: r.id,
            label: r.label,
            value: parseFloat(r.value),
            desc: r.description || "",
          })),
        );
      }
    } catch {}
  }

  useEffect(() => {
    reloadPresets();
    loadTableConfig();
    loadFormulaVars();
    getDepartments()
      .then((depts) => {
        setAvailableDepts(
          depts
            .map((d) => d.name)
            .filter(Boolean)
            .sort(),
        );
      })
      .catch(() => {});
  }, []);

  async function reloadPresets() {
    setPresets(await getSalaryPresets());
    setAssignments(await getSalaryAssignments());
  }

  async function loadTableConfig() {
    try {
      const res = await fetch(buildApiUrl("/salary/table-config"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.columns?.length) {
          setTableColumns(data.columns);
          return;
        }
      }
    } catch {}
    setTableColumns(DEFAULT_COLUMNS);
  }

  async function saveTableConfig(cols: typeof tableColumns) {
    setTableColumns(cols);
    try {
      await fetch(buildApiUrl("/salary/table-config"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ columns: cols }),
      });
    } catch {}
  }

  function isColVisible(key: string) {
    const col = tableColumns.find((c) => c.key === key);
    return col ? col.visible : true;
  }

  function toggleColVisible(key: string) {
    const updated = tableColumns.map((c) =>
      c.key === key ? { ...c, visible: !c.visible } : c,
    );
    saveTableConfig(updated);
  }

  function moveCol(key: string, dir: -1 | 1) {
    const idx = tableColumns.findIndex((c) => c.key === key);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= tableColumns.length) return;
    const updated = [...tableColumns];
    const [a, b] = [updated[idx], updated[swapIdx]];
    const tmpOrder = a.order;
    a.order = b.order;
    b.order = tmpOrder;
    updated.sort((x, y) => x.order - y.order);
    saveTableConfig(updated);
  }

  const visibleColCount = tableColumns.filter((c) => c.visible).length;

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
      const params: Record<string, string> = {
        page: String(assignPage),
        limit: "30",
        isActive: "true",
      };
      if (assignSearch) params.search = assignSearch;
      if (assignDeptFilter) params.department = assignDeptFilter;
      const res = await getEmployeesPaginated(params);
      setEmployees(res.data);
      setAssignTotalPages(res.pagination.totalPages);
      setAssignTotal(res.pagination.total);
    } catch (err) {
      console.error(err);
    }
  }, [assignPage, assignSearch, assignDeptFilter]);

  useEffect(() => {
    if (tab === "salary") loadSalaryRecords();
    if (tab === "coefficients") loadCoefficients();
    if (tab === "rules") loadPayrollRules();
    if (tab === "deductions") loadDeductionItems();
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
      const list = await getSalaryCoefficients();
      setCoefficients(list);
      // Initialize edit map from loaded data
      const em: Record<string, { multiplier: string; description: string }> =
        {};
      list.forEach((c) => {
        em[c.type] = {
          multiplier: String(c.multiplier),
          description: c.description || "",
        };
      });
      setCoeffEditMap(em);
    } catch (err) {
      console.error("Load coefficients error:", err);
    }
  }

  // ============ Payroll Rules ============
  const [payrollRules, setPayrollRules] = useState<PayrollRule[]>([]);
  const [editingRule, setEditingRule] = useState<PayrollRule | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    rule_type: "late_policy" as string,
    name: "",
    description: "",
    priority: 10,
    is_active: true,
    config: {} as Record<string, unknown>,
  });

  const RULE_TYPE_META: Record<
    string,
    {
      label: string;
      color: string;
      fields: {
        key: string;
        label: string;
        type: string;
        placeholder: string;
        step?: string;
      }[];
    }
  > = {
    late_policy: {
      label: "Chính sách đi trễ",
      color: "text-orange-600 bg-orange-50 border-orange-200",
      fields: [
        {
          key: "grace_minutes",
          label: "Ân hạn (phút)",
          type: "number",
          placeholder: "5",
          step: "1",
        },
        {
          key: "conversion_rate",
          label: "Tỷ lệ quy đổi (1 = 1:1)",
          type: "number",
          placeholder: "1",
          step: "0.1",
        },
        {
          key: "description_template",
          label: "Mẫu mô tả",
          type: "text",
          placeholder: "Trễ {late_minutes} phút → trừ {deducted_hours}h làm",
        },
      ],
    },
    min_hours_policy: {
      label: "Ngưỡng giờ tối thiểu",
      color: "text-blue-600 bg-blue-50 border-blue-200",
      fields: [
        {
          key: "required_hours",
          label: "Giờ tối thiểu/tháng",
          type: "number",
          placeholder: "160",
          step: "1",
        },
        {
          key: "penalty_rate",
          label: "Hệ số giảm lương (VD: 0.7 = giảm 30%)",
          type: "number",
          placeholder: "0.7",
          step: "0.05",
        },
        {
          key: "description_template",
          label: "Mẫu mô tả",
          type: "text",
          placeholder:
            "Chỉ làm {effective_hours}h / {required_hours}h → lương ×{penalty_rate}",
        },
      ],
    },
    repeat_late_policy: {
      label: "Phạt tái phạm đi trễ",
      color: "text-red-600 bg-red-50 border-red-200",
      fields: [
        {
          key: "max_late_count",
          label: "Ngưỡng số lần trễ",
          type: "number",
          placeholder: "5",
          step: "1",
        },
        {
          key: "penalty_type",
          label: "Loại phạt",
          type: "select",
          placeholder: "fixed",
        },
        {
          key: "penalty_amount",
          label: "Số tiền phạt (VNĐ)",
          type: "number",
          placeholder: "200000",
          step: "10000",
        },
        {
          key: "penalty_percentage",
          label: "Phần trăm phạt (VD: 0.05 = 5%)",
          type: "number",
          placeholder: "0",
          step: "0.01",
        },
        {
          key: "description_template",
          label: "Mẫu mô tả",
          type: "text",
          placeholder:
            "Đi trễ {late_count} lần (>{max_late_count}) → phạt {penalty_amount}đ",
        },
      ],
    },
  };

  async function loadPayrollRules() {
    try {
      const res = await fetch(buildApiUrl("/salary/rules"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      if (res.ok) setPayrollRules(await res.json());
    } catch (err) {
      console.error("Load rules error:", err);
    }
  }

  async function saveRule() {
    if (!ruleForm.name || !ruleForm.rule_type) return;
    try {
      const url = editingRule
        ? buildApiUrl(`/salary/rules/${encodeURIComponent(editingRule.id)}`)
        : buildApiUrl("/salary/rules");
      const method = editingRule ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...ruleForm,
          config: ruleForm.config,
          is_active: ruleForm.is_active ? 1 : 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(
          "error",
          "Lỗi",
          (err as { error?: string }).error || "Không thể lưu rule",
        );
        return;
      }
      showToast(
        "success",
        "Thành công",
        editingRule ? "Đã cập nhật rule" : "Đã tạo rule",
      );
      setShowRuleForm(false);
      setEditingRule(null);
      await loadPayrollRules();
    } catch {
      showToast("error", "Lỗi", "Không thể kết nối server");
    }
  }

  async function toggleRule(rule: PayrollRule) {
    try {
      await fetch(buildApiUrl(`/salary/rules/${encodeURIComponent(rule.id)}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ is_active: rule.is_active ? 0 : 1 }),
      });
      await loadPayrollRules();
    } catch {
      showToast("error", "Lỗi", "Không thể cập nhật");
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm("Xóa rule này?")) return;
    try {
      await fetch(buildApiUrl(`/salary/rules/${encodeURIComponent(ruleId)}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      await loadPayrollRules();
    } catch {
      showToast("error", "Lỗi", "Không thể xóa");
    }
  }

  function openEditRule(rule: PayrollRule) {
    setEditingRule(rule);
    setRuleForm({
      rule_type: rule.rule_type,
      name: rule.name,
      description: rule.description || "",
      priority: rule.priority,
      is_active: !!rule.is_active,
      config: { ...rule.config },
    });
    setShowRuleForm(true);
  }

  function openAddRule() {
    setEditingRule(null);
    setRuleForm({
      rule_type: "late_policy",
      name: "",
      description: "",
      priority: 10,
      is_active: true,
      config: {},
    });
    setShowRuleForm(true);
  }

  // ============ Deduction Items ============
  type DeductionItem = {
    id: string;
    name: string;
    type: string;
    calcType: string;
    amount: number;
    rate: number;
    description: string;
    priority: number;
    isActive: number;
  };

  const [deductionItems, setDeductionItems] = useState<DeductionItem[]>([]);
  const [editingDeduction, setEditingDeduction] =
    useState<DeductionItem | null>(null);
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [deductionForm, setDeductionForm] = useState({
    name: "",
    type: "tax" as string,
    calc_type: "percentage" as string,
    amount: 0,
    rate: 0,
    description: "",
    priority: 10,
    is_active: true,
  });

  const DEDUCTION_TYPE_META: Record<string, { label: string; color: string }> =
    {
      tax: { label: "Thuế", color: "text-red-600 bg-red-50 border-red-200" },
      insurance: {
        label: "Bảo hiểm",
        color: "text-blue-600 bg-blue-50 border-blue-200",
      },
      union_fee: {
        label: "Công đoàn",
        color: "text-purple-600 bg-purple-50 border-purple-200",
      },
      custom: {
        label: "Tùy chỉnh",
        color: "text-gray-600 bg-gray-50 border-gray-200",
      },
    };

  async function loadDeductionItems() {
    try {
      const res = await fetch(buildApiUrl("/salary/deduction-items"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
      });
      if (res.ok) setDeductionItems(await res.json());
    } catch (err) {
      console.error("Load deduction items error:", err);
    }
  }

  async function saveDeductionItem() {
    if (!deductionForm.name) return;
    try {
      const url = editingDeduction
        ? buildApiUrl(
            `/salary/deduction-items/${encodeURIComponent(editingDeduction.id)}`,
          )
        : buildApiUrl("/salary/deduction-items");
      const method = editingDeduction ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({
          ...deductionForm,
          is_active: deductionForm.is_active ? 1 : 0,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(
          "error",
          "Lỗi",
          (err as { error?: string }).error || "Không thể lưu",
        );
        return;
      }
      showToast(
        "success",
        "Thành công",
        editingDeduction ? "Đã cập nhật" : "Đã tạo khoản khấu trừ",
      );
      setShowDeductionForm(false);
      setEditingDeduction(null);
      await loadDeductionItems();
    } catch {
      showToast("error", "Lỗi", "Không thể kết nối server");
    }
  }

  async function toggleDeductionItem(item: DeductionItem) {
    try {
      await fetch(
        buildApiUrl(`/salary/deduction-items/${encodeURIComponent(item.id)}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({ is_active: item.isActive ? 0 : 1 }),
        },
      );
      await loadDeductionItems();
    } catch {
      showToast("error", "Lỗi", "Không thể cập nhật");
    }
  }

  async function deleteDeductionItem(id: string) {
    if (!confirm("Xóa khoản khấu trừ này?")) return;
    try {
      await fetch(
        buildApiUrl(`/salary/deduction-items/${encodeURIComponent(id)}`),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${localStorage.getItem("auth_token")}` },
        },
      );
      await loadDeductionItems();
    } catch {
      showToast("error", "Lỗi", "Không thể xóa");
    }
  }

  function openEditDeduction(item: DeductionItem) {
    setEditingDeduction(item);
    setDeductionForm({
      name: item.name,
      type: item.type,
      calc_type: item.calcType,
      amount: item.amount,
      rate: item.rate,
      description: item.description || "",
      priority: item.priority,
      is_active: !!item.isActive,
    });
    setShowDeductionForm(true);
  }

  function openAddDeduction() {
    setEditingDeduction(null);
    setDeductionForm({
      name: "",
      type: "tax",
      calc_type: "percentage",
      amount: 0,
      rate: 0,
      description: "",
      priority: 10,
      is_active: true,
    });
    setShowDeductionForm(true);
  }

  async function handleSaveCoefficient(type: string) {
    const edit = coeffEditMap[type];
    if (!edit) return;
    const val = parseFloat(edit.multiplier);
    if (isNaN(val) || val <= 0) return;
    setSavingCoeff(type);
    try {
      await updateSalaryCoefficient(type, {
        multiplier: val,
        description: edit.description,
      });
      await loadCoefficients();
      showToast("success", "Đã lưu", `Hệ số ${type} đã cập nhật`);
    } catch (err) {
      showToast("error", "Lỗi", "Không thể lưu hệ số");
      console.error(err);
    } finally {
      setSavingCoeff(null);
    }
  }

  async function handleDeleteCoefficient(type: string) {
    try {
      await deleteSalaryCoefficient(type);
      await loadCoefficients();
      setDeletingCoeff(null);
      showToast("success", "Đã xóa", `Hệ số "${type}" đã bị xóa`);
    } catch (err) {
      showToast("error", "Lỗi", "Không thể xóa hệ số");
      console.error(err);
    }
  }

  async function handleAddCoefficient() {
    const typeKey = addCoeffForm.type.trim().replace(/\s+/g, "_").toLowerCase();
    if (!typeKey) {
      showToast("error", "Thiếu thông tin", "Vui lòng nhập tên loại hệ số");
      return;
    }
    const val = parseFloat(addCoeffForm.multiplier);
    if (isNaN(val) || val <= 0) {
      showToast("error", "Hệ số không hợp lệ", "Hệ số phải là số dương");
      return;
    }
    setSavingNewCoeff(true);
    try {
      await updateSalaryCoefficient(typeKey, {
        multiplier: val,
        description: addCoeffForm.description,
      });
      await loadCoefficients();
      setShowAddCoeff(false);
      setAddCoeffForm({ type: "", multiplier: "1", description: "" });
      showToast("success", "Đã thêm", `Hệ số "${typeKey}" đã được thêm`);
    } catch (err) {
      showToast("error", "Lỗi", "Không thể thêm hệ số");
      console.error(err);
    } finally {
      setSavingNewCoeff(false);
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
      hourlyRate: 0,
      workDaysPerMonth: 22,
      allowances: 0,
      isDefault: false,
      salaryBasis: "hourly",
      otMultiplier: 1.5,
      latePenaltyPerDay: 50000,
      includeOT: true,
      includeAllowances: true,
      includeDeductions: true,
      includeLatePenalty: true,
      customExpression: "",
    });
    setEditingPresetId(null);
    setFormulaNodes([]);
    setShowPresetForm(true);
  }

  function openEditPreset(p: SalaryPreset) {
    const cfg = parsePresetConfig(p.customFormula);
    setPresetForm({
      name: p.name,
      description: p.description,
      baseSalary: p.baseSalary,
      hourlyRate: cfg.hourlyRate ?? 0,
      workDaysPerMonth: cfg.workDaysPerMonth ?? 22,
      allowances: p.allowances,
      isDefault: p.isDefault,
      salaryBasis: cfg.salaryBasis,
      otMultiplier: cfg.otMultiplier,
      latePenaltyPerDay: cfg.latePenaltyPerDay,
      includeOT: cfg.includeOT,
      includeAllowances: cfg.includeAllowances,
      includeDeductions: cfg.includeDeductions,
      includeLatePenalty: cfg.includeLatePenalty,
      customExpression: cfg.customExpression ?? "",
    });
    // If has customExpression, switch to text mode; otherwise blocks
    setFormulaMode(cfg.customExpression ? "text" : "blocks");
    setEditingPresetId(p.id);
    try {
      const parsed =
        typeof p.customFormula === "string"
          ? JSON.parse(p.customFormula)
          : p.customFormula;
      setFormulaNodes((parsed?.formulaNodes ?? []) as FormulaNode[]);
    } catch {
      setFormulaNodes([]);
    }
    setShowPresetForm(true);
  }

  async function savePreset() {
    if (!presetForm.name || presetForm.baseSalary <= 0) return;
    // Validate formula if using blocks
    if (formulaMode === "blocks" && formulaNodes.length > 0) {
      const err = validateFormula(formulaNodes);
      if (err) {
        showToast("error", "Công thức lỗi", err);
        return;
      }
    }
    // Auto-generate expression from blocks if in block mode
    const effectiveExpression =
      formulaMode === "text"
        ? presetForm.customExpression || undefined
        : formulaNodes.length > 0
          ? nodesToExpression(formulaNodes)
          : undefined;
    const config = JSON.stringify({
      salaryBasis: presetForm.salaryBasis,
      hourlyRate: presetForm.hourlyRate > 0 ? presetForm.hourlyRate : undefined,
      workDaysPerMonth: presetForm.workDaysPerMonth || 22,
      otMultiplier: presetForm.otMultiplier,
      latePenaltyPerDay: presetForm.latePenaltyPerDay,
      includeOT: presetForm.includeOT,
      includeAllowances: presetForm.includeAllowances,
      includeDeductions: presetForm.includeDeductions,
      includeLatePenalty: presetForm.includeLatePenalty,
      formulaNodes: formulaNodes,
      customExpression: effectiveExpression,
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

  function openOtPopup(record: SalaryRecord) {
    setOtPopupRecord(record);
    setOtPopupForm({
      otHoursOverride: record.otHours ?? 0,
      bonusDesc: "1 giờ OT = 1.5 giờ thưởng",
      note: "",
    });
  }

  async function handleSaveOtAdjust() {
    if (!otPopupRecord) return;
    setSavingOt(true);
    try {
      await adjustSalaryOt(otPopupRecord.id, {
        otHoursOverride: otPopupForm.otHoursOverride,
        bonusDesc: otPopupForm.bonusDesc,
        note: otPopupForm.note,
      });
      setOtPopupRecord(null);
      await loadSalaryRecords();
    } finally {
      setSavingOt(false);
    }
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
        hourlyRate: c.hourlyRate ? parseFloat(c.hourlyRate) : 0,
        workDaysPerMonth: c.workDaysPerMonth
          ? parseInt(c.workDaysPerMonth)
          : 22,
        customExpression: c.customExpression || "",
        formulaNodes: (c.formulaNodes || []) as FormulaNode[],
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
        hourlyRate: 0,
        workDaysPerMonth: 22,
        customExpression: "",
        formulaNodes: [] as FormulaNode[],
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
      key: "attendance",
      label: "Điểm chuyên cần",
      icon: <Star className="w-4 h-4" />,
      requireElevated: true,
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
      key: "rules",
      label: "Ràng buộc",
      icon: <Shield className="w-4 h-4" />,
      requireElevated: true,
    },
    {
      key: "deductions",
      label: "Khấu trừ",
      icon: <Calculator className="w-4 h-4" />,
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
            {(isAdmin || isSalaryManager) && (
              <div className="relative mt-5">
                <button
                  onClick={() => setShowColumnConfig(!showColumnConfig)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-all"
                  title="Tùy chỉnh cột hiển thị"
                >
                  <Settings className="w-4 h-4" /> Cột
                </button>
                {showColumnConfig && (
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 w-72">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-gray-800">
                        Tùy chỉnh cột
                      </h4>
                      <button
                        onClick={() => setShowColumnConfig(false)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {tableColumns.map((col) => (
                        <div
                          key={col.key}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50"
                        >
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={col.visible}
                              onChange={() => toggleColVisible(col.key)}
                              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            {col.label}
                          </label>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => moveCol(col.key, -1)}
                              className="p-0.5 text-gray-400 hover:text-gray-600 text-[10px]"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveCol(col.key, 1)}
                              className="p-0.5 text-gray-400 hover:text-gray-600 text-[10px]"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                      <button
                        onClick={() => saveTableConfig(DEFAULT_COLUMNS)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Đặt lại mặc định
                      </button>
                      <span className="text-[10px] text-gray-400">
                        {tableColumns.filter((c) => c.visible).length}/
                        {tableColumns.length} cột
                      </span>
                    </div>
                  </div>
                )}
              </div>
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
                      {isColVisible("employee_name") && (
                        <th
                          className="text-left px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort("employee_name")}
                        >
                          Nhân viên {sortIcon("employee_name")}
                        </th>
                      )}
                      {isColVisible("department") && (
                        <th
                          className="text-left px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort("department")}
                        >
                          Phòng ban {sortIcon("department")}
                        </th>
                      )}
                      {isColVisible("preset") && (
                        <th className="text-left px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                          Preset
                        </th>
                      )}
                      {isColVisible("base_salary") && (
                        <th
                          className="text-right px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort("base_salary")}
                        >
                          Lương CB {sortIcon("base_salary")}
                        </th>
                      )}
                      {isColVisible("total_working_hours") && (
                        <th className="text-center px-3 py-3 font-semibold text-blue-600 whitespace-nowrap">
                          <span className="flex items-center justify-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Tổng giờ làm
                          </span>
                        </th>
                      )}
                      {isColVisible("effective_hours") && (
                        <th className="text-center px-3 py-3 font-semibold text-cyan-600 whitespace-nowrap">
                          Giờ hiệu dụng
                        </th>
                      )}
                      {isColVisible("present_days") && (
                        <th
                          className="text-center px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort("present_days")}
                        >
                          Ngày công {sortIcon("present_days")}
                        </th>
                      )}
                      {isColVisible("ot") && (
                        <th
                          className="text-right px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort("ot_hours")}
                        >
                          OT {sortIcon("ot_hours")}
                          {(isAdmin || isSalaryManager) && (
                            <span className="block text-[10px] text-blue-400 font-normal">
                              Click điều chỉnh
                            </span>
                          )}
                        </th>
                      )}
                      {isColVisible("allowances") && (
                        <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                          Phụ cấp
                        </th>
                      )}
                      {isColVisible("deductions") && (
                        <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                          Khấu trừ
                        </th>
                      )}
                      {isColVisible("late_penalty") && (
                        <th className="text-right px-3 py-3 font-semibold text-gray-600 whitespace-nowrap">
                          Phạt trễ
                        </th>
                      )}
                      {isColVisible("rule_details") && (
                        <th className="text-left px-3 py-3 font-semibold text-indigo-600 whitespace-nowrap">
                          Ràng buộc
                        </th>
                      )}
                      {isColVisible("gross_salary") && (
                        <th
                          className="text-right px-3 py-3 font-semibold text-gray-600 cursor-pointer hover:text-emerald-700 select-none whitespace-nowrap"
                          onClick={() => toggleSort("gross_salary")}
                        >
                          Lương trước thuế {sortIcon("gross_salary")}
                        </th>
                      )}
                      {isColVisible("net_salary") && (
                        <th
                          className="text-right px-3 py-3 font-semibold text-emerald-700 cursor-pointer hover:text-emerald-900 select-none whitespace-nowrap"
                          onClick={() => toggleSort("net_salary")}
                        >
                          Lương ròng {sortIcon("net_salary")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRecords.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {isColVisible("employee_name") && (
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
                        )}
                        {isColVisible("department") && (
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
                        )}
                        {isColVisible("preset") && (
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                              {r.presetName}
                            </span>
                          </td>
                        )}
                        {isColVisible("base_salary") && (
                          <td className="px-3 py-3 text-right text-gray-700">
                            {fmt(r.baseSalary)}
                          </td>
                        )}
                        {isColVisible("total_working_hours") && (
                          <td className="px-3 py-3 text-center">
                            <span className="font-semibold text-blue-700">
                              {(r.totalWorkingHours ?? 0).toFixed(1)}h
                            </span>
                          </td>
                        )}
                        {isColVisible("effective_hours") && (
                          <td className="px-3 py-3 text-center">
                            <span
                              className={`font-semibold ${r.effectiveHours != null && r.effectiveHours < (r.totalWorkingHours ?? 0) ? "text-orange-600" : "text-cyan-700"}`}
                            >
                              {r.effectiveHours != null
                                ? `${r.effectiveHours.toFixed(1)}h`
                                : "-"}
                            </span>
                            {r.lateHoursDeducted != null &&
                              r.lateHoursDeducted > 0 && (
                                <div className="text-[10px] text-orange-500">
                                  -{r.lateHoursDeducted.toFixed(1)}h trễ
                                </div>
                              )}
                          </td>
                        )}
                        {isColVisible("present_days") && (
                          <td className="px-3 py-3 text-center">
                            <div>
                              <span
                                className={`font-bold text-sm ${r.presentDays > 0 ? "text-gray-800" : "text-red-400"}`}
                              >
                                {typeof r.presentDays === "number"
                                  ? r.presentDays.toFixed(2)
                                  : r.presentDays}
                              </span>
                              <span className="text-gray-400 text-xs">
                                /{r.totalWorkDays}
                              </span>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {(r.totalWorkingHours ?? 0) > 0
                                  ? `${(r.totalWorkingHours ?? 0).toFixed(1)}h ÷ 8`
                                  : "chưa có giờ"}
                              </div>
                            </div>
                          </td>
                        )}
                        {isColVisible("ot") && (
                          <td className="px-3 py-3 text-right">
                            <button
                              onClick={() =>
                                isAdmin || isSalaryManager
                                  ? openOtPopup(r)
                                  : undefined
                              }
                              className={`group text-right w-full ${isAdmin || isSalaryManager ? "cursor-pointer hover:bg-blue-50 rounded-lg p-1 transition-colors" : ""}`}
                            >
                              <span className="text-gray-700">
                                {r.otHours}h
                              </span>
                              {r.otPay > 0 && (
                                <p className="text-[11px] text-blue-500">
                                  {fmt(r.otPay)}
                                </p>
                              )}
                            </button>
                          </td>
                        )}
                        {isColVisible("allowances") && (
                          <td className="px-3 py-3 text-right text-blue-600">
                            {r.allowances > 0 ? (
                              `+${fmt(r.allowances)}`
                            ) : (
                              <span className="text-gray-300">0đ</span>
                            )}
                          </td>
                        )}
                        {isColVisible("deductions") && (
                          <td className="px-3 py-3 text-right text-red-500">
                            {r.deductions > 0 ? (
                              `-${fmt(r.deductions)}`
                            ) : (
                              <span className="text-gray-300">0đ</span>
                            )}
                          </td>
                        )}
                        {isColVisible("late_penalty") && (
                          <td className="px-3 py-3 text-right text-orange-500">
                            {r.latePenalty > 0 ? (
                              `-${fmt(r.latePenalty)}`
                            ) : (
                              <span className="text-gray-300">0đ</span>
                            )}
                          </td>
                        )}
                        {isColVisible("rule_details") && (
                          <td className="px-3 py-3 text-left max-w-[200px]">
                            {(() => {
                              const rd = r.ruleDetails;
                              if (!rd)
                                return (
                                  <span className="text-gray-300 text-xs">
                                    —
                                  </span>
                                );
                              try {
                                const details =
                                  typeof rd === "string" ? JSON.parse(rd) : rd;
                                if (
                                  !Array.isArray(details) ||
                                  details.length === 0
                                )
                                  return (
                                    <span className="text-gray-300 text-xs">
                                      —
                                    </span>
                                  );
                                return (
                                  <div className="space-y-0.5">
                                    {(details as string[]).map((d, i) => (
                                      <div
                                        key={i}
                                        className="text-[10px] text-indigo-600 leading-tight"
                                      >
                                        {d}
                                      </div>
                                    ))}
                                  </div>
                                );
                              } catch {
                                return (
                                  <span className="text-gray-300 text-xs">
                                    —
                                  </span>
                                );
                              }
                            })()}
                          </td>
                        )}
                        {isColVisible("gross_salary") && (
                          <td className="px-3 py-3 text-right font-medium text-gray-800">
                            {fmt(r.grossSalary)}
                          </td>
                        )}
                        {isColVisible("net_salary") && (
                          <td className="px-3 py-3 text-right font-bold text-emerald-600">
                            {fmt(r.netSalary)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {(isAdmin || isSalaryManager) &&
                    displayRecords.length > 1 && (
                      <tfoot>
                        <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                          <td
                            colSpan={visibleColCount - 2}
                            className="px-3 py-3 font-semibold text-emerald-800"
                          >
                            Tổng cộng ({salaryTotal} NV)
                          </td>
                          {isColVisible("gross_salary") && (
                            <td className="px-3 py-3 text-right font-bold text-gray-800">
                              {fmt(salaryTotalGross)}
                            </td>
                          )}
                          {isColVisible("net_salary") && (
                            <td className="px-3 py-3 text-right font-bold text-emerald-700">
                              {fmt(totalNet)}
                            </td>
                          )}
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

      {/* =================== OT Adjustment Popup =================== */}
      {otPopupRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Điều chỉnh giờ OT / Lễ
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {otPopupRecord.employeeName} — Tháng {otPopupRecord.month}
                </p>
              </div>
              <button
                onClick={() => setOtPopupRecord(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4">
                <div>
                  <p className="text-xs text-gray-500">Giờ OT đã duyệt (gốc)</p>
                  <p className="text-lg font-bold text-gray-800">
                    {otPopupRecord.otHours ?? 0}h
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Lương OT hiện tại</p>
                  <p className="text-lg font-bold text-blue-700">
                    {fmt(otPopupRecord.otPay ?? 0)}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Giờ OT hiệu lực (sau điều chỉnh)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={otPopupForm.otHoursOverride}
                    onChange={(e) =>
                      setOtPopupForm({
                        ...otPopupForm,
                        otHoursOverride: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                  <span className="text-sm text-gray-500">giờ</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Ví dụ: NV làm 4h OT, tỉ lệ 1h OT = 1.5h → nhập 6h
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Công thức thưởng nhanh:
                </p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "×1", ratio: 1 },
                    { label: "×1.5 (OT thường)", ratio: 1.5 },
                    { label: "×2 (OT lễ)", ratio: 2 },
                    { label: "×3 (Lễ lớn)", ratio: 3 },
                  ].map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() =>
                        setOtPopupForm({
                          ...otPopupForm,
                          otHoursOverride: parseFloat(
                            ((otPopupRecord.otHours ?? 0) * q.ratio).toFixed(1),
                          ),
                          bonusDesc: `1 giờ OT = ${q.ratio} giờ thưởng`,
                        })
                      }
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-all"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Mô tả điều chỉnh
                </label>
                <input
                  type="text"
                  value={otPopupForm.bonusDesc}
                  onChange={(e) =>
                    setOtPopupForm({
                      ...otPopupForm,
                      bonusDesc: e.target.value,
                    })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="VD: 1 giờ OT ngày lễ = 2 giờ thưởng"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Ghi chú
                </label>
                <input
                  type="text"
                  value={otPopupForm.note}
                  onChange={(e) =>
                    setOtPopupForm({ ...otPopupForm, note: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ghi chú thêm..."
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setOtPopupRecord(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveOtAdjust}
                disabled={savingOt}
                className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingOt ? "Đang lưu..." : "Lưu điều chỉnh"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== Attendance Score Tab =================== */}
      {tab === "attendance" && (isAdmin || isSalaryManager) && (
        <AttendanceScore />
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
              const assignedCount =
                (p as any).usedByCount ??
                assignments.filter((a) => a.presetId === p.id).length;
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
                        {cfg.customExpression && (
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 text-indigo-700"
                            title={cfg.customExpression}
                          >
                            📐 Công thức tùy chỉnh
                          </span>
                        )}
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

                  {/* Formula preview */}
                  {(() => {
                    const cfg = parsePresetConfig(p.customFormula);
                    const expr =
                      cfg.customExpression ||
                      (cfg.formulaNodes?.length
                        ? nodesToExpression(cfg.formulaNodes)
                        : null);
                    if (!expr) return null;
                    return (
                      <div className="mt-2 bg-gray-50 rounded-lg p-2 border border-gray-100">
                        <p className="text-[10px] text-gray-400 mb-0.5">
                          Công thức:
                        </p>
                        <code className="text-[11px] text-gray-600 font-mono break-all">
                          {expr}
                        </code>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {/* Preset Form Modal - Drag & Drop Builder */}
          {showPresetForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {editingPresetId
                        ? "Sửa preset lương"
                        : "Tạo preset lương mới"}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Kéo thả các khối dữ liệu để xây dựng công thức tính lương
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPresetForm(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
                  {/* Row 1: Name + baseSalary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Tên preset *
                      </label>
                      <input
                        value={presetForm.name}
                        onChange={(e) =>
                          setPresetForm({ ...presetForm, name: e.target.value })
                        }
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="VD: Nhân viên fulltime"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Lương cơ bản / tháng (VNĐ) *
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
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="VD: 10000000"
                      />
                    </div>
                  </div>
                  {/* Row 2: hourlyRate + workDaysPerMonth */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Lương 1 giờ (VNĐ/h)
                      </label>
                      <input
                        type="number"
                        value={presetForm.hourlyRate || ""}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            hourlyRate: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder={
                          presetForm.baseSalary > 0
                            ? `Tự động: ${Math.round(presetForm.baseSalary / ((presetForm.workDaysPerMonth || 22) * 8)).toLocaleString()}đ/h`
                            : "VD: 25000"
                        }
                      />
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Để trống → tự tính từ lương tháng ÷ (
                        {presetForm.workDaysPerMonth || 22} ngày × 8h)
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Ngày công chuẩn / tháng
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={presetForm.workDaysPerMonth || ""}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            workDaysPerMonth: Number(e.target.value) || 22,
                          })
                        }
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="22"
                      />
                    </div>
                  </div>
                  {/* Row 3: description + allowances */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
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
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Mô tả ngắn cho preset này"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Phụ cấp cố định (VNĐ)
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
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* FORMULA BUILDER — Block mode / Text mode toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                        <Calculator className="w-3.5 h-3.5" /> Công thức tính
                        lương
                      </h3>
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setFormulaMode("blocks")}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${formulaMode === "blocks" ? "bg-white shadow text-emerald-700" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          🧩 Kéo thả
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormulaMode("text");
                            // Auto-fill expression from existing blocks
                            if (
                              formulaNodes.length > 0 &&
                              !presetForm.customExpression
                            ) {
                              setPresetForm((f) => ({
                                ...f,
                                customExpression:
                                  nodesToExpression(formulaNodes),
                              }));
                            }
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${formulaMode === "text" ? "bg-white shadow text-indigo-700" : "text-gray-500 hover:text-gray-700"}`}
                        >
                          ✏️ Nâng cao
                        </button>
                      </div>
                    </div>

                    {formulaMode === "blocks" ? (
                      <>
                        {/* Block palette */}
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-3">
                          <p className="text-[11px] text-gray-500 mb-2 font-medium">
                            Kho khối — kéo vào công thức bên dưới. Hover để xem
                            giải thích.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {FORMULA_BLOCKS.map((blk) => (
                              <div
                                key={blk.id}
                                draggable
                                onDragStart={() => {
                                  dragBlockRef.current = blk.id;
                                }}
                                className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing select-none hover:shadow-sm transition-all ${blockColorMap[blk.color]}`}
                              >
                                <GripVertical className="w-3 h-3 opacity-40" />
                                {blk.label}
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                                  <div className="font-semibold mb-0.5">
                                    {blk.label}
                                  </div>
                                  <div className="text-gray-300">
                                    {blk.desc}
                                  </div>
                                  <div className="text-emerald-300 mt-0.5">
                                    Ví dụ:{" "}
                                    {(SAMPLE_VARS[blk.id] ?? 0).toLocaleString(
                                      "vi-VN",
                                    )}
                                  </div>
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                              </div>
                            ))}
                            {/* Parentheses buttons */}
                            <button
                              type="button"
                              onClick={() =>
                                setFormulaNodes((prev) => [
                                  ...prev,
                                  {
                                    uid: `paren-open-${Date.now()}`,
                                    blockId: "(",
                                    operator: "+",
                                  },
                                ])
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 cursor-pointer"
                            >
                              (
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFormulaNodes((prev) => [
                                  ...prev,
                                  {
                                    uid: `paren-close-${Date.now()}`,
                                    blockId: ")",
                                    operator: "+",
                                  },
                                ])
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-bold text-gray-600 bg-white hover:bg-gray-50 cursor-pointer"
                            >
                              )
                            </button>
                            {/* Add custom variable button */}
                            <button
                              type="button"
                              onClick={() => setShowAddVar(true)}
                              className="px-2.5 py-1.5 rounded-lg border border-dashed border-indigo-300 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" /> Thêm biến
                            </button>
                          </div>

                          {/* Custom variable inline form */}
                          {showAddVar && (
                            <div className="mt-2 bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                              <p className="text-[11px] font-semibold text-indigo-700 mb-2">
                                Tạo biến tùy chỉnh
                              </p>
                              <div className="flex items-end gap-2 flex-wrap">
                                <div>
                                  <label className="text-[10px] text-gray-500 block">
                                    Tên biến *
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="VD: thuế, thưởng..."
                                    value={newVarForm.label}
                                    onChange={(e) =>
                                      setNewVarForm({
                                        ...newVarForm,
                                        label: e.target.value,
                                      })
                                    }
                                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-32 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block">
                                    Giá trị *
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="VD: 0.02 hoặc 500000"
                                    value={newVarForm.value}
                                    onChange={(e) =>
                                      setNewVarForm({
                                        ...newVarForm,
                                        value: e.target.value,
                                      })
                                    }
                                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-36 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block">
                                    Mô tả
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="VD: Thuế TNCN 2%"
                                    value={newVarForm.desc}
                                    onChange={(e) =>
                                      setNewVarForm({
                                        ...newVarForm,
                                        desc: e.target.value,
                                      })
                                    }
                                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-40 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={addCustomVar}
                                  className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700"
                                >
                                  Thêm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAddVar(false);
                                    setNewVarForm({
                                      label: "",
                                      value: "",
                                      desc: "",
                                    });
                                  }}
                                  className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Hủy
                                </button>
                              </div>
                              <p className="text-[10px] text-indigo-500 mt-1.5">
                                💡 Ví dụ: Thuế = 0.02 (2%), rồi dùng trong công
                                thức: <code>base_salary × thuế</code>
                              </p>
                            </div>
                          )}

                          {/* Custom vars list */}
                          {customVars.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="text-[10px] text-gray-400 self-center">
                                Biến tùy chỉnh:
                              </span>
                              {customVars.map((v) => (
                                <span
                                  key={v.id}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200"
                                >
                                  {v.label} = {v.value}
                                  <button
                                    type="button"
                                    onClick={() => removeCustomVar(v.id)}
                                    className="text-indigo-400 hover:text-red-500"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Drop zone */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverIndex(formulaNodes.length);
                          }}
                          onDragLeave={() => setDragOverIndex(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            const blockId = dragBlockRef.current;
                            if (!blockId) return;
                            setFormulaNodes((prev) => [
                              ...prev,
                              {
                                uid: `${blockId}-${Date.now()}`,
                                blockId,
                                operator: "+" as const,
                              },
                            ]);
                            setDragOverIndex(null);
                            dragBlockRef.current = null;
                          }}
                          className={`min-h-20 rounded-xl border-2 border-dashed p-3 transition-all ${dragOverIndex !== null ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}
                        >
                          {formulaNodes.length === 0 ? (
                            <div className="flex items-center justify-center h-16 text-sm text-gray-400">
                              Kéo khối dữ liệu vào đây để xây công thức...
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {formulaNodes.map((node, idx) => {
                                const blk = FORMULA_BLOCKS.find(
                                  (b) => b.id === node.blockId,
                                );
                                const isParen =
                                  node.blockId === "(" || node.blockId === ")";
                                return (
                                  <React.Fragment key={node.uid}>
                                    {idx > 0 &&
                                      !isParen &&
                                      node.blockId !== ")" &&
                                      formulaNodes[idx - 1]?.blockId !==
                                        "(" && (
                                        <select
                                          value={node.operator}
                                          onChange={(e) => {
                                            const op = e.target
                                              .value as FormulaNode["operator"];
                                            setFormulaNodes((prev) =>
                                              prev.map((n, i) =>
                                                i === idx
                                                  ? { ...n, operator: op }
                                                  : n,
                                              ),
                                            );
                                          }}
                                          className="w-10 text-center text-sm font-bold text-gray-700 border border-gray-300 rounded-lg py-1 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                        >
                                          <option value="+">+</option>
                                          <option value="-">−</option>
                                          <option value="×">×</option>
                                          <option value="÷">÷</option>
                                        </select>
                                      )}
                                    {isParen ? (
                                      <div className="flex items-center">
                                        <span className="text-lg font-bold text-gray-500 px-1">
                                          {node.blockId}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setFormulaNodes((prev) =>
                                              prev.filter((_, i) => i !== idx),
                                            )
                                          }
                                          className="text-gray-300 hover:text-red-400 ml-0.5"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div
                                        className={`group relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${blk ? blockColorMap[blk.color] : "bg-gray-100 text-gray-700 border-gray-200"}`}
                                      >
                                        <span>
                                          {blk?.label ?? node.blockId}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setFormulaNodes((prev) =>
                                              prev.filter((_, i) => i !== idx),
                                            )
                                          }
                                          className="ml-1 text-current opacity-50 hover:opacity-100"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                        {/* Hover tooltip */}
                                        {blk && (
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                            {blk.desc} ={" "}
                                            {(
                                              SAMPLE_VARS[blk.id] ?? 0
                                            ).toLocaleString("vi-VN")}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => setFormulaNodes([])}
                                className="ml-2 text-[10px] text-red-400 hover:text-red-600"
                              >
                                Xóa tất cả
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Validation error */}
                        {formulaNodes.length > 0 &&
                          validateFormula(formulaNodes) && (
                            <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                              ⚠️ {validateFormula(formulaNodes)}
                            </p>
                          )}

                        {/* Quick templates */}
                        <div className="mt-2">
                          <p className="text-[11px] text-gray-500 font-medium mb-1.5">
                            Mẫu công thức nhanh:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              {
                                label: "Theo giờ + OT",
                                nodes: [
                                  {
                                    uid: "wh-1",
                                    blockId: "working_hours",
                                    operator: "+" as const,
                                  },
                                  {
                                    uid: "hr-1",
                                    blockId: "hourly_rate",
                                    operator: "×" as const,
                                  },
                                  {
                                    uid: "oth-1",
                                    blockId: "ot_hours",
                                    operator: "+" as const,
                                  },
                                  {
                                    uid: "otm-1",
                                    blockId: "ot_multiplier",
                                    operator: "×" as const,
                                  },
                                  {
                                    uid: "hr-2",
                                    blockId: "hourly_rate",
                                    operator: "×" as const,
                                  },
                                ],
                              },
                              {
                                label: "Theo ngày công",
                                nodes: [
                                  {
                                    uid: "pd-1",
                                    blockId: "present_days",
                                    operator: "+" as const,
                                  },
                                  {
                                    uid: "dr-1",
                                    blockId: "daily_rate",
                                    operator: "×" as const,
                                  },
                                  {
                                    uid: "al-1",
                                    blockId: "allowances",
                                    operator: "+" as const,
                                  },
                                ],
                              },
                              {
                                label: "Cố định + phụ cấp",
                                nodes: [
                                  {
                                    uid: "bs-1",
                                    blockId: "base_salary",
                                    operator: "+" as const,
                                  },
                                  {
                                    uid: "al-2",
                                    blockId: "allowances",
                                    operator: "+" as const,
                                  },
                                  {
                                    uid: "ded-1",
                                    blockId: "deductions",
                                    operator: "-" as const,
                                  },
                                ],
                              },
                            ].map((tpl) => (
                              <button
                                key={tpl.label}
                                type="button"
                                onClick={() => setFormulaNodes(tpl.nodes)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
                              >
                                {tpl.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Auto-generated expression preview */}
                        {formulaNodes.length > 0 &&
                          !validateFormula(formulaNodes) && (
                            <div className="mt-2 bg-gray-50 rounded-lg p-2 border border-gray-200">
                              <p className="text-[10px] text-gray-400 mb-1">
                                Expression tự động:
                              </p>
                              <code className="text-xs text-gray-600 font-mono">
                                {nodesToExpression(formulaNodes)}
                              </code>
                            </div>
                          )}
                      </>
                    ) : (
                      /* TEXT mode — advanced */
                      <div>
                        <p className="text-[11px] text-gray-500 mb-2">
                          Nhập công thức dạng text. Hỗ trợ{" "}
                          <strong>+, -, *, /, ( )</strong>. Biến khả dụng:
                        </p>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {FORMULA_BLOCKS.map((blk) => (
                            <button
                              key={blk.id}
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(
                                  "custom-expr-input",
                                ) as HTMLInputElement;
                                if (el) {
                                  const pos =
                                    el.selectionStart ?? el.value.length;
                                  const val = el.value;
                                  const newVal =
                                    val.slice(0, pos) + blk.id + val.slice(pos);
                                  setPresetForm((f) => ({
                                    ...f,
                                    customExpression: newVal,
                                  }));
                                  setTimeout(() => {
                                    el.focus();
                                    el.setSelectionRange(
                                      pos + blk.id.length,
                                      pos + blk.id.length,
                                    );
                                  }, 0);
                                }
                              }}
                              className={`group relative px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer transition-all ${blockColorMap[blk.color]}`}
                            >
                              {blk.label}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                <code>{blk.id}</code> — {blk.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                        <input
                          id="custom-expr-input"
                          type="text"
                          placeholder="VD: working_hours * hourly_rate + ot_hours * ot_multiplier * hourly_rate"
                          value={presetForm.customExpression}
                          onChange={(e) =>
                            setPresetForm({
                              ...presetForm,
                              customExpression: e.target.value,
                            })
                          }
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                          {[
                            {
                              label: "Theo giờ + OT",
                              expr: "working_hours * hourly_rate + ot_hours * ot_multiplier * hourly_rate",
                            },
                            {
                              label: "Theo ngày công",
                              expr: "present_days * daily_rate + allowances",
                            },
                            {
                              label: "Cố định + phụ cấp",
                              expr: "base_salary + allowances - deductions",
                            },
                            {
                              label: "Giờ + OT (có ngoặc)",
                              expr: "(working_hours * hourly_rate) + (ot_hours * ot_multiplier * hourly_rate) + allowances - deductions",
                            },
                          ].map((tpl) => (
                            <button
                              key={tpl.label}
                              type="button"
                              onClick={() =>
                                setPresetForm({
                                  ...presetForm,
                                  customExpression: tpl.expr,
                                })
                              }
                              className="px-2.5 py-1 text-xs rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all"
                            >
                              {tpl.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LIVE PREVIEW — shows sample calculation result */}
                    {(() => {
                      const expr = getEffectiveExpression();
                      const previewResult = expr
                        ? evalExpressionPreview(expr)
                        : null;
                      if (previewResult === null) return null;
                      return (
                        <div className="mt-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                              📊 Xem trước kết quả (dữ liệu mẫu)
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="text-[11px] text-gray-600 space-y-0.5">
                              <div>
                                Giờ làm:{" "}
                                <strong>{SAMPLE_VARS.working_hours}h</strong> (
                                {(SAMPLE_VARS.working_hours / 8).toFixed(1)}{" "}
                                ngày)
                              </div>
                              <div>
                                Lương CB:{" "}
                                <strong>
                                  {SAMPLE_VARS.base_salary.toLocaleString(
                                    "vi-VN",
                                  )}
                                  đ
                                </strong>
                              </div>
                              <div>
                                Lương/giờ:{" "}
                                <strong>
                                  {Math.round(
                                    SAMPLE_VARS.hourly_rate,
                                  ).toLocaleString("vi-VN")}
                                  đ
                                </strong>
                              </div>
                            </div>
                            <div className="text-[11px] text-gray-600 space-y-0.5">
                              <div>
                                OT: <strong>{SAMPLE_VARS.ot_hours}h</strong> (×
                                {SAMPLE_VARS.ot_multiplier})
                              </div>
                              <div>
                                Phụ cấp:{" "}
                                <strong>
                                  {SAMPLE_VARS.allowances.toLocaleString(
                                    "vi-VN",
                                  )}
                                  đ
                                </strong>
                              </div>
                              <div>
                                Ngày trễ:{" "}
                                <strong>{SAMPLE_VARS.late_days}</strong>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-emerald-100">
                            <p className="text-xs text-gray-500 mb-1">
                              Nhân viên mẫu sẽ nhận:
                            </p>
                            <p className="text-2xl font-bold text-emerald-700">
                              {Math.round(previewResult).toLocaleString(
                                "vi-VN",
                              )}
                              đ
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1 font-mono">
                              {expr}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* PARAMS */}
                  <div className="border-t pt-4 grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Hệ số OT
                      </label>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {[1, 1.5, 2, 3].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              setPresetForm({ ...presetForm, otMultiplier: v })
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${presetForm.otMultiplier === v ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:border-blue-300"}`}
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
                          className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Phạt đi trễ / ngày
                      </label>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {[20000, 50000, 100000].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              setPresetForm({
                                ...presetForm,
                                latePenaltyPerDay: v,
                              })
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${presetForm.latePenaltyPerDay === v ? "bg-red-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:border-red-300"}`}
                          >
                            {(v / 1000).toFixed(0)}k
                          </button>
                        ))}
                        <input
                          type="number"
                          value={presetForm.latePenaltyPerDay}
                          onChange={(e) =>
                            setPresetForm({
                              ...presetForm,
                              latePenaltyPerDay: Number(e.target.value) || 0,
                            })
                          }
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:ring-2 focus:ring-red-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* FORMULA PREVIEW */}
                  {formulaNodes.length > 0 && (
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                      <p className="text-xs font-bold text-emerald-800 mb-2 uppercase tracking-wide">
                        Công thức đã xây:
                      </p>
                      <p className="text-sm font-mono text-gray-800 flex flex-wrap items-center gap-1">
                        {formulaNodes.map((node, idx) => {
                          const blk = FORMULA_BLOCKS.find(
                            (b) => b.id === node.blockId,
                          );
                          return (
                            <React.Fragment key={node.uid}>
                              {idx > 0 && (
                                <span className="text-emerald-700 font-bold px-1">
                                  {node.operator}
                                </span>
                              )}
                              <span className="bg-white border border-emerald-200 rounded px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                                {blk?.label ?? node.blockId}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </p>
                    </div>
                  )}

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
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
                  <button
                    onClick={() => setShowPresetForm(false)}
                    className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={savePreset}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all"
                  >
                    <Save className="w-4 h-4" />
                    {editingPresetId ? "Cập nhật preset" : "Tạo preset"}
                  </button>
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

          {/* Assign filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm tên, mã NV..."
                value={assignSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setAssignSearch(val);
                  if (assignSearchTimerRef.current)
                    clearTimeout(assignSearchTimerRef.current);
                  assignSearchTimerRef.current = setTimeout(() => {
                    setAssignPage(1);
                  }, 400);
                }}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
              {assignSearch && (
                <button
                  onClick={() => {
                    setAssignSearch("");
                    setAssignPage(1);
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
                value={assignDeptFilter}
                onChange={(e) => {
                  setAssignDeptFilter(e.target.value);
                  setAssignPage(1);
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
                value={assignPresetFilter}
                onChange={(e) => {
                  setAssignPresetFilter(e.target.value);
                  setAssignPage(1);
                }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              >
                <option value="">Tất cả preset</option>
                <option value="__none__">Chưa gán</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {(assignSearch || assignDeptFilter || assignPresetFilter) && (
              <button
                onClick={() => {
                  setAssignSearch("");
                  setAssignDeptFilter("");
                  setAssignPresetFilter("");
                  setAssignPage(1);
                }}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

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
                {employees
                  .filter((emp) => {
                    if (!assignPresetFilter) return true;
                    const current = assignments.find(
                      (a) => a.employeeId === emp.id,
                    );
                    if (assignPresetFilter === "__none__") return !current;
                    return current?.presetId === assignPresetFilter;
                  })
                  .map((emp) => {
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
                            onChange={(e) =>
                              handleAssign(emp.id, e.target.value)
                            }
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
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-gray-900">Hệ số lương</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowAddCoeff((v) => !v);
                    setAddCoeffForm({
                      type: "",
                      multiplier: "1",
                      description: "",
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm hệ số
                </button>
                <button
                  onClick={loadCoefficients}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  <Settings className="w-3.5 h-3.5" /> Làm mới
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Chỉnh hệ số nhân lương cho từng loại — nhấn <strong>Lưu</strong>{" "}
              để áp dụng.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 w-40">
                      Loại
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 w-36">
                      Hệ số (×)
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Mô tả
                    </th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 w-32">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* Add new row */}
                  {showAddCoeff && (
                    <tr className="bg-emerald-50 border-b-2 border-emerald-200">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={addCoeffForm.type}
                          onChange={(e) =>
                            setAddCoeffForm((f) => ({
                              ...f,
                              type: e.target.value,
                            }))
                          }
                          placeholder="vd: bonus_tet"
                          className="w-full border border-emerald-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">
                          Tên loại (không dấu)
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={addCoeffForm.multiplier}
                          onChange={(e) =>
                            setAddCoeffForm((f) => ({
                              ...f,
                              multiplier: e.target.value,
                            }))
                          }
                          className="w-20 text-center border border-emerald-300 rounded-lg px-2 py-1.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={addCoeffForm.description}
                          onChange={(e) =>
                            setAddCoeffForm((f) => ({
                              ...f,
                              description: e.target.value,
                            }))
                          }
                          placeholder="Mô tả..."
                          className="w-full border border-emerald-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={handleAddCoefficient}
                            disabled={savingNewCoeff}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {savingNewCoeff ? "..." : "Thêm"}
                          </button>
                          <button
                            onClick={() => setShowAddCoeff(false)}
                            className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {coefficients.length === 0 && !showAddCoeff ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="text-center py-8 text-gray-400"
                      >
                        Chưa có hệ số nào. Nhấn <strong>Thêm hệ số</strong> để
                        tạo mới.
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
                      const edit = coeffEditMap[coeff.type] || {
                        multiplier: String(coeff.multiplier),
                        description: coeff.description || "",
                      };
                      const dirty =
                        edit.multiplier !== String(coeff.multiplier) ||
                        edit.description !== (coeff.description || "");
                      const isDeleting = deletingCoeff === coeff.type;
                      return (
                        <tr key={coeff.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {typeLabels[coeff.type] || coeff.type}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={edit.multiplier}
                              onChange={(e) =>
                                setCoeffEditMap((m) => ({
                                  ...m,
                                  [coeff.type]: {
                                    ...edit,
                                    multiplier: e.target.value,
                                  },
                                }))
                              }
                              className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={edit.description}
                              onChange={(e) =>
                                setCoeffEditMap((m) => ({
                                  ...m,
                                  [coeff.type]: {
                                    ...edit,
                                    description: e.target.value,
                                  },
                                }))
                              }
                              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                              placeholder="Mô tả..."
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() =>
                                  handleSaveCoefficient(coeff.type)
                                }
                                disabled={savingCoeff === coeff.type || !dirty}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dirty ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                              >
                                {savingCoeff === coeff.type ? "..." : "Lưu"}
                              </button>
                              {isDeleting ? (
                                <>
                                  <button
                                    onClick={() =>
                                      handleDeleteCoefficient(coeff.type)
                                    }
                                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
                                  >
                                    Xác nhận
                                  </button>
                                  <button
                                    onClick={() => setDeletingCoeff(null)}
                                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                                  >
                                    Hủy
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setDeletingCoeff(coeff.type)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Xóa hệ số này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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

      {/* =================== Rules Tab =================== */}
      {tab === "rules" && (isAdmin || isSalaryManager) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Ràng buộc tính lương
              </h3>
              <p className="text-sm text-gray-500">
                Cấu hình chính sách đi trễ, giờ tối thiểu, phạt tái phạm. Các
                rule sẽ tự động áp dụng khi tính lương.
              </p>
            </div>
            <button
              onClick={openAddRule}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Thêm Rule
            </button>
          </div>

          {/* Rule cards */}
          {payrollRules.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Chưa có rule nào. Nhấn &quot;Thêm Rule&quot; để tạo.</p>
            </div>
          )}

          <div className="space-y-3">
            {payrollRules.map((rule) => {
              const meta = RULE_TYPE_META[rule.rule_type];
              const cfg = rule.config || {};
              return (
                <div
                  key={rule.id}
                  className={`border rounded-xl p-4 ${rule.is_active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta?.color || "text-gray-600 bg-gray-50 border-gray-200"}`}
                        >
                          {meta?.label || rule.rule_type}
                        </span>
                        <span className="text-sm font-bold text-gray-800">
                          {rule.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${rule.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {rule.is_active ? "BẬT" : "TẮT"}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-gray-500 mb-2">
                          {rule.description}
                        </p>
                      )}

                      {/* Config summary */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        {rule.rule_type === "late_policy" && (
                          <>
                            <span>
                              Ân hạn:{" "}
                              <strong>
                                {String(cfg.grace_minutes ?? 0)} phút
                              </strong>
                            </span>
                            <span>
                              Quy đổi:{" "}
                              <strong>
                                ×{String(cfg.conversion_rate ?? 1)}
                              </strong>
                            </span>
                          </>
                        )}
                        {rule.rule_type === "min_hours_policy" && (
                          <>
                            <span>
                              Giờ tối thiểu:{" "}
                              <strong>
                                {String(cfg.required_hours ?? 160)}h
                              </strong>
                            </span>
                            <span>
                              Hệ số phạt:{" "}
                              <strong>
                                ×{String(cfg.penalty_rate ?? 0.7)}
                              </strong>{" "}
                              (giảm{" "}
                              {Math.round(
                                (1 - Number(cfg.penalty_rate ?? 0.7)) * 100,
                              )}
                              %)
                            </span>
                          </>
                        )}
                        {rule.rule_type === "repeat_late_policy" && (
                          <>
                            <span>
                              Ngưỡng:{" "}
                              <strong>
                                {String(cfg.max_late_count ?? 5)} lần
                              </strong>
                            </span>
                            <span>
                              Phạt:{" "}
                              <strong>
                                {cfg.penalty_type === "percentage"
                                  ? `${(Number(cfg.penalty_percentage ?? 0) * 100).toFixed(0)}%`
                                  : `${Number(cfg.penalty_amount ?? 0).toLocaleString("vi-VN")}đ`}
                              </strong>
                            </span>
                          </>
                        )}
                        <span className="text-gray-400">
                          Ưu tiên: {rule.priority}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => toggleRule(rule)}
                        className={`px-2.5 py-1 text-xs rounded-lg border ${rule.is_active ? "border-orange-200 text-orange-600 hover:bg-orange-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                      >
                        {rule.is_active ? "Tắt" : "Bật"}
                      </button>
                      <button
                        onClick={() => openEditRule(rule)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rule form modal */}
          {showRuleForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl flex items-center justify-between">
                  <h3 className="text-lg font-bold">
                    {editingRule ? "Sửa Rule" : "Thêm Rule mới"}
                  </h3>
                  <button
                    onClick={() => setShowRuleForm(false)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {/* Rule type */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Loại rule
                    </label>
                    <select
                      value={ruleForm.rule_type}
                      onChange={(e) =>
                        setRuleForm({
                          ...ruleForm,
                          rule_type: e.target.value,
                          config: {},
                        })
                      }
                      disabled={!!editingRule}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {Object.entries(RULE_TYPE_META).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Tên rule *
                    </label>
                    <input
                      type="text"
                      value={ruleForm.name}
                      onChange={(e) =>
                        setRuleForm({ ...ruleForm, name: e.target.value })
                      }
                      placeholder="VD: Chính sách đi trễ công ty"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Mô tả
                    </label>
                    <textarea
                      value={ruleForm.description}
                      onChange={(e) =>
                        setRuleForm({
                          ...ruleForm,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Priority + Active */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Ưu tiên (nhỏ = chạy trước)
                      </label>
                      <input
                        type="number"
                        value={ruleForm.priority}
                        onChange={(e) =>
                          setRuleForm({
                            ...ruleForm,
                            priority: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleForm.is_active}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              is_active: e.target.checked,
                            })
                          }
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">Kích hoạt</span>
                      </label>
                    </div>
                  </div>

                  {/* Dynamic config fields */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">
                      Cấu hình
                    </h4>
                    <div className="space-y-3">
                      {(RULE_TYPE_META[ruleForm.rule_type]?.fields || []).map(
                        (field) => (
                          <div key={field.key}>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">
                              {field.label}
                            </label>
                            {field.type === "select" &&
                            field.key === "penalty_type" ? (
                              <select
                                value={String(
                                  ruleForm.config[field.key] || "fixed",
                                )}
                                onChange={(e) =>
                                  setRuleForm({
                                    ...ruleForm,
                                    config: {
                                      ...ruleForm.config,
                                      [field.key]: e.target.value,
                                    },
                                  })
                                }
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="fixed">Cố định (VNĐ)</option>
                                <option value="percentage">
                                  Phần trăm (%)
                                </option>
                              </select>
                            ) : (
                              <input
                                type={field.type}
                                step={field.step}
                                value={String(ruleForm.config[field.key] ?? "")}
                                onChange={(e) => {
                                  const val =
                                    field.type === "number"
                                      ? e.target.value === ""
                                        ? ""
                                        : parseFloat(e.target.value)
                                      : e.target.value;
                                  setRuleForm({
                                    ...ruleForm,
                                    config: {
                                      ...ruleForm.config,
                                      [field.key]: val,
                                    },
                                  });
                                }}
                                placeholder={field.placeholder}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  {/* Explanation */}
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                    {ruleForm.rule_type === "late_policy" && (
                      <div>
                        <strong>Cách hoạt động:</strong> Mỗi ngày đi trễ, trừ đi
                        ân hạn ({String(ruleForm.config.grace_minutes || 0)}{" "}
                        phút), phần còn lại quy đổi thành giờ bị trừ (×
                        {String(ruleForm.config.conversion_rate || 1)}).
                        <br />
                        <br />
                        <strong>VD:</strong> Trễ 35 phút, ân hạn 5 phút →
                        (35-5)/60 ×{" "}
                        {String(ruleForm.config.conversion_rate || 1)} ={" "}
                        {(
                          (Math.max(
                            0,
                            35 - Number(ruleForm.config.grace_minutes || 0),
                          ) /
                            60) *
                          Number(ruleForm.config.conversion_rate || 1)
                        ).toFixed(2)}
                        h bị trừ
                      </div>
                    )}
                    {ruleForm.rule_type === "min_hours_policy" && (
                      <div>
                        <strong>Cách hoạt động:</strong> Nếu giờ làm hiệu dụng
                        &lt; {String(ruleForm.config.required_hours || 160)}h,
                        lương sẽ nhân hệ số{" "}
                        {String(ruleForm.config.penalty_rate || 0.7)} (giảm{" "}
                        {Math.round(
                          (1 - Number(ruleForm.config.penalty_rate || 0.7)) *
                            100,
                        )}
                        %).
                        <br />
                        <br />
                        <strong>VD:</strong> Lương gross 10M, chỉ làm 120h/
                        {String(ruleForm.config.required_hours || 160)}h → lương
                        = 10M × {String(ruleForm.config.penalty_rate || 0.7)} ={" "}
                        {(
                          10000000 * Number(ruleForm.config.penalty_rate || 0.7)
                        ).toLocaleString("vi-VN")}
                        đ
                      </div>
                    )}
                    {ruleForm.rule_type === "repeat_late_policy" && (
                      <div>
                        <strong>Cách hoạt động:</strong> Nếu đi trễ &gt;{" "}
                        {String(ruleForm.config.max_late_count || 5)} lần/tháng,
                        phạt thêm{" "}
                        {ruleForm.config.penalty_type === "percentage"
                          ? `${(Number(ruleForm.config.penalty_percentage || 0) * 100).toFixed(0)}% lương`
                          : `${Number(ruleForm.config.penalty_amount || 0).toLocaleString("vi-VN")}đ`}
                        .
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveRule}
                      className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
                    >
                      <Save className="w-4 h-4 inline mr-1" />{" "}
                      {editingRule ? "Cập nhật" : "Tạo Rule"}
                    </button>
                    <button
                      onClick={() => setShowRuleForm(false)}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
            <strong>💡 Luồng tính lương khi có rule:</strong>
            <ol className="mt-2 space-y-1 list-decimal list-inside">
              <li>Lấy giờ làm thực tế (working_hours)</li>
              <li>
                <strong>Áp dụng late_policy</strong> → ra giờ hiệu dụng
                (effective_hours = working_hours - late_deduction)
              </li>
              <li>
                Tính lương cơ bản từ effective_hours (thay vì working_hours)
              </li>
              <li>
                <strong>Áp dụng min_hours_policy</strong> → giảm lương nếu dưới
                ngưỡng
              </li>
              <li>
                <strong>Áp dụng repeat_late_policy</strong> → phạt thêm nếu trễ
                nhiều lần
              </li>
              <li>Trừ khấu trừ, phạt vi phạm → ra net salary</li>
            </ol>
          </div>
        </div>
      )}

      {/* =================== Deductions Tab =================== */}
      {tab === "deductions" && (isAdmin || isSalaryManager) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                Khoản khấu trừ
              </h3>
              <p className="text-sm text-gray-500">
                Cấu hình thuế, BHXH, BHYT, phí công đoàn và các khoản trừ tự
                động áp dụng khi tính lương. Các khoản này{" "}
                <strong>không ảnh hưởng lương trước thuế (gross)</strong>.
              </p>
            </div>
            <button
              onClick={openAddDeduction}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Thêm khoản trừ
            </button>
          </div>

          {/* Deduction cards */}
          {deductionItems.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>
                Chưa có khoản khấu trừ nào. Nhấn &quot;Thêm khoản trừ&quot; để
                tạo.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {deductionItems.map((item) => {
              const meta =
                DEDUCTION_TYPE_META[item.type] || DEDUCTION_TYPE_META.custom;
              return (
                <div
                  key={item.id}
                  className={`border rounded-xl p-4 ${item.isActive ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-sm font-bold text-gray-800">
                          {item.name}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${item.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {item.isActive ? "BẬT" : "TẮT"}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-500 mb-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                        <span>
                          Cách tính:{" "}
                          <strong>
                            {item.calcType === "percentage"
                              ? "Phần trăm"
                              : "Cố định"}
                          </strong>
                        </span>
                        {item.calcType === "percentage" ? (
                          <span>
                            Tỷ lệ:{" "}
                            <strong>{(item.rate * 100).toFixed(1)}%</strong>{" "}
                            lương gross
                          </span>
                        ) : (
                          <span>
                            Số tiền:{" "}
                            <strong>
                              {item.amount.toLocaleString("vi-VN")}đ
                            </strong>
                          </span>
                        )}
                        <span className="text-gray-400">
                          Ưu tiên: {item.priority}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => toggleDeductionItem(item)}
                        className={`px-2.5 py-1 text-xs rounded-lg border ${item.isActive ? "border-orange-200 text-orange-600 hover:bg-orange-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                      >
                        {item.isActive ? "Tắt" : "Bật"}
                      </button>
                      <button
                        onClick={() => openEditDeduction(item)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteDeductionItem(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deduction form modal */}
          {showDeductionForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-2xl flex items-center justify-between">
                  <h3 className="text-lg font-bold">
                    {editingDeduction ? "Sửa khoản trừ" : "Thêm khoản trừ mới"}
                  </h3>
                  <button
                    onClick={() => setShowDeductionForm(false)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  {/* Name */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Tên khoản trừ *
                    </label>
                    <input
                      type="text"
                      value={deductionForm.name}
                      onChange={(e) =>
                        setDeductionForm({
                          ...deductionForm,
                          name: e.target.value,
                        })
                      }
                      placeholder="VD: BHXH (8%)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Loại
                    </label>
                    <select
                      value={deductionForm.type}
                      onChange={(e) =>
                        setDeductionForm({
                          ...deductionForm,
                          type: e.target.value,
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {Object.entries(DEDUCTION_TYPE_META).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Calc type */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Cách tính
                    </label>
                    <select
                      value={deductionForm.calc_type}
                      onChange={(e) =>
                        setDeductionForm({
                          ...deductionForm,
                          calc_type: e.target.value,
                        })
                      }
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="percentage">
                        Phần trăm lương gross (%)
                      </option>
                      <option value="fixed">Cố định (VNĐ)</option>
                    </select>
                  </div>

                  {/* Amount or Rate */}
                  {deductionForm.calc_type === "percentage" ? (
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Tỷ lệ (VD: 0.08 = 8%)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={deductionForm.rate}
                        onChange={(e) =>
                          setDeductionForm({
                            ...deductionForm,
                            rate: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0.08"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        = {(deductionForm.rate * 100).toFixed(1)}% lương gross
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Số tiền (VNĐ)
                      </label>
                      <input
                        type="number"
                        step="10000"
                        value={deductionForm.amount}
                        onChange={(e) =>
                          setDeductionForm({
                            ...deductionForm,
                            amount: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="500000"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      Mô tả
                    </label>
                    <textarea
                      value={deductionForm.description}
                      onChange={(e) =>
                        setDeductionForm({
                          ...deductionForm,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  {/* Priority + Active */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Ưu tiên (nhỏ = trước)
                      </label>
                      <input
                        type="number"
                        value={deductionForm.priority}
                        onChange={(e) =>
                          setDeductionForm({
                            ...deductionForm,
                            priority: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deductionForm.is_active}
                          onChange={(e) =>
                            setDeductionForm({
                              ...deductionForm,
                              is_active: e.target.checked,
                            })
                          }
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">Kích hoạt</span>
                      </label>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                    <strong>Xem trước:</strong> Với lương gross 10,000,000đ →{" "}
                    {deductionForm.calc_type === "percentage"
                      ? `trừ ${(10000000 * deductionForm.rate).toLocaleString("vi-VN")}đ (${(deductionForm.rate * 100).toFixed(1)}%)`
                      : `trừ ${deductionForm.amount.toLocaleString("vi-VN")}đ (cố định)`}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={saveDeductionItem}
                      className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
                    >
                      <Save className="w-4 h-4 inline mr-1" />{" "}
                      {editingDeduction ? "Cập nhật" : "Tạo"}
                    </button>
                    <button
                      onClick={() => setShowDeductionForm(false)}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
            <strong>Cách hoạt động:</strong>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                Các khoản khấu trừ nằm ở <strong>Phase 3 (Deductions)</strong>{" "}
                của Salary Engine
              </li>
              <li>
                Chúng{" "}
                <strong>KHÔNG làm thay đổi lương trước thuế (gross)</strong>
              </li>
              <li>
                Công thức:{" "}
                <strong>Net = Gross - Thuế - BHXH - BHYT - Phạt - ...</strong>
              </li>
              <li>
                Khoản trừ % sẽ tính trên gross đã qua rule adjustment (sau
                min_hours_policy)
              </li>
            </ul>
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

