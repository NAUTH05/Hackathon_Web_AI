"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ROLE_LEVELS } from "@/types";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminGuard({
  children,
  maxLevel = ROLE_LEVELS.ADMIN,
}: {
  children: React.ReactNode;
  maxLevel?: number;
}) {
  const { user, hasAccess } = useAuth();
  const router = useRouter();

  const allowed = user && hasAccess(maxLevel);

  useEffect(() => {
    if (user && !allowed) {
      router.replace("/");
    }
  }, [user, allowed, router]);

  if (!user || !allowed) return null;
  return <>{children}</>;
}
