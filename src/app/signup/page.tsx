"use client";

import { useAuth } from "@/contexts/AuthContext";
import Signup from "@/views/Signup";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignupPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace("/");
    }
  }, [user, router]);

  if (user) return null;
  return <Signup />;
}
