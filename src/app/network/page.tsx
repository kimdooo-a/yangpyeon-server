"use client";

import { useEffect, useState } from "react";

interface TunnelStatus {
  running: boolean;
  connections: number;
}

export default function NetworkPage() {
  const [tunnel, setTunnel] = useState<TunnelStatus | null>(null);

  useEffect(() => {
    const fetchTunnel = async () => {
      try {
        const res = await fetch("/api/tunnel");
        if (res.ok) setTunnel(await res.json());
      } catch {
        // 재시도
      }
    };
    fetchTunnel();
    const interval = setInterval(fetchTunnel, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">네트워크</h1>
        <p className="text-gray-500 text-sm mt-1">Cloudflare Tunnel 상태</p>
      </div>

      {/* Tunnel 상태 카드 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium">Cloudflare Tunnel</h2>
          {tunnel && (
            <span
              className={`flex items-center gap-2 text-xs ${
                tunnel.running ? "text-emerald-400" : "text-red-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  tunnel.running ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                }`}
              />
              {tunnel.running ? "연결됨" : "연결 끊김"}
            </span>
          )}
        </div>

        {tunnel ? (
          <div className="divide-y divide-border">
            <div className="flex justify-between px-5 py-3 text-sm">
              <span className="text-gray-400">상태</span>
              <span className={tunnel.running ? "text-emerald-400" : "text-red-400"}>
                {tunnel.running ? "실행 중" : "중지됨"}
              </span>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm">
              <span className="text-gray-400">프로세스 수</span>
              <span className="text-gray-200">{tunnel.connections}</span>
            </div>
            <div className="flex justify-between px-5 py-3 text-sm">
              <span className="text-gray-400">도메인</span>
              <a
                href="https://stylelucky4u.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                stylelucky4u.com
              </a>
            </div>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-gray-500">로딩 중...</div>
        )}
      </div>

      {/* 네트워크 구조 다이어그램 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">네트워크 구조</h2>
        </div>
        <div className="p-5 font-mono text-xs text-gray-400 leading-6">
          <pre>{`외부 사용자 → https://stylelucky4u.com
  → Cloudflare Edge (인천 ICN)
  → Cloudflare Tunnel (QUIC)
  → WSL2 localhost:3000
  → Next.js 서버 (PM2)`}</pre>
        </div>
      </div>
    </div>
  );
}
