"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import AttendanceHistory from "@/views/AttendanceHistory";

export default function HistoryPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.TEAM_LEAD}>
      <AttendanceHistory />
    </AdminGuard>
  );
}
