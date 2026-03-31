"use client";

import { useAuth } from "@/contexts/AuthContext";
import EmployeeForm from "@/views/EmployeeForm";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EmployeeNewPage() {
  const { user, canCreateEmployee } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !canCreateEmployee) {
      router.replace("/employees");
    }
  }, [user, canCreateEmployee, router]);

  if (!user || !canCreateEmployee) return null;

  return <EmployeeForm />;
}
