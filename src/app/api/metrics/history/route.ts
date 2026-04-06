import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { metricsHistory } from "@/lib/db/schema";
import { metricsHistoryQuerySchema } from "@/lib/schemas";
import { startCollector } from "@/lib/metrics-collector";

// 시간 범위별 설정: cutoffSeconds, bucketSeconds (다운샘플링 간격)
const RANGE_CONFIG = {
  "1h": { cutoff: 60 * 60, bucket: 0 },         // 원본 (1분 간격)
  "24h": { cutoff: 24 * 60 * 60, bucket: 300 },  // 5분 평균
  "7d": { cutoff: 7 * 24 * 60 * 60, bucket: 3600 },   // 1시간 평균
  "30d": { cutoff: 30 * 24 * 60 * 60, bucket: 21600 }, // 6시간 평균
} as const;

export async function GET(request: NextRequest) {
  // 수집기 lazy 시작 — 첫 API 호출 시 자동 시작
  startCollector();

  const { searchParams } = request.nextUrl;
  const parsed = metricsHistoryQuerySchema.safeParse({
    range: searchParams.get("range") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "잘못된 파라미터", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { range } = parsed.data;
  const config = RANGE_CONFIG[range];
  const db = getDb();
  const cutoffUnix = Math.floor(Date.now() / 1000) - config.cutoff;

  let rows;

  if (config.bucket === 0) {
    // 원본 데이터 그대로 반환
    rows = db
      .select({
        timestamp: metricsHistory.timestamp,
        cpuUsage: metricsHistory.cpuUsage,
        memoryUsed: metricsHistory.memoryUsed,
        memoryTotal: metricsHistory.memoryTotal,
      })
      .from(metricsHistory)
      .where(sql`${metricsHistory.timestamp} > ${cutoffUnix}`)
      .orderBy(metricsHistory.timestamp)
      .all();
  } else {
    // 다운샘플링: SQL GROUP BY + AVG
    rows = db
      .select({
        timestamp: sql<number>`(${metricsHistory.timestamp} / ${config.bucket}) * ${config.bucket}`.as("timestamp"),
        cpuUsage: sql<number>`ROUND(AVG(${metricsHistory.cpuUsage}))`.as("cpu_usage"),
        memoryUsed: sql<number>`ROUND(AVG(${metricsHistory.memoryUsed}))`.as("memory_used"),
        memoryTotal: sql<number>`MAX(${metricsHistory.memoryTotal})`.as("memory_total"),
      })
      .from(metricsHistory)
      .where(sql`${metricsHistory.timestamp} > ${cutoffUnix}`)
      .groupBy(sql`${metricsHistory.timestamp} / ${config.bucket}`)
      .orderBy(sql`timestamp`)
      .all();
  }

  // 타임스탬프를 밀리초 단위로 변환 (프론트엔드용)
  const data = rows.map((row) => {
    const ts = row.timestamp instanceof Date
      ? row.timestamp.getTime()
      : (typeof row.timestamp === "number" ? row.timestamp * 1000 : 0);
    return {
      timestamp: ts,
      cpuUsage: row.cpuUsage ?? 0,
      memoryUsed: row.memoryUsed ?? 0,
      memoryTotal: row.memoryTotal ?? 0,
    };
  });

  return NextResponse.json({
    range,
    count: data.length,
    data,
  });
}
