"use client";

import AdminGuard from "@/components/AdminGuard";
import { ROLE_LEVELS } from "@/types";
import PenaltyManagement from "@/views/PenaltyManagement";

export default function PenaltiesPage() {
  return (
    <AdminGuard maxLevel={ROLE_LEVELS.TEAM_LEAD}>
      <PenaltyManagement />
    </AdminGuard>
  );
}
