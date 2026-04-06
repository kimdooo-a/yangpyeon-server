"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { IconDashboard, IconProcess, IconLog, IconNetwork, IconLogout, IconServer } from "@/components/ui/icons";

const navItems: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/", label: "대시보드", icon: <IconDashboard size={18} /> },
  { href: "/processes", label: "프로세스", icon: <IconProcess size={18} /> },
  { href: "/logs", label: "로그", icon: <IconLog size={18} /> },
  { href: "/network", label: "네트워크", icon: <IconNetwork size={18} /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <>
      <nav className="flex-1 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-brand/10 text-brand border-l-2 border-brand ml-0 pl-[14px]"
                  : "text-gray-400 hover:text-gray-200 hover:bg-surface-300 border-l-2 border-transparent ml-0 pl-[14px]"
              }`}
            >
              <span className={isActive ? "text-brand" : ""}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-border space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span>서버 가동 중</span>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="flex items-center gap-2 w-full text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
        >
          <IconLogout size={14} />
          <span>로그아웃</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-surface-200 border border-border rounded-lg text-gray-300"
        aria-label="메뉴"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          {open ? (
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          ) : (
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          )}
        </svg>
      </button>

      {/* 모바일 오버레이 */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
      )}

      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex w-56 bg-surface-200 border-r border-border flex-col">
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <IconServer className="text-brand" size={20} />
          <span className="text-brand font-bold text-lg">양평 부엌</span>
        </div>
        {nav}
      </aside>

      {/* 모바일 사이드바 */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-40 w-56 h-full bg-surface-200 border-r border-border flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border">
          <IconServer className="text-brand" size={20} />
          <span className="text-brand font-bold text-lg">양평 부엌</span>
        </div>
        {nav}
      </aside>
    </>
  );
}
