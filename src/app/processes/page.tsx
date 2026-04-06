"use client";

import { useEffect, useState } from "react";

interface Pm2Process {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<Pm2Process[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProcesses = async () => {
    try {
      const res = await fetch("/api/pm2");
      const data = await res.json();
      setProcesses(data.processes);
    } catch {
      // 에러 무시 — 다음 폴링에서 재시도
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
    if (hours > 0) return `${hours}시간 ${mins}분`;
    return `${mins}분`;
  };

  const formatMemory = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "online":
        return "text-emerald-400";
      case "stopped":
        return "text-gray-500";
      case "errored":
        return "text-red-400";
      default:
        return "text-yellow-400";
    }
  };

  const statusDot = (status: string) => {
    switch (status) {
      case "online":
        return "bg-emerald-400";
      case "stopped":
        return "bg-gray-500";
      case "errored":
        return "bg-red-400";
      default:
        return "bg-yellow-400";
    }
  };

  const handleAction = async (name: string, action: "restart" | "stop" | "start") => {
    await fetch(`/api/pm2/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setTimeout(fetchProcesses, 1000);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">PM2 프로세스</h1>
        <p className="text-gray-500 text-sm mt-1">프로세스 관리 및 모니터링</p>
      </div>

      <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-gray-400">
              <th className="text-left px-5 py-3 font-medium">이름</th>
              <th className="text-left px-5 py-3 font-medium">상태</th>
              <th className="text-right px-5 py-3 font-medium">CPU</th>
              <th className="text-right px-5 py-3 font-medium">메모리</th>
              <th className="text-right px-5 py-3 font-medium">업타임</th>
              <th className="text-right px-5 py-3 font-medium">재시작</th>
              <th className="text-right px-5 py-3 font-medium">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                  로딩 중...
                </td>
              </tr>
            ) : processes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                  실행 중인 프로세스가 없습니다
                </td>
              </tr>
            ) : (
              processes.map((proc) => (
                <tr key={proc.pm_id} className="border-b border-border hover:bg-surface-300 transition-colors">
                  <td className="px-5 py-3 font-medium">{proc.name}</td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDot(proc.status)}`} />
                      <span className={statusColor(proc.status)}>{proc.status}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-gray-300">{proc.cpu}%</td>
                  <td className="px-5 py-3 text-right text-gray-300">{formatMemory(proc.memory)}</td>
                  <td className="px-5 py-3 text-right text-gray-300">{formatUptime(proc.uptime)}</td>
                  <td className="px-5 py-3 text-right text-gray-300">{proc.restarts}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleAction(proc.name, "restart")}
                        className="px-2.5 py-1 text-xs bg-surface-400 hover:bg-surface-300 border border-border rounded transition-colors"
                      >
                        재시작
                      </button>
                      {proc.status === "online" ? (
                        <button
                          onClick={() => handleAction(proc.name, "stop")}
                          className="px-2.5 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-300 rounded transition-colors"
                        >
                          중지
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(proc.name, "start")}
                          className="px-2.5 py-1 text-xs bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-800/50 text-emerald-300 rounded transition-colors"
                        >
                          시작
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
