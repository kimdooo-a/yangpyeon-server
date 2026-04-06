"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { IconNetwork } from "@/components/ui/icons";

interface TunnelStatus {
  running: boolean;
  connections: number;
}

/* 토폴로지 노드 컴포넌트 */
function TopoNode({
  icon,
  label,
  details,
}: {
  icon: React.ReactNode;
  label: string;
  details: string[];
}) {
  return (
    <div className="bg-surface-300 border border-border rounded-lg px-4 py-3 text-center min-w-[120px] shrink-0">
      <div className="flex justify-center mb-1.5 text-gray-300">{icon}</div>
      <p className="font-medium text-sm text-gray-200">{label}</p>
      {details.map((d, i) => (
        <p key={i} className="text-[11px] text-gray-500 leading-tight mt-0.5">
          {d}
        </p>
      ))}
    </div>
  );
}

/* 토폴로지 연결선 컴포넌트 */
function TopoEdge({ protocol }: { protocol?: string }) {
  return (
    <div className="flex flex-col items-center md:flex-row md:items-center shrink-0">
      {/* 세로(모바일) */}
      <div className="flex flex-col items-center md:hidden">
        {protocol && (
          <span className="text-[10px] text-gray-500 mb-0.5">{protocol}</span>
        )}
        <div className="w-px h-6 bg-border" />
        <span className="text-gray-500 text-xs leading-none">▼</span>
      </div>
      {/* 가로(데스크톱) */}
      <div className="hidden md:flex items-center">
        <div className="w-10 h-px bg-border" />
        <div className="flex flex-col items-center -mx-1">
          {protocol && (
            <span className="text-[10px] text-gray-500 -mb-1">{protocol}</span>
          )}
          <span className="text-gray-500 text-xs leading-none">▶</span>
        </div>
        <div className="w-10 h-px bg-border" />
      </div>
    </div>
  );
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
      <PageHeader title="네트워크" description="Cloudflare Tunnel 상태" />

      {/* 요약 카드 2개 */}
      {tunnel ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 카드 1: Tunnel 상태 */}
          <div className="bg-surface-200 border border-border rounded-lg p-5">
            <p className="text-xs text-gray-500 mb-2">Tunnel 상태</p>
            <div className="flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  tunnel.running
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-red-400"
                }`}
              />
              <span
                className={`text-lg font-semibold ${
                  tunnel.running ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {tunnel.running ? "연결됨" : "연결 끊김"}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              프로세스: {tunnel.connections}
            </p>
          </div>

          {/* 카드 2: 도메인 */}
          <div className="bg-surface-200 border border-border rounded-lg p-5">
            <p className="text-xs text-gray-500 mb-2">도메인</p>
            <a
              href="https://stylelucky4u.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold text-brand hover:underline"
            >
              stylelucky4u.com
            </a>
            <p className="text-sm text-emerald-400 mt-2 flex items-center gap-1">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              HTTPS 보안 연결
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-surface-200 border border-border rounded-lg px-5 py-8 text-center text-gray-500">
          로딩 중...
        </div>
      )}

      {/* CSS 기반 토폴로지 다이어그램 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">네트워크 토폴로지</h2>
        </div>
        <div className="p-5 overflow-x-auto">
          <div className="flex flex-col items-center md:flex-row md:items-center md:justify-between gap-0 min-w-0">
            <TopoNode
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
              label="외부 사용자"
              details={["브라우저"]}
            />

            <TopoEdge protocol="HTTPS" />

            <TopoNode
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
                </svg>
              }
              label="Cloudflare Edge"
              details={["ICN (인천)", "HTTPS 종단"]}
            />

            <TopoEdge protocol="QUIC" />

            <TopoNode
              icon={<IconNetwork size={20} />}
              label="Tunnel"
              details={["cloudflared", "암호화 터널"]}
            />

            <TopoEdge protocol="HTTP" />

            <TopoNode
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              }
              label="WSL2 서버"
              details={["localhost:3000", "Next.js · PM2"]}
            />
          </div>
        </div>
      </div>

      {/* 연결 정보 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">연결 정보</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 divide-border">
          <div className="px-5 py-3 text-sm flex justify-between md:border-r md:border-border">
            <span className="text-gray-400">프로토콜</span>
            <span className="text-gray-200">QUIC</span>
          </div>
          <div className="px-5 py-3 text-sm flex justify-between">
            <span className="text-gray-400">포트</span>
            <span className="text-gray-200">3000</span>
          </div>
          <div className="px-5 py-3 text-sm flex justify-between md:border-r md:border-border md:border-t">
            <span className="text-gray-400">리전</span>
            <span className="text-gray-200">ICN (인천)</span>
          </div>
          <div className="px-5 py-3 text-sm flex justify-between md:border-t md:border-border">
            <span className="text-gray-400">TLS</span>
            <span className="text-gray-200">Cloudflare Edge 종단</span>
          </div>
        </div>
      </div>
    </div>
  );
}
