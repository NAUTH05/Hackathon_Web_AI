"use client";

import Layout from "@/components/Layout";
import GuideBotUI from "@/components/GuideBotUI";
import ToastContainer from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, hydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !user) {
      router.replace("/login");
    }
  }, [user, hydrated, router]);

  if (!hydrated || !user) return null;

  return (
    <>
      <Layout>{children}</Layout>
      <ToastContainer />
      <GuideBotUI />
    </>
  );
}
