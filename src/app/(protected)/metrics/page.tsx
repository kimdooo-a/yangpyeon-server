"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { MetricsAreaChart } from "@/components/charts/metrics-area-chart";
import { IconChart } from "@/components/ui/icons";

type Range = "1h" | "24h" | "7d" | "30d";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "1h", label: "1시간" },
  { value: "24h", label: "24시간" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
];

interface MetricRow {
  timestamp: number;
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
}

export default function MetricsPage() {
  const [range, setRange] = useState<Range>("1h");
  const [data, setData] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/metrics/history?range=${range}`);
      const json = await res.json();
      setData(json.data ?? []);
      setLastUpdated(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    } catch {
      // 다음 갱신에서 재시도
    } finally {
      setLoading(false);
    }
  }, [range]);

  // 범위 변경 시 즉시 가져오기
  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // 1분마다 자동 갱신
  useEffect(() => {
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // CPU 데이터 변환
  const cpuData = data.map((row) => ({
    timestamp: row.timestamp,
    value: row.cpuUsage,
  }));

  // 메모리 데이터 변환 (MB → GB, 사용률 %)
  const memoryData = data.map((row) => ({
    timestamp: row.timestamp,
    value: row.memoryTotal > 0
      ? Math.round((row.memoryUsed / row.memoryTotal) * 1000) / 10
      : 0,
  }));

  // 메모리 절대값 데이터 (GB)
  const memoryAbsData = data.map((row) => ({
    timestamp: row.timestamp,
    value: Math.round((row.memoryUsed / 1024) * 10) / 10, // MB → GB
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="메트릭 히스토리" description="CPU · 메모리 사용률 시계열 차트">
        <div className="flex items-center gap-2">
          <IconChart size={16} className="text-gray-500" />
          <span className="text-xs text-gray-500">
            {lastUpdated ? `갱신: ${lastUpdated}` : "로딩 중..."}
          </span>
        </div>
      </PageHeader>

      {/* 시간 범위 선택 */}
      <div className="flex items-center gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRange(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              range === opt.value
                ? "bg-brand/10 text-brand border-brand"
                : "bg-surface-300 text-gray-500 border-border hover:text-gray-800 hover:border-gray-500"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 차트 영역 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-surface-200 border border-border rounded-lg h-[300px] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <MetricsAreaChart
            data={cpuData}
            color="#3ECF8E"
            title="CPU 사용률"
            unit="%"
          />
          <MetricsAreaChart
            data={memoryData}
            color="#3B82F6"
            title="메모리 사용률"
            unit="%"
          />
          <MetricsAreaChart
            data={memoryAbsData}
            color="#8B5CF6"
            title="메모리 사용량"
            unit="GB"
          />
        </div>
      )}

      {/* 통계 요약 */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="평균 CPU"
            value={`${avg(cpuData.map((d) => d.value)).toFixed(1)}%`}
            color="text-brand"
          />
          <StatCard
            label="최대 CPU"
            value={`${Math.max(...cpuData.map((d) => d.value)).toFixed(1)}%`}
            color="text-brand"
          />
          <StatCard
            label="평균 메모리"
            value={`${avg(memoryData.map((d) => d.value)).toFixed(1)}%`}
            color="text-blue-400"
          />
          <StatCard
            label="최대 메모리"
            value={`${Math.max(...memoryData.map((d) => d.value)).toFixed(1)}%`}
            color="text-blue-400"
          />
        </div>
      )}
    </div>
  );
}

/** 평균 계산 */
function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 통계 카드 */
function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface-200 border border-border rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
