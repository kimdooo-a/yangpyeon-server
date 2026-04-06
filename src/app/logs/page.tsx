"use client";

import { useEffect, useRef, useState } from "react";

export default function LogsPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [process, setProcess] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">로그 뷰어</h1>
          <p className="text-gray-500 text-sm mt-1">PM2 프로세스 로그</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={process}
            onChange={(e) => setProcess(e.target.value)}
            className="bg-surface-300 border border-border rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand"
          >
            <option value="all">전체 로그</option>
          </select>
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

      <div
        ref={containerRef}
        className="flex-1 bg-surface-200 border border-border rounded-lg overflow-auto font-mono text-xs leading-5 p-4 min-h-0"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">로그가 없습니다</div>
        ) : (
          logs.map((line, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap ${
                line.includes("error") || line.includes("Error")
                  ? "text-red-400"
                  : line.includes("warn") || line.includes("Warn")
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
