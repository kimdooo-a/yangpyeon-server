"use client";

import { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  IconDashboard,
  IconProcess,
  IconLog,
  IconNetwork,
  IconFilebox,
  IconMembers,
  IconChart,
  IconAudit,
  IconShield,
  IconEnv,
  IconUsers,
  IconRestart,
  IconSearch,
} from "@/components/ui/icons";

/** ADMIN 전용 경로 */
const ADMIN_ONLY_PATHS = [
  "/audit",
  "/settings/ip-whitelist",
  "/settings/env",
  "/settings/users",
  "/members",
];

/** 네비게이션 항목 */
const navCommands = [
  { href: "/", label: "대시보드", icon: <IconDashboard size={16} />, shortcut: [] },
  { href: "/processes", label: "프로세스", icon: <IconProcess size={16} />, shortcut: [] },
  { href: "/logs", label: "로그", icon: <IconLog size={16} />, shortcut: [] },
  { href: "/network", label: "네트워크", icon: <IconNetwork size={16} />, shortcut: [] },
  { href: "/filebox", label: "파일박스", icon: <IconFilebox size={16} />, shortcut: [] },
  { href: "/members", label: "회원 관리", icon: <IconMembers size={16} />, shortcut: [] },
  { href: "/metrics", label: "메트릭 히스토리", icon: <IconChart size={16} />, shortcut: [] },
  { href: "/audit", label: "감사 로그", icon: <IconAudit size={16} />, shortcut: [] },
  { href: "/settings/ip-whitelist", label: "IP 화이트리스트", icon: <IconShield size={16} />, shortcut: [] },
  { href: "/settings/env", label: "환경변수", icon: <IconEnv size={16} />, shortcut: [] },
  { href: "/settings/users", label: "사용자 관리", icon: <IconUsers size={16} />, shortcut: [] },
];

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useCurrentUser();

  const isAdmin = user?.role === "ADMIN";

  // 역할 기반 필터링
  const filteredNavCommands = navCommands.filter((item) => {
    if (ADMIN_ONLY_PATHS.includes(item.href) && user && !isAdmin) return false;
    return true;
  });

  // Cmd+K / Ctrl+K 글로벌 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  /** 네비게이션 선택 핸들러 */
  const handleNav = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  /** 모든 프로세스 재시작 액션 */
  const handleRestartAll = useCallback(async () => {
    setOpen(false);
    try {
      const res = await fetch("/api/pm2/restart", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `재시작 실패 (${res.status})`);
      }
      toast.success("PM2 재시작 요청됨");
    } catch (err) {
      // S88 후속 — silent catch 표면화. PM2 restart 는 critical ops 호출이라
      // 무반응 시 사용자가 실패 인지 불가능 → console + toast 양쪽 표면화.
      console.error("[command-menu] PM2 restart failed", err);
      toast.error(err instanceof Error ? err.message : "PM2 재시작 실패");
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
      />

      {/* 다이얼로그 */}
      <div className="relative flex items-start justify-center pt-[20vh]">
        <Command
          className="bg-surface-200 border border-border rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
          loop
        >
          {/* 검색 입력 */}
          <div className="flex items-center gap-3 px-4 border-b border-border">
            <IconSearch size={16} className="text-gray-500 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="페이지 이동, 명령어 검색..."
              className="flex-1 bg-transparent py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400"
            />
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 bg-surface-300 border border-border rounded text-[10px] text-gray-500">
              ESC
            </kbd>
          </div>

          {/* 결과 목록 */}
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-gray-500">
              검색 결과가 없습니다.
            </Command.Empty>

            {/* 네비게이션 그룹 */}
            <Command.Group
              heading="네비게이션"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-gray-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
            >
              {filteredNavCommands.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.label}
                  onSelect={() => handleNav(item.href)}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 rounded-lg cursor-pointer data-[selected=true]:bg-surface-300 data-[selected=true]:text-brand transition-colors"
                >
                  <span className="text-gray-500 data-[selected=true]:text-brand">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* 액션 그룹 (ADMIN 전용) */}
            {isAdmin && (
              <Command.Group
                heading="액션"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-gray-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                <Command.Item
                  value="모든 프로세스 재시작 restart all"
                  onSelect={handleRestartAll}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 rounded-lg cursor-pointer data-[selected=true]:bg-surface-300 data-[selected=true]:text-brand transition-colors"
                >
                  <IconRestart size={16} className="text-gray-500" />
                  <span>모든 프로세스 재시작</span>
                  <span className="ml-auto text-[10px] text-gray-500">PM2</span>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
