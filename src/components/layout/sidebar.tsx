"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/processes", label: "프로세스", icon: "⚙️" },
  { href: "/logs", label: "로그", icon: "📋" },
  { href: "/network", label: "네트워크", icon: "🌐" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-surface-200 border-r border-border flex flex-col">
      {/* 로고 */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <span className="text-brand font-bold text-lg">양평 부엌</span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-surface-400 text-white"
                  : "text-gray-400 hover:text-white hover:bg-surface-300"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 하단 */}
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
          className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
        >
          로그아웃
        </button>
      </div>
    </aside>
  );
}
