"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ChatbotProvider } from "@/contexts/ChatbotContext";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <title>TimeKeeper - Cham Cong</title>
        <meta name="description" content="He thong cham cong nhan vien" />
      </head>
      <body>
        <AuthProvider>
          <ChatbotProvider>
            {children}
          </ChatbotProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
