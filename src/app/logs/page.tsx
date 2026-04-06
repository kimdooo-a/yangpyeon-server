"use client";

import { useEffect, useRef, useState } from "react";

type LogLevel = "all" | "error" | "warn";

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

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/pm2/logs?process=${process}&lines=200`);
      const data = await res.json();
      setLogs(data.logs);
    } catch {
      // 다음 폴링에서 재시도
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [process]);

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

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">로그 뷰어</h1>
          <p className="text-gray-500 text-sm mt-1">PM2 프로세스 로그</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={process}
            onChange={(e) => setProcess(e.target.value)}
            className="bg-surface-300 border border-border rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand"
          >
            <option value="all">전체 로그</option>
            {processList.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LogLevel)}
            className="bg-surface-300 border border-border rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand"
          >
            <option value="all">전체 레벨</option>
            <option value="warn">경고 이상</option>
            <option value="error">에러만</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색..."
            className="bg-surface-300 border border-border rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand w-40"
          />
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded accent-emerald-500"
            />
            자동 스크롤
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{filteredLogs.length}줄</span>
        {search && <span>(&quot;{search}&quot; 필터 적용됨)</span>}
      </div>

      <div
        ref={containerRef}
        className="flex-1 bg-surface-200 border border-border rounded-lg overflow-auto font-mono text-xs leading-5 p-4 min-h-0"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">로그가 없습니다</div>
        ) : (
          filteredLogs.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap ${
                /error/i.test(line)
                  ? "text-red-400"
                  : /warn/i.test(line)
                    ? "text-yellow-400"
                    : "text-gray-300"
              }`}
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
