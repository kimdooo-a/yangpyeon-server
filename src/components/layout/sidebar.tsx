"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  IconDashboard,
  IconProcess,
  IconLog,
  IconNetwork,
  IconFilebox,
  IconLogout,
  IconServer,
  IconMembers,
  IconShield,
  IconChart,
  IconAudit,
  IconEnv,
  IconUsers,
} from "@/components/ui/icons";
import {
  Code2,
  Workflow,
  ShieldCheck,
  Gauge,
  FunctionSquare,
  Radio,
  Database,
  Webhook as WebhookIcon,
  Clock,
  KeyRound,
  Archive,
  Send,
  Table2,
  Lock,
  Trash2,
  StickyNote,
  MessageCircle,
  Bell,
  Activity,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  group?: string;
};

const navItems: NavItem[] = [
  // 운영
  { href: "/", label: "대시보드", icon: <IconDashboard size={18} />, group: "운영" },
  { href: "/processes", label: "프로세스", icon: <IconProcess size={18} />, group: "운영" },
  { href: "/logs", label: "로그", icon: <IconLog size={18} />, group: "운영" },
  { href: "/network", label: "네트워크", icon: <IconNetwork size={18} />, group: "운영" },
  { href: "/metrics", label: "메트릭 히스토리", icon: <IconChart size={18} />, group: "운영" },

  // 콘텐츠
  { href: "/filebox", label: "파일박스", icon: <IconFilebox size={18} />, group: "콘텐츠" },
  { href: "/notes", label: "메모", icon: <StickyNote size={18} />, group: "콘텐츠" },
  { href: "/members", label: "회원 관리", icon: <IconMembers size={18} />, group: "콘텐츠" },

  // 커뮤니케이션 — Track C Messenger Phase 1 M4 UI 진입 (S84-F1)
  { href: "/messenger", label: "대화", icon: <MessageCircle size={18} />, group: "커뮤니케이션" },
  { href: "/messenger/settings", label: "알림 설정", icon: <Bell size={18} />, group: "커뮤니케이션" },
  { href: "/admin/messenger/moderation", label: "신고/차단 운영", icon: <ShieldCheck size={18} />, group: "커뮤니케이션" },
  { href: "/admin/messenger/health", label: "메신저 헬스", icon: <Activity size={18} />, group: "커뮤니케이션" },

  // 데이터베이스 (신규 — 세션 14)
  { href: "/tables", label: "테이블 에디터", icon: <Table2 size={18} />, group: "데이터베이스" },
  { href: "/sql-editor", label: "SQL 에디터", icon: <Code2 size={18} />, group: "데이터베이스" },
  { href: "/database/schema", label: "스키마 뷰어", icon: <Workflow size={18} />, group: "데이터베이스" },
  { href: "/data-api", label: "Data API", icon: <Database size={18} />, group: "데이터베이스" },
  { href: "/database/webhooks", label: "Webhooks", icon: <WebhookIcon size={18} />, group: "데이터베이스" },
  { href: "/database/cron", label: "Cron Jobs", icon: <Clock size={18} />, group: "데이터베이스" },
  { href: "/database/backups", label: "백업", icon: <Archive size={18} />, group: "데이터베이스" },

  // 개발 도구 (신규)
  { href: "/functions", label: "Edge Functions", icon: <FunctionSquare size={18} />, group: "개발 도구" },
  { href: "/realtime", label: "Realtime 채널", icon: <Radio size={18} />, group: "개발 도구" },
  { href: "/advisors/security", label: "보안 어드바이저", icon: <ShieldCheck size={18} />, group: "개발 도구" },
  { href: "/advisors/performance", label: "성능 어드바이저", icon: <Gauge size={18} />, group: "개발 도구" },

  // 감사·설정
  { href: "/audit", label: "감사 로그", icon: <IconAudit size={18} />, group: "감사·설정" },
  { href: "/settings/users", label: "사용자 관리", icon: <IconUsers size={18} />, group: "감사·설정" },
  { href: "/settings/ip-whitelist", label: "IP 화이트리스트", icon: <IconShield size={18} />, group: "감사·설정" },
  { href: "/settings/env", label: "환경변수", icon: <IconEnv size={18} />, group: "감사·설정" },
  { href: "/settings/api-keys", label: "API 키", icon: <KeyRound size={18} />, group: "감사·설정" },
  { href: "/settings/log-drains", label: "로그 드레인", icon: <Send size={18} />, group: "감사·설정" },
  { href: "/settings/cleanup", label: "Cleanup 실행", icon: <Trash2 size={18} />, group: "감사·설정" },

  // 내 계정 (모든 사용자)
  { href: "/account/security", label: "MFA & 보안", icon: <Lock size={18} />, group: "내 계정" },
];

/** ADMIN 역할만 접근 가능한 경로 */
const ADMIN_ONLY_PATHS = [
  "/audit",
  "/settings/ip-whitelist",
  "/settings/env",
  "/settings/users",
  "/settings/api-keys",
  "/settings/log-drains",
  "/settings/cleanup",
  "/members",
  "/functions",
  "/database/backups",
  "/admin/messenger/health",
];

/** MANAGER 이상만 접근 가능한 경로 */
const MANAGER_PLUS_PATHS = [
  "/tables",
  "/sql-editor",
  "/database/schema",
  "/data-api",
  "/database/webhooks",
  "/database/cron",
  "/realtime",
  "/advisors/security",
  "/advisors/performance",
  "/admin/messenger/moderation",
];

const GROUP_ORDER = [
  "운영",
  "콘텐츠",
  "커뮤니케이션",
  "데이터베이스",
  "개발 도구",
  "감사·설정",
  "내 계정",
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user } = useCurrentUser();

  const isAdmin = user?.role === "ADMIN";
  const isManagerOrAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  // 역할에 따라 메뉴 필터링 (로딩 중에는 전체 표시하되, 로그인 후 필터)
  const filteredItems = navItems.filter((item) => {
    if (!user) return true; // 로딩 중
    if (ADMIN_ONLY_PATHS.includes(item.href) && !isAdmin) return false;
    if (MANAGER_PLUS_PATHS.includes(item.href) && !isManagerOrAdmin) return false;
    return true;
  });

  // 그룹별로 묶기
  const grouped: Record<string, NavItem[]> = {};
  for (const item of filteredItems) {
    const g = item.group ?? "기타";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(item);
  }

  const nav = (
    <>
      <nav className="flex-1 py-3 space-y-2 overflow-y-auto">
        {GROUP_ORDER.filter((g) => grouped[g] && grouped[g].length > 0).map((group) => (
          <div key={group} className="space-y-0.5">
            <div className="px-4 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              {group}
            </div>
            {grouped[group].map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-brand/10 text-brand border-l-2 border-brand ml-0 pl-[14px] font-semibold"
                      : "text-gray-500 hover:text-gray-800 hover:bg-surface-300 border-l-2 border-transparent ml-0 pl-[14px]"
                  }`}
                >
                  <span className={isActive ? "text-brand" : ""}>{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-border space-y-3">
        {/* 현재 사용자 정보 */}
        {user && (
          <div className="text-xs text-gray-500 truncate">
            {user.email}
            <span className="ml-1.5 px-1.5 py-0.5 bg-surface-300 rounded text-[10px] text-gray-500">
              {user.role}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span>서버 가동 중</span>
        </div>
        <div className="text-[10px] text-gray-600">
          <kbd className="px-1 py-0.5 bg-surface-300 border border-border rounded text-[10px]">⌘K</kbd>{" "}
          빠른 이동
        </div>
        <button
          onClick={async () => {
            // Phase 15-D: v1 세션 서버측 revoke 먼저 + 대시보드 쿠키 제거 순차 실행
            await Promise.allSettled([
              fetch("/api/v1/auth/logout", { method: "POST" }),
              fetch("/api/auth/logout", { method: "POST" }),
            ]);
            window.location.href = "/login";
          }}
          className="flex items-center gap-2 w-full text-xs text-gray-500 hover:text-gray-700 transition-colors text-left"
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
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-surface-200 border border-border rounded-lg text-gray-600 shadow-sm"
        aria-label="메뉴"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          {open ? (
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          ) : (
            <path
              fillRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          )}
        </svg>
      </button>

      {/* 모바일 오버레이 */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
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
