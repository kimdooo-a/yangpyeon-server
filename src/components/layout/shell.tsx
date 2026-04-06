"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <div className="w-screen h-screen">{children}</div>;
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-auto bg-surface-100 pt-14 md:pt-0">
        {children}
      </main>
    </>
  );
}
