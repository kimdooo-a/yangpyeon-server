// src/app/admin/aggregator/items/page.tsx
// 큐레이션 큐: pending / manual_review / blocked 3개 탭. 서버 페이징.
//
// 스키마 매핑:
//   - 썸네일: ContentIngestedItem.imageUrl
//   - 외부 URL: ContentIngestedItem.url
//   - 분류 추천: ContentIngestedItem.suggestedTrack + suggestedCategorySlug
//   - 큐레이션 플래그: ContentIngestedItem.qualityFlag (auto_ok|manual_review|blocked)
//   - 상태: ContentIngestedItem.status (pending|classifying|ready|rejected|duplicate)
//
// 카테고리명 룩업: suggestedCategorySlug → ContentCategory.slug → ContentCategory.name
//   (FK 관계가 아니므로 별도 SELECT로 슬러그 → 이름 매핑 표를 만든다)

import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ItemRowActions } from "./item-row-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 50;

type Tab = "pending" | "manual" | "blocked";
type Search = {
  tab?: Tab;
  page?: string;
};

function whereFor(tab: Tab): Prisma.ContentIngestedItemWhereInput {
  if (tab === "manual") return { qualityFlag: "manual_review" };
  if (tab === "blocked") return { qualityFlag: "blocked" };
  return { status: "pending" };
}

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ko-KR", { hour12: false });
}

async function loadItems(tab: Tab, page: number) {
  const where = whereFor(tab);
  const [rows, total] = await Promise.all([
    prisma.contentIngestedItem.findMany({
      where,
      orderBy: [{ fetchedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        source: { select: { slug: true, name: true, kind: true } },
      },
    }),
    prisma.contentIngestedItem.count({ where }),
  ]);

  // suggestedCategorySlug → category name 매핑 (한 라운드)
  const slugSet = new Set<string>();
  for (const r of rows) {
    if (r.suggestedCategorySlug) slugSet.add(r.suggestedCategorySlug);
  }
  const slugList = Array.from(slugSet);
  const cats = slugList.length
    ? await prisma.contentCategory.findMany({
        where: { slug: { in: slugList } },
        select: { slug: true, name: true },
      })
    : [];
  const nameBySlug = new Map<string, string>();
  for (const c of cats) nameBySlug.set(c.slug, c.name);

  return { rows, total, nameBySlug };
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp.tab ?? "pending";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows, total, nameBySlug } = await loadItems(tab, page);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-zinc-100">큐레이션 큐</CardTitle>
        <CardDescription className="text-zinc-400">
          분류 대기 / 수동 검토 / 차단된 항목을 관리합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {/* 탭 — Link 기반 (asChild 의존 회피) */}
        <Tabs defaultValue={tab}>
          <TabsList className="border border-zinc-800 bg-zinc-900">
            <TabLink href="?tab=pending" active={tab === "pending"}>
              Pending {tab === "pending" ? `(${total})` : null}
            </TabLink>
            <TabLink href="?tab=manual" active={tab === "manual"}>
              Manual Review {tab === "manual" ? `(${total})` : null}
            </TabLink>
            <TabLink href="?tab=blocked" active={tab === "blocked"}>
              Blocked {tab === "blocked" ? `(${total})` : null}
            </TabLink>
          </TabsList>

          <TabsContent value={tab} className="mt-3">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-400 w-20">썸네일</TableHead>
                  <TableHead className="text-zinc-400">제목</TableHead>
                  <TableHead className="text-zinc-400">소스</TableHead>
                  <TableHead className="text-zinc-400">트랙/카테고리</TableHead>
                  <TableHead className="text-zinc-400">상태</TableHead>
                  <TableHead className="text-zinc-400">게시일</TableHead>
                  <TableHead className="text-zinc-400">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((it) => {
                  const categoryName = it.suggestedCategorySlug
                    ? nameBySlug.get(it.suggestedCategorySlug) ?? null
                    : null;
                  return (
                    <TableRow key={it.id} className="border-zinc-800 align-top">
                      <TableCell>
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.imageUrl}
                            alt=""
                            className="h-12 w-20 rounded border border-zinc-800 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-12 w-20 rounded border border-zinc-800 bg-zinc-900 text-center text-xs leading-[3rem] text-zinc-600">
                            —
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="line-clamp-2 text-sm text-zinc-100">
                          {it.title ?? "(제목 없음)"}
                        </p>
                        {it.summary ? (
                          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                            {it.summary}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-300">
                        <div className="font-mono">{it.source?.slug ?? "—"}</div>
                        <div className="text-zinc-500">{it.source?.kind ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {it.suggestedTrack ? (
                            <Badge className="w-fit bg-zinc-800 text-zinc-200">
                              {it.suggestedTrack}
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-500">미분류</span>
                          )}
                          {categoryName ? (
                            <Badge className="w-fit bg-emerald-900/40 text-emerald-200">
                              {categoryName}
                            </Badge>
                          ) : it.suggestedCategorySlug ? (
                            <Badge className="w-fit bg-zinc-700/40 text-zinc-300">
                              {it.suggestedCategorySlug}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            it.qualityFlag === "blocked"
                              ? "bg-rose-700/40 text-rose-200"
                              : it.qualityFlag === "manual_review"
                              ? "bg-amber-700/40 text-amber-200"
                              : "bg-zinc-700/40 text-zinc-200"
                          }
                        >
                          {it.status} / {it.qualityFlag}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {fmt(it.publishedAt ?? it.fetchedAt)}
                      </TableCell>
                      <TableCell>
                        <ItemRowActions
                          id={it.id}
                          url={it.url}
                          tab={tab}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-zinc-500">
                      이 탭에 표시할 항목이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>

            {/* 페이지네이션 */}
            <nav className="mt-3 flex items-center justify-between text-sm text-zinc-400">
              <span>
                총 {total.toLocaleString("ko-KR")}건 · 페이지 {page}/{lastPage}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/admin/aggregator/items?tab=${tab}&page=${page - 1}`}
                    className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  >
                    ← 이전
                  </Link>
                ) : null}
                {page < lastPage ? (
                  <Link
                    href={`/admin/aggregator/items?tab=${tab}&page=${page + 1}`}
                    className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
                  >
                    다음 →
                  </Link>
                ) : null}
              </div>
            </nav>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** TabsTrigger 대용 — Link 기반 (yangpyeon TabsTrigger asChild 미지원 회피) */
function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/admin/aggregator/items${href}`}
      className={
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all " +
        (active
          ? "bg-zinc-950 text-zinc-100 shadow-sm"
          : "text-zinc-400 hover:text-zinc-200")
      }
    >
      {children}
    </Link>
  );
}
