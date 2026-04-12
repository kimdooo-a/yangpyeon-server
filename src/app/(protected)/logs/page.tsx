"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { IconSearch } from "@/components/ui/icons";
import { SseIndicator } from "@/components/ui/sse-indicator";
import { useSse } from "@/hooks/use-sse";

type LogLevel = "all" | "error" | "warn";

interface ParsedLine {
  level: "error" | "warn" | "info" | null;
  content: string;
}

function parseLine(line: string): ParsedLine {
  if (/error/i.test(line)) return { level: "error", content: line };
  if (/warn/i.test(line)) return { level: "warn", content: line };
  if (/info/i.test(line)) return { level: "info", content: line };
  return { level: null, content: line };
}

const LEVEL_BADGE: Record<string, string> = {
  error: "bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-medium",
  warn: "bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded text-[10px] font-medium",
  info: "bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-medium",
};

const LEVEL_LABEL: Record<string, string> = {
  error: "ERROR",
  warn: "WARN",
  info: "INFO",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [process, setProcess] = useState("all");
  const [processList, setProcessList] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LogLevel>("all");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/pm2")
      .then((res) => res.json())
      .then((data) => {
        const names = (data.processes ?? []).map((p: { name: string }) => p.name);
        setProcessList(names);
      })
      .catch(() => {});
  }, []);

  // 폴백용 fetch 함수 (SSE 연결 실패 시 사용)
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/pm2/logs?process=${process}&lines=200`);
      const data = await res.json();
      setLogs(data.logs);
    } catch {
      // 다음 폴링에서 재시도
    }
  }, [process]);

  // 로그 SSE 구독 — process 변경 시 URL이 바뀌어 자동 재연결
  const { status: sseStatus } = useSse<{ logs: string[] }>({
    url: `/api/sse/logs?process=${process}`,
    onMessage: (data) => {
      setLogs(data.logs ?? []);
    },
    fallbackFn: fetchLogs,
    fallbackInterval: 3000,
  });

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((line) => {
    if (level === "error" && !(/error/i.test(line))) return false;
    if (level === "warn" && !(/warn/i.test(line) || /error/i.test(line))) return false;
    if (search && !line.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const scrollToTop = () => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  };

  const scrollToBottom = () => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
  };

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <PageHeader title="로그 뷰어" description="PM2 프로세스 로그">
        <SseIndicator status={sseStatus} />
      </PageHeader>

      {/* 툴바 */}
      <div className="bg-surface-200 border border-border rounded-lg px-4 py-3">
        <div className="flex items-center flex-wrap gap-3">
          <select
            value={process}
            onChange={(e) => setProcess(e.target.value)}
            className="bg-surface-300 border border-border rounded px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand"
          >
            <option value="all">전체 로그</option>
            {processList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LogLevel)}
            className="bg-surface-300 border border-border rounded px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand"
          >
            <option value="all">전체 레벨</option>
            <option value="warn">경고 이상</option>
            <option value="error">에러만</option>
          </select>
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="bg-surface-300 border border-border rounded pl-8 pr-3 py-1.5 text-sm text-gray-800 outline-none focus:border-brand w-44"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded accent-emerald-500"
            />
            자동 스크롤
          </label>
          <span className="ml-auto text-xs text-gray-500">
            {filteredLogs.length}줄 / {logs.length}줄
            {search && <span className="ml-2">(&quot;{search}&quot; 필터 적용됨)</span>}
          </span>
        </div>
      </div>

      {/* 로그 영역 */}
      <div
        ref={containerRef}
        className="flex-1 bg-surface-200 border border-border rounded-t-lg overflow-auto font-mono text-xs leading-5 p-4 min-h-0"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">로그가 없습니다</div>
        ) : (
          filteredLogs.map((line, i) => {
            const parsed = parseLine(line);
            return (
              <div key={i} className="flex hover:bg-surface-300">
                <span className="text-gray-400 w-10 text-right border-r border-border mr-3 pr-3 shrink-0 select-none">
                  {i + 1}
                </span>
                {parsed.level && (
                  <span className={`${LEVEL_BADGE[parsed.level]} shrink-0 self-start mr-2`}>
                    {LEVEL_LABEL[parsed.level]}
                  </span>
                )}
                <span
                  className={`whitespace-pre-wrap break-all ${
                    parsed.level === "error"
                      ? "text-red-600"
                      : parsed.level === "warn"
                        ? "text-yellow-600"
                        : "text-gray-700"
                  }`}
                >
                  {parsed.content}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* 하단 상태바 */}
      <div className="bg-surface-200 border border-border rounded-b-lg px-4 py-2 flex items-center justify-between -mt-4">
        <div className="flex items-center gap-2">
          <button
            onClick={scrollToTop}
            className="text-xs text-gray-500 hover:text-gray-800 bg-surface-300 px-2 py-1 rounded border border-border hover:border-gray-500 transition-colors"
          >
            처음
          </button>
          <button
            onClick={scrollToBottom}
            className="text-xs text-gray-500 hover:text-gray-800 bg-surface-300 px-2 py-1 rounded border border-border hover:border-gray-500 transition-colors"
          >
            끝
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>라인 {filteredLogs.length}/{logs.length}</span>
          <SseIndicator status={sseStatus} />
        </div>
      </div>
    </div>
  );
}
