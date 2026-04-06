"use client";

import { useEffect, useRef, useState } from "react";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemInfo } from "@/components/dashboard/system-info";
import { MiniChart } from "@/components/dashboard/mini-chart";

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

const MAX_HISTORY = 20;

function diskColor(percent: number): "brand" | "amber" | "red" {
  if (percent < 50) return "brand";
  if (percent < 80) return "amber";
  return "red";
}

export default function DashboardPage() {
  const [data, setData] = useState<SystemData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cpuHistory = useRef<number[]>([]);
  const memHistory = useRef<number[]>([]);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/system");
      if (!res.ok) throw new Error("API 응답 오류");
      const json: SystemData = await res.json();
      setData(json);
      setError(null);

      cpuHistory.current = [...cpuHistory.current, json.cpu.usage].slice(-MAX_HISTORY);
      memHistory.current = [...memHistory.current, json.memory.percent].slice(-MAX_HISTORY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-gray-500 text-sm mt-1">
          {data.hostname} &middot; {data.time}
        </p>
      </div>

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
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">디스크</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.disks.map((disk) => (
            <StatCard
              key={disk.mount}
              title={`디스크 ${disk.mount}`}
              value={formatBytes(disk.used)}
              subtitle={`${formatBytes(disk.total)} 중 (여유 ${formatBytes(disk.free)})`}
              percent={disk.percent}
              color={diskColor(disk.percent)}
            />
          ))}
        </div>
      </div>

      <SystemInfo data={data} />
    </div>
  );
}
