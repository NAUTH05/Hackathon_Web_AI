"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit2,
  FileSpreadsheet,
  GripVertical,
  Plus,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import { showToast } from "../components/Toast";
import { buildApiUrl } from "../services/api";
import type { ExportField, ExportTemplate } from "../store/storage";
import {
  createExportTemplate,
  deleteExportTemplate,
  getExportFields,
  getExportTemplates,
  setDefaultTemplate,
  updateExportTemplate,
} from "../store/storage";

interface ColumnConfig {
  field: string;
  header: string;
  width: number;
  format: string;
}

interface Props {
  selectedMonth: string;
  onClose?: () => void;
}

export default function ExportTemplateBuilder({
  selectedMonth,
  onClose,
}: Props) {
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [availableFields, setAvailableFields] = useState<ExportField[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<ExportTemplate | null>(
    null,
  );

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<ColumnConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [tpls, fields] = await Promise.all([
        getExportTemplates(),
        getExportFields(),
      ]);
      setTemplates(tpls);
      setAvailableFields(fields);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNewForm() {
    setEditingTemplate(null);
    setFormName("");
    setFormDesc("");
    setSelectedColumns([
      { field: "stt", header: "STT", width: 6, format: "number" },
      { field: "employee_code", header: "Mã NV", width: 14, format: "text" },
      { field: "employee_name", header: "Họ tên", width: 28, format: "text" },
      { field: "department", header: "Phòng ban", width: 20, format: "text" },
      {
        field: "net_salary",
        header: "Lương ròng",
        width: 18,
        format: "currency",
      },
    ]);
    setShowForm(true);
  }

  function openEditForm(t: ExportTemplate) {
    setEditingTemplate(t);
    setFormName(t.name);
    setFormDesc(t.description || "");
    const config =
      typeof t.columnConfig === "string"
        ? JSON.parse(t.columnConfig as unknown as string)
        : t.columnConfig;
    setSelectedColumns(config?.columns || []);
    setShowForm(true);
  }

  function addColumn(field: ExportField) {
    if (selectedColumns.some((c) => c.field === field.field)) return;
    setSelectedColumns([
      ...selectedColumns,
      {
        field: field.field,
        header: field.label,
        width:
          field.format === "currency" ? 16 : field.format === "text" ? 20 : 12,
        format: field.format,
      },
    ]);
  }

  function removeColumn(index: number) {
    setSelectedColumns(selectedColumns.filter((_, i) => i !== index));
  }

  function updateColumnHeader(index: number, header: string) {
    const updated = [...selectedColumns];
    updated[index] = { ...updated[index], header };
    setSelectedColumns(updated);
  }

  function updateColumnWidth(index: number, width: number) {
    const updated = [...selectedColumns];
    updated[index] = { ...updated[index], width };
    setSelectedColumns(updated);
  }

  function updateColumnFormat(index: number, format: string) {
    const updated = [...selectedColumns];
    updated[index] = { ...updated[index], format };
    setSelectedColumns(updated);
  }

  // Drag and drop reorder
  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...selectedColumns];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    setSelectedColumns(updated);
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  async function handleSave() {
    if (!formName.trim()) {
      showToast("warning", "Thiếu tên", "Vui lòng nhập tên mẫu");
      return;
    }
    if (selectedColumns.length === 0) {
      showToast("warning", "Thiếu cột", "Chọn ít nhất 1 cột");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formName,
        description: formDesc,
        columnConfig: { columns: selectedColumns },
      };
      if (editingTemplate) {
        await updateExportTemplate(editingTemplate.id, payload);
        showToast("success", "Đã cập nhật", `Mẫu "${formName}" đã được lưu`);
      } else {
        await createExportTemplate(payload);
        showToast("success", "Đã tạo", `Mẫu "${formName}" đã được tạo`);
      }
      setShowForm(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi", msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleteId(null);
    try {
      await deleteExportTemplate(id);
      showToast("success", "Đã xóa", "Mẫu xuất đã được xóa");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi", msg);
    }
  }

  async function handleExport(templateId?: string) {
    try {
      const token = localStorage.getItem("auth_token");
      let url = buildApiUrl(`/export-payroll?month=${selectedMonth}`);
      if (templateId) url += `&templateId=${templateId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `bang-luong-${selectedMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      showToast("success", "Đã xuất", "File Excel đã được tải xuống");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi xuất", msg);
    }
  }

  // Available fields not yet selected
  const unusedFields = availableFields.filter(
    (f) => !selectedColumns.some((c) => c.field === f.field),
  );

  const formatBadge: Record<string, { label: string; style: string }> = {
    text: { label: "Chữ", style: "bg-blue-100 text-blue-700" },
    number: { label: "Số", style: "bg-purple-100 text-purple-700" },
    currency: { label: "Tiền", style: "bg-emerald-100 text-emerald-700" },
    decimal: { label: "Thập phân", style: "bg-cyan-100 text-cyan-700" },
    percent: { label: "Phần trăm", style: "bg-amber-100 text-amber-700" },
    date: { label: "Ngày", style: "bg-rose-100 text-rose-700" },
    General: { label: "Chung", style: "bg-gray-100 text-gray-600" },
  };

  const FORMAT_OPTIONS = [
    { value: "text", label: "Chữ (Text)" },
    { value: "General", label: "Chung (General)" },
    { value: "number", label: "Số nguyên (0)" },
    { value: "decimal", label: "Thập phân (#,##0.00)" },
    { value: "currency", label: "Tiền (#,##0)" },
    { value: "percent", label: "Phần trăm (0.00%)" },
    { value: "date", label: "Ngày (dd/mm/yyyy)" },
  ];

  async function handleSetDefault(id: string) {
    try {
      await setDefaultTemplate(id);
      showToast("success", "Đã chọn mặc định", "Mẫu đã được đặt làm mặc định");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      showToast("error", "Lỗi", msg);
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Mẫu xuất Excel
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Tạo và quản lý mẫu xuất bảng lương tháng {selectedMonth}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openNewForm}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" /> Tạo mẫu mới
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Template List + Quick Export */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Custom templates */}
          {templates.map((t) => (
            <div
              key={t.id}
              className={`bg-white rounded-xl p-5 hover:shadow-md transition-shadow ${t.isDefault ? "border-2 border-blue-200" : "border border-gray-200"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.isDefault ? "bg-blue-100" : "bg-emerald-100"}`}
                  >
                    <FileSpreadsheet
                      className={`w-4 h-4 ${t.isDefault ? "text-blue-600" : "text-emerald-600"}`}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {t.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {(() => {
                        const config =
                          typeof t.columnConfig === "string"
                            ? JSON.parse(t.columnConfig as unknown as string)
                            : t.columnConfig;
                        return `${config?.columns?.length || 0} cột`;
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {t.isDefault ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      Mặc định
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetDefault(t.id)}
                      title="Đặt làm mặc định"
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-500"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openEditForm(t)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!t.isDefault && (
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {t.description && (
                <p className="text-xs text-gray-500 mb-3">{t.description}</p>
              )}
              <button
                onClick={() => handleExport(t.id)}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  t.isDefault
                    ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                }`}
              >
                <Download className="w-4 h-4" /> Xuất Excel
              </button>
            </div>
          ))}
        </div>

        {/* Column Builder Form (Modal) */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingTemplate
                    ? `Sửa: ${editingTemplate.name}`
                    : "Tạo mẫu xuất mới"}
                </h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-1 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Name + Desc */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tên mẫu *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="VD: Payroll Finance"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mô tả
                    </label>
                    <input
                      type="text"
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Cho phòng kế toán"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {/* Two-column picker */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Available fields */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      Cột có sẵn
                      <span className="text-xs text-gray-400 font-normal">
                        ({unusedFields.length})
                      </span>
                    </h4>
                    <div className="border border-gray-200 rounded-xl bg-gray-50 p-2 space-y-1 max-h-[340px] overflow-y-auto">
                      {unusedFields.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                          Đã chọn hết
                        </p>
                      ) : (
                        unusedFields.map((f) => (
                          <button
                            key={f.field}
                            onClick={() => addColumn(f)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm text-left transition-all group"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${formatBadge[f.format]?.style || "bg-gray-100 text-gray-600"}`}
                              >
                                {formatBadge[f.format]?.label || f.format}
                              </span>
                              <span className="text-sm text-gray-700">
                                {f.label}
                              </span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Selected columns - drag to reorder */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      Cột đã chọn
                      <span className="text-xs text-gray-400 font-normal">
                        ({selectedColumns.length})
                      </span>
                    </h4>
                    <div className="border border-blue-200 rounded-xl bg-blue-50/30 p-2 space-y-1 max-h-[340px] overflow-y-auto">
                      {selectedColumns.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                          Kéo thả hoặc click để thêm cột
                        </p>
                      ) : (
                        selectedColumns.map((col, index) => (
                          <div
                            key={col.field}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border transition-all ${
                              dragIndex === index
                                ? "border-blue-400 shadow-md scale-[1.02]"
                                : "border-gray-200 hover:border-blue-300"
                            }`}
                          >
                            <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />
                            <span className="text-xs text-gray-400 w-4 flex-shrink-0">
                              {index + 1}
                            </span>
                            <input
                              type="text"
                              value={col.header}
                              onChange={(e) =>
                                updateColumnHeader(index, e.target.value)
                              }
                              className="flex-1 text-sm text-gray-700 bg-transparent border-none outline-none px-1 min-w-0"
                              title="Tên cột trong Excel"
                            />
                            <input
                              type="number"
                              value={col.width}
                              onChange={(e) =>
                                updateColumnWidth(
                                  index,
                                  parseInt(e.target.value) || 10,
                                )
                              }
                              className="w-12 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 text-center"
                              title="Độ rộng cột"
                              min={4}
                              max={50}
                            />
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${formatBadge[col.format]?.style || "bg-gray-100 text-gray-600"}`}
                            >
                              {formatBadge[col.format]?.label || col.format}
                            </span>
                            <select
                              value={col.format}
                              onChange={(e) =>
                                updateColumnFormat(index, e.target.value)
                              }
                              className="text-[10px] border border-gray-200 rounded px-0.5 py-0.5 bg-white outline-none flex-shrink-0"
                              title="Định dạng Excel"
                            >
                              {FORMAT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeColumn(index)}
                              className="p-0.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 flex-shrink-0"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                {selectedColumns.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Xem trước
                    </h4>
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-blue-600">
                              {selectedColumns.map((col) => (
                                <th
                                  key={col.field}
                                  className="px-3 py-2 text-white font-medium text-left whitespace-nowrap"
                                >
                                  {col.header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-100">
                              {selectedColumns.map((col) => (
                                <td
                                  key={col.field}
                                  className="px-3 py-1.5 text-gray-400 whitespace-nowrap"
                                >
                                  {col.format === "currency"
                                    ? "1,000,000"
                                    : col.format === "number"
                                      ? "22"
                                      : "Nguyễn Văn A"}
                                </td>
                              ))}
                            </tr>
                            <tr className="bg-gray-50">
                              {selectedColumns.map((col) => (
                                <td
                                  key={col.field}
                                  className="px-3 py-1.5 text-gray-400 whitespace-nowrap"
                                >
                                  {col.format === "currency"
                                    ? "2,500,000"
                                    : col.format === "number"
                                      ? "20"
                                      : "Trần Thị B"}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving
                    ? "Đang lưu..."
                    : editingTemplate
                      ? "Cập nhật"
                      : "Tạo mẫu"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Xóa mẫu xuất"
        message="Bạn có chắc muốn xóa mẫu xuất này?"
        confirmLabel="Xóa"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
