"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRefresh } from "@/components/ui/icons";
import type { AdvisorFinding } from "@/lib/types/supabase-clone";

function SeverityBadge({ sev }: { sev: AdvisorFinding["severity"] }) {
  const map: Record<AdvisorFinding["severity"], string> = {
    error: "bg-red-50 text-red-600 border-red-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    info: "bg-blue-50 text-blue-600 border-blue-200",
  };
  const label = { error: "ERROR", warn: "WARN", info: "INFO" }[sev];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded border ${map[sev]}`}>
      {label}
    </span>
  );
}

export default function PerformanceAdvisorsPage() {
  const [findings, setFindings] = useState<AdvisorFinding[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/advisors/performance");
      const json = await res.json();
      if (json.success) {
        setFindings(json.data.findings);
        setGeneratedAt(json.data.generatedAt);
      } else {
        setError(json.error?.message ?? "실행 실패");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="성능 어드바이저"
        description="느린 쿼리, 사용되지 않는 인덱스 등 성능 관련 점검을 수행합니다 (ADMIN 전용)"
      >
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-surface-200 border border-border rounded-lg text-sm hover:bg-surface-300 disabled:opacity-60"
        >
          <IconRefresh size={14} />
          재실행
        </button>
      </PageHeader>

      {generatedAt && (
        <p className="text-xs text-gray-500 mt-2">
          실행 시각: {new Date(generatedAt).toLocaleString("ko-KR")}
        </p>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-surface-200 border border-border rounded-lg animate-pulse" />
          ))
        ) : findings.length === 0 ? (
          <EmptyState message="발견된 문제가 없습니다" description="모든 성능 규칙이 통과했습니다" />
        ) : (
          findings.map((f, i) => (
            <div
              key={`${f.ruleId}-${i}`}
              className="p-4 bg-surface-200 border border-border rounded-lg"
            >
              <div className="flex items-start gap-3">
                <SeverityBadge sev={f.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-800">{f.title}</h3>
                    <span className="text-[10px] text-gray-400 font-mono">{f.ruleId}</span>
                  </div>
                  {f.targetObject && (
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{f.targetObject}</p>
                  )}
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{f.detail}</p>
                  {f.remediation && (
                    <pre className="mt-2 p-2 bg-surface-300 rounded text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                      {f.remediation}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
