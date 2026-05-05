"use client";

import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { IconSearch, IconRestart, IconStop, IconPlay } from "@/components/ui/icons";
import { SseIndicator } from "@/components/ui/sse-indicator";
import { usePm2Action } from "@/hooks/use-pm2-action";
import { useSse } from "@/hooks/use-sse";
import { toast } from "sonner";

interface Pm2Process {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

interface ProcessDetail {
  name: string;
  pm_id: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
  pm_exec_path: string;
  pm_cwd: string;
  node_version: string;
  exec_mode: string;
  instances: number;
  pm_out_log_path: string;
  pm_err_log_path: string;
  created_at: string;
}

type StatusFilter = "all" | "online" | "stopped" | "errored";

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<Pm2Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // 폴백용 fetch 함수 (SSE 연결 실패 시 사용)
  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch("/api/pm2");
      const data = await res.json();
      setProcesses(data.processes);
    } catch {
      // 다음 폴링에서 재시도
    } finally {
      setLoading(false);
    }
  }, []);

  const { execute: pm2Action, isPending } = usePm2Action({ onSuccess: fetchProcesses });

  // PM2 프로세스 SSE 구독
  const { status: sseStatus } = useSse<{ processes: Pm2Process[] }>({
    url: "/api/sse/pm2",
    onMessage: (data) => {
      setProcesses(data.processes ?? []);
      setLoading(false);
    },
    fallbackFn: fetchProcesses,
    fallbackInterval: 5000,
  });

  // 요약 카드 수치 계산
  const counts = useMemo(() => {
    const total = processes.length;
    const online = processes.filter((p) => p.status === "online").length;
    const stopped = processes.filter((p) => p.status === "stopped").length;
    const errored = processes.filter((p) => p.status === "errored").length;
    return { total, online, stopped, errored };
  }, [processes]);

  // 검색 + 상태 필터 적용
  const filtered = useMemo(() => {
    return processes.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [processes, search, statusFilter]);

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
      case "online": return "text-emerald-600";
      case "stopped": return "text-gray-500";
      case "errored": return "text-red-600";
      default: return "text-yellow-600";
    }
  };

  const handleRestartAll = async () => {
    const onlineProcs = processes.filter((p) => p.status === "online");
    if (onlineProcs.length === 0) {
      toast.info("재시작할 프로세스가 없습니다");
      return;
    }
    for (const proc of onlineProcs) {
      await pm2Action(proc.name, "restart");
    }
  };

  const openDetail = async (name: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/pm2/detail?name=${encodeURIComponent(name)}`);
      if (res.ok) setDetail(await res.json());
    } catch (e) {
      // S88 후속 — silent catch 표면화. 사용자가 process row 명시적 클릭한 후
      // 호출되므로 무반응 시 디버깅 비용 9배 → console + toast 양쪽 표면화.
      console.error("[processes] detail fetch failed", e);
      toast.error(e instanceof Error ? e.message : "프로세스 상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  };

  // 요약 카드 데이터
  const summaryCards: { label: string; value: number; filter: StatusFilter; color: string }[] = [
    { label: "전체", value: counts.total, filter: "all", color: "text-gray-900" },
    { label: "Online", value: counts.online, filter: "online", color: "text-emerald-600" },
    { label: "Stopped", value: counts.stopped, filter: "stopped", color: "text-gray-500" },
    { label: "Error", value: counts.errored, filter: "errored", color: "text-red-600" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* 1. PageHeader + 모두 재시작 버튼 */}
      <PageHeader title="PM2 프로세스" description="프로세스 관리 및 모니터링">
        <SseIndicator status={sseStatus} />
        <button
          onClick={handleRestartAll}
          className="px-3 py-1.5 text-sm bg-surface-300 hover:bg-surface-400 border border-border rounded transition-colors"
        >
          모두 재시작
        </button>
      </PageHeader>

      {/* 2. 요약 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <button
            key={card.filter}
            onClick={() => setStatusFilter(card.filter === statusFilter ? "all" : card.filter)}
            className={`bg-surface-200 border rounded-lg p-4 text-left transition-colors ${
              statusFilter === card.filter && statusFilter !== "all"
                ? "border-brand"
                : "border-border hover:border-gray-600"
            }`}
          >
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </button>
        ))}
      </div>

      {/* 3. 검색 + 필터 툴바 */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="프로세스 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 text-sm bg-surface-200 border border-border rounded focus:outline-none focus:border-brand transition-colors w-56"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-1.5 text-sm bg-surface-200 border border-border rounded focus:outline-none focus:border-brand transition-colors"
        >
          <option value="all">전체 상태</option>
          <option value="online">online</option>
          <option value="stopped">stopped</option>
          <option value="errored">errored</option>
        </select>
      </div>

      {/* 4. 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-gray-500">
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
              <>
                {[...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-5 py-3"><div className="h-4 w-24 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-3"><div className="h-5 w-16 bg-surface-300 rounded-full animate-pulse" /></td>
                    <td className="px-5 py-3 text-right"><div className="h-4 w-10 bg-surface-300 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3 text-right"><div className="h-4 w-16 bg-surface-300 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3 text-right"><div className="h-4 w-20 bg-surface-300 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3 text-right"><div className="h-4 w-8 bg-surface-300 rounded animate-pulse ml-auto" /></td>
                    <td className="px-5 py-3 text-right"><div className="h-6 w-16 bg-surface-300 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))}
              </>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                  {processes.length === 0 ? "실행 중인 프로세스가 없습니다" : "검색 결과가 없습니다"}
                </td>
              </tr>
            ) : (
              filtered.map((proc) => (
                <tr key={proc.pm_id} className="border-b border-border hover:bg-surface-300 transition-colors">
                  <td className="px-5 py-3">
                    <button onClick={() => openDetail(proc.name)} className="font-medium text-brand hover:underline">
                      {proc.name}
                    </button>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={proc.status} />
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{proc.cpu}%</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatMemory(proc.memory)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatUptime(proc.uptime)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{proc.restarts}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={() => pm2Action(proc.name, "restart")}
                        title="재시작"
                        className="bg-surface-400 hover:bg-surface-300 border border-border rounded p-1.5 transition-colors"
                      >
                        <IconRestart size={14} />
                      </button>
                      {proc.status === "online" ? (
                        <button
                          onClick={() => pm2Action(proc.name, "stop")}
                          title="중지"
                          className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded p-1.5 transition-colors"
                        >
                          <IconStop size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => pm2Action(proc.name, "start")}
                          title="시작"
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 rounded p-1.5 transition-colors"
                        >
                          <IconPlay size={14} />
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

      {/* 상세 정보 모달 */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setDetail(null); setDetailLoading(false); }}>
          <div className="bg-surface-200 border border-border rounded-lg w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <div className="h-5 w-32 bg-surface-300 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-surface-300 rounded animate-pulse mt-2" />
                  </div>
                </div>
                <div className="p-5 space-y-3 max-h-96 overflow-hidden">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <div className="h-3 w-20 bg-surface-300 rounded animate-pulse" />
                      <div className="h-3 w-32 bg-surface-300 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </>
            ) : detail ? (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <h3 className="text-lg font-bold">{detail.name}</h3>
                    <span className={`text-xs ${statusColor(detail.status)}`}>{detail.status}</span>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-gray-500 hover:text-gray-900 text-xl leading-none">&times;</button>
                </div>
                <div className="p-5 space-y-3 text-sm max-h-96 overflow-auto">
                  {[
                    ["PM2 ID", String(detail.pm_id)],
                    ["CPU", `${detail.cpu}%`],
                    ["메모리", formatMemory(detail.memory)],
                    ["업타임", formatUptime(detail.uptime)],
                    ["재시작 횟수", String(detail.restarts)],
                    ["실행 모드", detail.exec_mode],
                    ["인스턴스", String(detail.instances)],
                    ["Node.js", detail.node_version],
                    ["실행 경로", detail.pm_exec_path],
                    ["작업 디렉토리", detail.pm_cwd],
                    ["stdout 로그", detail.pm_out_log_path],
                    ["stderr 로그", detail.pm_err_log_path],
                    ["생성일", detail.created_at],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="text-gray-500 shrink-0">{label}</span>
                      <span className="text-gray-800 text-right break-all">{value || "-"}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
