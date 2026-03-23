"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import ShiftManagement from "@/views/ShiftManagement";

export default function ShiftsPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.MANAGER}>
      <ShiftManagement />
    </AdminGuard>
  );
}
