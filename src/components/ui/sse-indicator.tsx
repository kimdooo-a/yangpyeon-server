"use client";

import type { SseStatus } from "@/hooks/use-sse";

interface SseIndicatorProps {
  status: SseStatus;
}

const STATUS_CONFIG: Record<SseStatus, { color: string; label: string }> = {
  connected: { color: "bg-emerald-500", label: "실시간" },
  connecting: { color: "bg-yellow-500 animate-pulse", label: "연결 중..." },
  fallback: { color: "bg-amber-500", label: "폴링 모드" },
  disconnected: { color: "bg-gray-500", label: "연결 끊김" },
};

/** SSE 연결 상태 인디케이터 */
export function SseIndicator({ status }: SseIndicatorProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      {config.label}
    </span>
  );
}
