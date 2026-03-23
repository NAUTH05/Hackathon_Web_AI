"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import EmployeeForm from "@/views/EmployeeForm";

export default function EmployeeNewPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.MANAGER}>
      <EmployeeForm />
    </AdminGuard>
  );
}
