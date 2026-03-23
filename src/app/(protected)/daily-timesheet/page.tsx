"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import DailyTimesheet from "@/views/DailyTimesheet";

export default function DailyTimesheetPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.MANAGER}>
      <DailyTimesheet />
    </AdminGuard>
  );
}
