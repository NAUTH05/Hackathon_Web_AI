"use client";

import AdminGuard from "@/components/AdminGuard";
import GPSSettings from "@/views/GPSSettings";

export default function SettingsPage() {
  return (
    <AdminGuard>
      <GPSSettings />
    </AdminGuard>
  );
}
