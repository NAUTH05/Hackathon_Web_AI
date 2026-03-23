"use client";

import AdminGuard from "@/components/AdminGuard";
import AuditLogs from "@/views/AuditLogs";

export default function LogsPage() {
  return (
    <AdminGuard>
      <AuditLogs />
    </AdminGuard>
  );
}
