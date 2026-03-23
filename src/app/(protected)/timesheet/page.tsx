"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import MonthlyTimesheet from "@/views/MonthlyTimesheet";

export default function TimesheetPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.MANAGER}>
      <MonthlyTimesheet />
    </AdminGuard>
  );
}
