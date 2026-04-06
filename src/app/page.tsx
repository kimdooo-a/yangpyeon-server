"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemInfo } from "@/components/dashboard/system-info";
import { MiniChart } from "@/components/dashboard/mini-chart";
import { PageHeader } from "@/components/ui/page-header";
import { IconRefresh } from "@/components/ui/icons";

interface DiskInfo {
  mount: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

interface SystemData {
  cpu: { model: string; cores: number; usage: number };
  memory: { total: number; used: number; free: number; percent: number };
  disks: DiskInfo[];
  uptime: number;
  hostname: string;
  platform: string;
  nodeVersion: string;
  time: string;
}

interface Pm2Process {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

const MAX_HISTORY = 20;

function diskColor(percent: number): "brand" | "amber" | "red" {
  if (percent < 50) return "brand";
  if (percent < 80) return "amber";
  return "red";
}

function diskBarColor(percent: number): string {
  if (percent < 50) return "bg-brand";
  if (percent < 80) return "bg-amber-500";
  return "bg-red-500";
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return "방금 전";
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

export default function DashboardPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processes, setProcesses] = useState<Pm2Process[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("—");
  const cpuHistory = useRef<number[]>([]);
  const memHistory = useRef<number[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/system");
      if (!res.ok) throw new Error("API 응답 오류");
      const json: SystemData = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(Date.now());

      cpuHistory.current = [...cpuHistory.current, json.cpu.usage].slice(-MAX_HISTORY);
      memHistory.current = [...memHistory.current, json.memory.percent].slice(-MAX_HISTORY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  }, []);

  const fetchPm2 = useCallback(async () => {
    try {
      const res = await fetch("/api/pm2");
      if (!res.ok) return;
      const json = await res.json();
      setProcesses(json.processes ?? []);
    } catch {
      // PM2 fetch 실패는 무시 — 대시보드 주요 기능에 영향 없음
    }
  }, []);

  // 시스템 데이터 폴링 (3초)
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // PM2 데이터 폴링 (3초)
  useEffect(() => {
    fetchPm2();
    const interval = setInterval(fetchPm2, 3000);
    return () => clearInterval(interval);
  }, [fetchPm2]);

  // 경과 시간 표시 업데이트 (1초)
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastUpdated) setElapsed(formatElapsed(Date.now() - lastUpdated));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300">
          서버 연결 오류: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-surface-300 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}일 ${hours}시간`;
    if (hours > 0) return `${hours}시간 ${mins}분`;
    return `${mins}분`;
  };

  const formatBytes = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const onlineCount = processes.filter((p) => p.status === "online").length;
  const totalCount = processes.length;

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <PageHeader
        title="대시보드"
        description={`${data.hostname} · ${data.time}`}
      >
        <span className="text-xs text-gray-500">{elapsed}</span>
        <button
          onClick={() => { fetchData(); fetchPm2(); }}
          className="p-2 rounded-lg border border-border bg-surface-200 hover:bg-surface-300 transition-colors text-gray-400 hover:text-gray-200"
          aria-label="새로고침"
        >
          <IconRefresh size={16} />
        </button>
      </PageHeader>

      {/* 주요 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="CPU 사용률"
          value={`${data.cpu.usage.toFixed(1)}%`}
          subtitle={`${data.cpu.model} (${data.cpu.cores}코어)`}
          percent={data.cpu.usage}
          color="brand"
        >
          <MiniChart data={cpuHistory.current} color="#10b981" />
        </StatCard>
        <StatCard
          title="메모리"
          value={formatBytes(data.memory.used)}
          subtitle={`${formatBytes(data.memory.total)} 중`}
          percent={data.memory.percent}
          color="blue"
        >
          <MiniChart data={memHistory.current} color="#3b82f6" />
        </StatCard>
        <StatCard
          title="업타임"
          value={formatUptime(data.uptime)}
          subtitle={data.platform}
          color="purple"
        />
        <StatCard
          title="PM2 프로세스"
          value={totalCount > 0 ? `${onlineCount} / ${totalCount}` : "—"}
          subtitle="online"
          color="brand"
        />
      </div>

      {/* 디스크 — 수평 바 형태 */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">디스크</h2>
        <div className="bg-surface-200 border border-border rounded-lg divide-y divide-border">
          {data.disks.map((disk) => (
            <div key={disk.mount} className="flex items-center gap-4 px-5 py-3">
              <span className="text-sm text-gray-300 w-24 shrink-0 truncate" title={disk.mount}>
                {disk.mount}
              </span>
              <div className="flex-1 h-2 bg-surface-400 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${diskBarColor(disk.percent)}`}
                  style={{ width: `${disk.percent}%` }}
                />
              </div>
              <span className={`text-sm font-medium w-12 text-right ${
                disk.percent >= 80 ? "text-red-400" : disk.percent >= 50 ? "text-amber-400" : "text-gray-300"
              }`}>
                {disk.percent.toFixed(0)}%
              </span>
              <span className="text-xs text-gray-500 w-32 text-right shrink-0">
                {formatBytes(disk.used)} / {formatBytes(disk.total)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 시스템 정보 — 2열 그리드 */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">시스템 정보</h2>
        <div className="bg-surface-200 border border-border rounded-lg grid grid-cols-1 md:grid-cols-2">
          {[
            { label: "호스트명", value: data.hostname },
            { label: "플랫폼", value: data.platform },
            { label: "Node.js", value: data.nodeVersion },
            { label: "CPU", value: `${data.cpu.model} (${data.cpu.cores}코어)` },
          ].map((row, idx) => (
            <div
              key={row.label}
              className={`flex justify-between px-5 py-3 text-sm border-border ${
                idx < 2 ? "md:border-b" : ""
              } ${idx % 2 === 0 ? "md:border-r" : ""} ${idx < 3 ? "border-b md:border-b-0" : ""} ${idx < 2 ? "border-b" : ""}`}
            >
              <span className="text-gray-400">{row.label}</span>
              <span className="text-gray-200">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
