"use client";

import { useAuth } from "@/contexts/AuthContext";
import Login from "@/views/Login";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user, router]);

  if (user) return null;
  return <Login />;
}
