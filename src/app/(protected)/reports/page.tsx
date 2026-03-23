"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import Reports from "@/views/Reports";

export default function ReportsPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.DIRECTOR}>
      <Reports />
    </AdminGuard>
  );
}
