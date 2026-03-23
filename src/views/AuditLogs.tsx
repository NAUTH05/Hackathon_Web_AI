import { format } from "date-fns";
import { useEffect, useState } from "react";
import Pagination from "../components/Pagination";
import { getAuditLogsPaginated } from "../store/storage";
import type { AuditLog } from "../types";

const ACTION_LABELS: Record<string, string> = {
  "check-in": "Chấm công vào",
  "check-out": "Chấm công ra",
  correction: "Sửa giờ",
  "ot-request": "Đăng ký OT",
  "ot-approve": "Duyệt OT",
  "ot-reject": "Từ chối OT",
  "shift-swap": "Đổi ca",
  "leave-request": "Xin nghỉ phép",
  penalty: "Vi phạm",
};

const ACTION_STYLES: Record<string, string> = {
  "check-in": "bg-green-100 text-green-700",
  "check-out": "bg-blue-100 text-blue-700",
  correction: "bg-yellow-100 text-yellow-700",
  "ot-request": "bg-purple-100 text-purple-700",
  "ot-approve": "bg-green-100 text-green-700",
  "ot-reject": "bg-red-100 text-red-700",
  "shift-swap": "bg-cyan-100 text-cyan-700",
  "leave-request": "bg-orange-100 text-orange-700",
  penalty: "bg-red-100 text-red-700",
};

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filterAction, setFilterAction] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [filterAction, search]);

  useEffect(() => {
    loadLogs();
  }, [page, filterAction, search]);

  async function loadLogs() {
    const params: Record<string, string> = { page: String(page), limit: "30" };
    if (filterAction) params.action = filterAction;
    if (search) params.performedBy = search;
    const res = await getAuditLogsPaginated(params);
    setLogs(res.data);
    setTotalPages(res.pagination.totalPages);
    setTotal(res.pagination.total);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhật ký hệ thống</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString()} bản ghi audit trail
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Tìm theo người thực hiện..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] max-w-sm px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tất cả hành động</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="bản ghi"
        />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Thời gian
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Hành động
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Thực hiện bởi
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Đối tượng
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Chi tiết
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Giá trị cũ
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Giá trị mới
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    Chưa có nhật ký
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3 text-sm text-gray-600 tabular-nums whitespace-nowrap">
                      {format(new Date(log.timestamp), "dd/MM/yyyy HH:mm:ss")}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_STYLES[log.action] || "bg-gray-100 text-gray-600"}`}
                      >
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">
                      {log.performedBy}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      {log.targetEmployee || "—"}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 max-w-[300px] truncate">
                      {log.details}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-400">
                      {log.oldValue || "—"}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-400">
                      {log.newValue || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          label="bản ghi"
        />
      </div>
    </div>
  );
}
