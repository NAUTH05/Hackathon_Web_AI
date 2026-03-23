"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import EmployeeList from "@/views/EmployeeList";

export default function EmployeesPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.MANAGER}>
      <EmployeeList />
    </AdminGuard>
  );
}
