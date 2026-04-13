"use client";
import {
  Calculator,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { showToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { buildApiUrl } from "../services/api";
import {
  calculateSalary,
  getDepartments,
  getSalaryRecordsPaginated,
} from "../store/storage";
import type { SalaryRecord } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JspInstance = any;

// Raw row from API (snake_case from MySQL)
interface RawRow {
  employee_code?: string;
  employee_name?: string;
  department?: string;
  position?: string;
  present_days?: number;
  ot_hours?: number;
  base_salary?: number;
  allowances?: number;
  late_penalty?: number;
  deductions?: number;
  gross_salary?: number;
  net_salary?: number;
  [k: string]: unknown;
}

export default function SalaryManagement() {
  const { isSalaryManager, isAdmin } = useAuth();
  const canManage = isAdmin || isSalaryManager;

  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [jspReady, setJspReady] = useState(false);
  const [rowCount, setRowCount] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const jspRef = useRef<JspInstance>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jspFnRef = useRef<any>(null);

  useEffect(() => {
    getDepartments().then((d: { name: string }[]) =>
      setDepartments(d.map((x) => x.name)),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSalaryRecordsPaginated({
        month,
        page: "1",
        limit: "5000",
        dept: deptFilter,
        sortBy: "employee_name",
        sortDir: "asc",
      });
      setRecords(res.data);
    } catch {
      showToast("error", "Lỗi", "Không thể tải dữ liệu lương");
    } finally {
      setLoading(false);
    }
  }, [month, deptFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Initialize / reinitialize jspreadsheet whenever data changes
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const init = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = (await import("jspreadsheet-ce")) as any;
      const jspreadsheet = mod.default ?? mod;
      jspFnRef.current = jspreadsheet;
      if (cancelled || !containerRef.current) return;

      // Destroy existing instance
      if (containerRef.current) {
        try {
          jspreadsheet.destroy(containerRef.current);
        } catch {
          /* ignore */
        }
      }
      jspRef.current = null;
      // jspreadsheet appends children; clear manually
      containerRef.current.innerHTML = "";
      if (cancelled || !containerRef.current) return;

      const raw = records as unknown as RawRow[];

      // Build data rows. Empty spreadsheet shows 20 blank rows.
      const data: (string | number)[][] =
        raw.length > 0
          ? raw.map((r, i) => [
              i + 1,
              r.employee_code ?? "",
              r.employee_name ?? "",
              r.department ?? "",
              r.position ?? "",
              r.present_days ?? 0,
              r.ot_hours ?? 0,
              r.base_salary ?? 0,
              r.allowances ?? 0,
              r.late_penalty ?? 0,
              r.deductions ?? 0,
              r.gross_salary ?? 0,
              r.net_salary ?? 0,
            ])
          : Array.from({ length: 20 }, (_, i) => [
              i + 1,
              "",
              "",
              "",
              "",
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
            ]);

      jspRef.current = jspreadsheet(containerRef.current, {
        worksheets: [
          {
            data,
            minDimensions: [13, Math.max(data.length, 20)],
            columns: [
              {
                type: "numeric",
                title: "STT",
                width: 50,
                readOnly: true,
                align: "center",
              },
              { type: "text", title: "Mã NV", width: 85 },
              { type: "text", title: "Họ tên", width: 165 },
              { type: "text", title: "Phòng ban", width: 125 },
              { type: "text", title: "Chức vụ", width: 115 },
              {
                type: "numeric",
                title: "Ngày công",
                width: 90,
                mask: "#,##0",
                align: "center",
              },
              {
                type: "numeric",
                title: "Giờ OT",
                width: 80,
                mask: "#,##0.0",
                align: "center",
              },
              { type: "numeric", title: "Lương CB", width: 125, mask: "#,##0" },
              { type: "numeric", title: "Phụ cấp", width: 115, mask: "#,##0" },
              { type: "numeric", title: "Phạt trễ", width: 115, mask: "#,##0" },
              { type: "numeric", title: "Khấu trừ", width: 115, mask: "#,##0" },
              {
                type: "numeric",
                title: "Lương gross",
                width: 130,
                mask: "#,##0",
              },
              {
                type: "numeric",
                title: "Lương ròng",
                width: 130,
                mask: "#,##0",
              },
            ],
            allowInsertColumn: true,
            allowDeleteColumn: true,
            allowInsertRow: true,
            allowDeleteRow: true,
            columnSorting: true,
            columnDrag: true,
            columnResize: true,
            rowDrag: true,
            rowResize: true,
            search: true,
            pagination: 50,
            paginationOptions: [20, 50, 100, 500],
            tableOverflow: true,
            tableWidth: "100%",
            tableHeight: "calc(100vh - 260px)",
            freezeColumns: 3,
            defaultColAlign: "right",
          },
        ],
      });

      setJspReady(true);
      setRowCount(data.length);
    };

    init();

    return () => {
      cancelled = true;
      if (containerRef.current && jspFnRef.current) {
        try {
          jspFnRef.current.destroy(containerRef.current);
        } catch {
          /* ignore */
        }
      }
      jspRef.current = null;
    };
  }, [records]);

  async function handleCalculate() {
    if (!canManage) return;
    setCalculating(true);
    try {
      await calculateSalary(month);
      showToast(
        "success",
        "Xong",
        `Đã tính lương tháng ${month} từ chấm công & vi phạm`,
      );
      await load();
    } catch (e: unknown) {
      showToast(
        "error",
        "Lỗi",
        e instanceof Error ? e.message : "Lỗi tính lương",
      );
    } finally {
      setCalculating(false);
    }
  }

  async function handleExportXlsx() {
    setExporting(true);
    try {
      const url = buildApiUrl(`/export-payroll?month=${month}`);
      const token = localStorage.getItem("auth_token");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Lỗi xuất file");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bang-luong-${month}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      showToast("error", "Lỗi", "Không thể xuất Excel");
    } finally {
      setExporting(false);
    }
  }

  function handleDownloadCsv() {
    if (!containerRef.current || !jspFnRef.current) return;
    // v4: get worksheet then call download
    try {
      const ws =
        jspFnRef.current.getWorksheetInstance?.(containerRef.current, 0) ??
        jspRef.current?.[0];
      ws?.download?.();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <FileSpreadsheet className="w-7 h-7 text-green-600 shrink-0" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">Bảng lương</h1>
          <p className="text-xs text-gray-500">
            Bảng tính Excel — công thức, thêm/xoá cột-hàng, kéo thả, tìm kiếm
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 mb-2 flex flex-wrap gap-2 items-center shadow-sm">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </button>

        <span className="hidden md:block text-xs text-gray-400 italic bg-yellow-50 border border-yellow-200 rounded px-2 py-1">
          💡 Nhập <code className="font-mono">= </code> để dùng công
          thức&nbsp;·&nbsp; Chuột phải để thêm/xoá cột/hàng&nbsp;·&nbsp;Kéo thả
          để sắp xếp
        </span>

        {jspReady && rowCount > 0 && (
          <span className="text-xs text-gray-500">{rowCount} nhân viên</span>
        )}

        <div className="flex-1" />

        {canManage && (
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calculator className="w-4 h-4" />
            )}
            Tính lương
          </button>
        )}

        <button
          onClick={handleDownloadCsv}
          disabled={!jspReady}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          CSV
        </button>

        <button
          onClick={handleExportXlsx}
          disabled={exporting || records.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Xuất Excel (.xlsx)
        </button>
      </div>

      {/* Spreadsheet */}
      <div
        className="relative bg-white rounded-xl border border-gray-300 shadow-sm"
        style={{ height: "calc(100vh - 160px)", overflow: "hidden" }}
      >
        {loading && records.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-sm text-gray-500">Đang tải dữ liệu...</span>
            </div>
          </div>
        )}
        {!loading && records.length === 0 && jspReady && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 pointer-events-none">
            Chưa có dữ liệu tháng {month}.{" "}
            {canManage && 'Nhấn "Tính lương" để tính từ dữ liệu chấm công.'}
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
