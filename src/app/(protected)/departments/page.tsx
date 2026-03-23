"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import DepartmentManagement from "@/views/DepartmentManagement";

export default function DepartmentsPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.DIRECTOR}>
      <DepartmentManagement />
    </AdminGuard>
  );
}
