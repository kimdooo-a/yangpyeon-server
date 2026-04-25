// src/app/admin/aggregator/sources/page.tsx
// RSS / HTML / API 소스 CRUD. server component (목록 페치) + 클라이언트 보조 컴포넌트.

import { prisma } from "@/lib/prisma";
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
import { NewSourceDialog } from "./new-source-dialog";
import { SourceRowActions } from "./source-row-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Search = { showInactive?: string };

function fmt(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ko-KR", { hour12: false });
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const showInactive = sp.showInactive === "1";

  const sources = await prisma.contentSource.findMany({
    where: showInactive ? {} : { active: true },
    orderBy: [
      { active: "desc" },
      { consecutiveFailures: "desc" },
      { slug: "asc" },
    ],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <NewSourceDialog />
          <ToggleInactive on={showInactive} />
        </div>
        <p className="text-sm text-zinc-400">
          총 <span className="font-mono text-zinc-200">{sources.length}</span>개 소스
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-zinc-100">소스 목록</CardTitle>
          <CardDescription className="text-zinc-400">
            활성 소스만 cron fetcher가 수집합니다. 연속 실패가 5회 이상이면
            자동으로 비활성 후보로 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead className="text-zinc-400">slug</TableHead>
                <TableHead className="text-zinc-400">이름</TableHead>
                <TableHead className="text-zinc-400">종류</TableHead>
                <TableHead className="text-zinc-400">국가</TableHead>
                <TableHead className="text-zinc-400">트랙</TableHead>
                <TableHead className="text-zinc-400">연속실패</TableHead>
                <TableHead className="text-zinc-400">마지막 성공</TableHead>
                <TableHead className="text-zinc-400">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id} className="border-zinc-800">
                  <TableCell className="font-mono text-xs text-zinc-200">
                    {s.slug}
                  </TableCell>
                  <TableCell className="text-zinc-200">{s.name}</TableCell>
                  <TableCell>
                    <Badge className="bg-zinc-800 text-zinc-200">{s.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-zinc-300">{s.country ?? "—"}</TableCell>
                  <TableCell className="text-zinc-300">{s.defaultTrack ?? "—"}</TableCell>
                  <TableCell
                    className={
                      s.consecutiveFailures >= 5
                        ? "text-rose-400"
                        : s.consecutiveFailures >= 3
                        ? "text-amber-400"
                        : "text-zinc-300"
                    }
                  >
                    {s.consecutiveFailures}
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {fmt(s.lastSuccessAt)}
                  </TableCell>
                  <TableCell>
                    <SourceRowActions id={s.id} active={s.active} />
                  </TableCell>
                </TableRow>
              ))}
              {sources.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-zinc-500">
                    등록된 소스가 없습니다. 위의 “신규 소스 추가” 버튼으로 추가하세요.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleInactive({ on }: { on: boolean }) {
  // 단순 GET 토글. 별도 클라이언트 상태 없이 a href만 사용.
  return (
    <a
      href={on ? "/admin/aggregator/sources" : "/admin/aggregator/sources?showInactive=1"}
      className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
    >
      {on ? "비활성 숨기기" : "비활성 포함 보기"}
    </a>
  );
}
