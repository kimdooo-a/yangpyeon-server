// src/app/admin/aggregator/dashboard/page.tsx
// 일일 수집/실패/소스별 SLA 대시보드. server component (prisma 직접 호출).
//
// 스키마: ContentIngestedItem.status ∈ {pending|classifying|ready|rejected|duplicate}.
//   "게시" 카운트는 ContentItem (승격 후) 기준으로 계산한다 — staging의 'published'는 enum에 없다.

import Link from "next/link";
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

export const dynamic = "force-dynamic"; // 새로고침마다 최신 값으로 갱신.
export const revalidate = 0;

type HourBucket = {
  hour: string; // 'YYYY-MM-DD HH:00'
  count: number;
};

type SourceRow = {
  id: number;
  slug: string;
  kind: string;
  default_track: string | null;
  last_success_at: Date | null;
  consecutive_failures: number;
  last_error: string | null;
  active: boolean;
};

async function getKpis() {
  // 오늘 00:00 (KST) 이후 기준. 운영 단순화를 위해 서버 TZ를 사용.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [collected, classified, published, activeSources] = await Promise.all([
    prisma.contentIngestedItem.count({
      where: { fetchedAt: { gte: startOfDay } },
    }),
    prisma.contentIngestedItem.count({
      where: {
        fetchedAt: { gte: startOfDay },
        status: "ready",
      },
    }),
    // 게시 카운트는 promote 후의 ContentItem 기준
    prisma.contentItem.count({
      where: { firstSeenAt: { gte: startOfDay } },
    }),
    prisma.contentSource.count({ where: { active: true } }),
  ]);

  return { collected, classified, published, activeSources };
}

async function get24hHistogram(): Promise<HourBucket[]> {
  // Postgres date_trunc로 시간 단위 집계.
  const rows = await prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
    SELECT date_trunc('hour', fetched_at) AS hour, COUNT(*)::bigint AS count
    FROM content_ingested_items
    WHERE fetched_at > NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY 1 ASC;
  `;

  return rows.map((r) => ({
    hour: r.hour.toISOString().slice(0, 13) + ":00",
    count: Number(r.count),
  }));
}

async function getSources(): Promise<SourceRow[]> {
  return prisma.$queryRaw<SourceRow[]>`
    SELECT id, slug, kind::text AS kind, default_track, last_success_at,
           consecutive_failures, last_error, active
    FROM content_sources
    ORDER BY consecutive_failures DESC NULLS LAST,
             last_success_at ASC NULLS FIRST,
             slug ASC;
  `;
}

function HistogramBar({ buckets }: { buckets: HourBucket[] }) {
  if (buckets.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        최근 24시간 수집 기록이 없습니다.
      </p>
    );
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const width = 800;
  const height = 120;
  const barWidth = Math.max(2, Math.floor(width / buckets.length) - 2);

  return (
    <svg
      role="img"
      aria-label="24시간 수집량 막대그래프"
      viewBox={`0 0 ${width} ${height}`}
      className="h-32 w-full"
    >
      {buckets.map((b, i) => {
        const h = Math.round((b.count / max) * (height - 16));
        const x = i * (barWidth + 2);
        const y = height - h;
        return (
          <g key={b.hour}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              className="fill-emerald-500/80"
            >
              <title>
                {b.hour} — {b.count}건
              </title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function SlaBadge({ failures }: { failures: number }) {
  if (failures === 0) {
    return <Badge className="bg-emerald-700/40 text-emerald-200">정상</Badge>;
  }
  if (failures < 3) {
    return <Badge className="bg-amber-700/40 text-amber-200">주의</Badge>;
  }
  if (failures < 5) {
    return <Badge className="bg-orange-700/40 text-orange-200">경고</Badge>;
  }
  return <Badge className="bg-rose-700/40 text-rose-200">위험</Badge>;
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ko-KR", { hour12: false });
}

export default async function AggregatorDashboardPage() {
  const [kpis, hist, sources] = await Promise.all([
    getKpis(),
    get24hHistogram(),
    getSources(),
  ]);

  const failingSources = sources.filter((s) => s.consecutive_failures >= 3);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI 카드 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiCard title="오늘 수집" value={kpis.collected} hint="content_ingested_items.fetched_at ≥ 오늘 00:00" />
        <KpiCard title="오늘 분류 완료" value={kpis.classified} hint="status = 'ready'" />
        <KpiCard title="오늘 게시" value={kpis.published} hint="content_items.first_seen_at ≥ 오늘 00:00" />
        <KpiCard title="활성 소스" value={kpis.activeSources} hint="content_sources.active = true" />
      </div>

      {/* 24h 히스토그램 */}
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-zinc-100">최근 24시간 수집량</CardTitle>
          <CardDescription className="text-zinc-400">
            시간별 fetched_at 집계 (timezone: 서버 시간)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HistogramBar buckets={hist} />
        </CardContent>
      </Card>

      {/* Cron 잡 상태 링크 — Button asChild 미지원 회피: Link를 button-like 스타일로 직접 렌더 */}
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-zinc-100">Cron 잡</CardTitle>
            <CardDescription className="text-zinc-400">
              fetch / classify / promote 잡의 실행 이력은 별도 페이지에서 확인.
            </CardDescription>
          </div>
          <Link
            href="/admin/cron-jobs"
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-background px-2.5 text-sm font-medium text-zinc-200 transition-all hover:bg-muted hover:text-foreground"
          >
            /admin/cron-jobs 열기
          </Link>
        </CardHeader>
      </Card>

      {/* 소스별 상태 테이블 */}
      <Card className="border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="text-zinc-100">소스별 상태 ({sources.length}개)</CardTitle>
          <CardDescription className="text-zinc-400">
            consecutive_failures 내림차순 → last_success_at 오래된 순으로 정렬.
            {failingSources.length > 0 ? (
              <span className="ml-2 text-rose-400">
                ⚠️ 연속 실패 3회 이상: {failingSources.length}개
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead className="text-zinc-400">SLA</TableHead>
                <TableHead className="text-zinc-400">slug</TableHead>
                <TableHead className="text-zinc-400">종류</TableHead>
                <TableHead className="text-zinc-400">트랙</TableHead>
                <TableHead className="text-zinc-400">활성</TableHead>
                <TableHead className="text-zinc-400">연속실패</TableHead>
                <TableHead className="text-zinc-400">마지막 성공</TableHead>
                <TableHead className="text-zinc-400">마지막 오류</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id} className="border-zinc-800">
                  <TableCell>
                    <SlaBadge failures={s.consecutive_failures} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-200">
                    {s.slug}
                  </TableCell>
                  <TableCell className="text-zinc-300">{s.kind}</TableCell>
                  <TableCell className="text-zinc-300">
                    {s.default_track ?? "—"}
                  </TableCell>
                  <TableCell>
                    {s.active ? (
                      <Badge className="bg-emerald-700/40 text-emerald-200">on</Badge>
                    ) : (
                      <Badge className="bg-zinc-700/40 text-zinc-300">off</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    {s.consecutive_failures}
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {fmtDate(s.last_success_at)}
                  </TableCell>
                  <TableCell
                    className="max-w-xs truncate text-xs text-zinc-500"
                    title={s.last_error ?? ""}
                  >
                    {s.last_error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader className="pb-2">
        <CardDescription className="text-zinc-400">{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold text-zinc-100">
          {value.toLocaleString("ko-KR")}
        </CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent>
          <p className="text-xs text-zinc-500">{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
