"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import DepartmentMembers from "@/views/DepartmentMembers";
import { useParams } from "next/navigation";

export default function DepartmentMembersPage() {
  const params = useParams();
  const departmentId = params?.id as string;

  return (
    <AdminGuard maxLevel={ROLE_LEVELS.DIRECTOR}>
      <DepartmentMembers departmentId={departmentId} />
    </AdminGuard>
  );
}
