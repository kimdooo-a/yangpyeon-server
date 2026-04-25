// src/app/admin/aggregator/layout.tsx
// 콘텐츠 어그리게이터 관리자 공통 레이아웃 (보조 네비게이션).
// 상위 (protected) 레이아웃이 사이드바·헤더를 처리한다고 가정한다.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";

type NavLinkProps = {
  href: string;
  label: string;
};

function NavLink({ href, label }: NavLinkProps) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 dark:text-zinc-300"
    >
      {label}
    </Link>
  );
}

export default async function AggregatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 페이지 가드: ADMIN/MANAGER만 접근 허용.
  const session = await getSessionFromCookies();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-4 p-6 text-zinc-100">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">콘텐츠 어그리게이터</h1>
        <p className="text-sm text-zinc-400">
          RSS · HTML · API 소스 수집과 분류 · 큐레이션을 관리합니다.
        </p>
      </header>

      <nav
        aria-label="어그리게이터 보조 네비게이션"
        className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2"
      >
        <NavLink href="/admin/aggregator/dashboard" label="대시보드" />
        <NavLink href="/admin/aggregator/sources" label="소스" />
        <NavLink href="/admin/aggregator/categories" label="카테고리" />
        <NavLink href="/admin/aggregator/items" label="콘텐츠" />
      </nav>

      <main className="min-h-[60vh]">{children}</main>
    </div>
  );
}
