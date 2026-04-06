import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: "양평 부엌 서버",
  description: "서버 관리 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="flex h-screen overflow-hidden relative">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-surface-100 pt-14 md:pt-0">
          {children}
        </main>
      </body>
    </html>
  );
}
