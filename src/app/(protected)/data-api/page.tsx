"use client";

/**
 * 세션 14: Data API 콘솔
 * - allowlist에 정의된 테이블 목록 표시
 * - 예제 URL과 테스트 호출 버튼 제공
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { listAllowlistEntries } from "@/lib/data-api/allowlist";

const ALLOWLIST = listAllowlistEntries();

export default function DataApiPage() {
  const [selected, setSelected] = useState<string>(ALLOWLIST[0]?.table ?? "");
  const [response, setResponse] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const test = useCallback(async (table: string) => {
    setLoading(true);
    setSelected(table);
    setResponse(null);
    try {
      const res = await fetch(`/api/v1/data/${table}?limit=5`);
      const json = await res.json();
      setResponse(json);
      if (!json.success) toast.error(json.error?.message ?? "호출 실패");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title="Data API" description="Prisma 기반 REST 스타일 테이블 접근 (allowlist 제한)" />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 테이블 allowlist 카드 */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-700">허용 테이블</h2>
          {ALLOWLIST.map((entry) => (
            <div
              key={entry.table}
              className={`bg-surface-200 border rounded-lg p-4 transition-colors ${
                selected === entry.table ? "border-brand" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-800">{entry.table}</span>
                </div>
                <button
                  onClick={() => test(entry.table)}
                  disabled={loading && selected === entry.table}
                  className="px-3 py-1 bg-brand text-white text-xs rounded hover:bg-brand/90 disabled:opacity-50"
                >
                  테스트 GET
                </button>
              </div>

              <div className="flex flex-wrap gap-1 text-[11px] mb-2">
                <span className="text-gray-500">읽기:</span>
                {entry.readRoles.map((r) => (
                  <span key={r} className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    {r}
                  </span>
                ))}
                <span className="text-gray-500 ml-2">쓰기:</span>
                {entry.writeRoles.map((r) => (
                  <span key={r} className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                    {r}
                  </span>
                ))}
              </div>

              <div className="text-xs text-gray-500 mb-1">노출 컬럼</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {entry.exposedColumns.map((c) => (
                  <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-300 text-gray-700 font-mono">
                    {c}
                  </span>
                ))}
              </div>

              <details className="text-xs mt-2">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-800">예제 URL</summary>
                <ul className="mt-1 space-y-1 font-mono text-gray-700 pl-3">
                  <li>GET /api/v1/data/{entry.table}?limit=10</li>
                  <li>GET /api/v1/data/{entry.table}?id=eq.UUID</li>
                  <li>GET /api/v1/data/{entry.table}?orderBy=createdAt.desc</li>
                  <li>GET /api/v1/data/{entry.table}/:id</li>
                </ul>
              </details>
            </div>
          ))}
        </div>

        {/* 응답 미리보기 */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-700">
            응답 {selected && <span className="text-gray-400 font-normal">— {selected}</span>}
          </h2>
          <pre className="bg-surface-200 border border-border rounded-lg p-4 text-xs overflow-auto max-h-[600px] text-gray-800">
            {loading ? "로딩 중..." : response ? JSON.stringify(response, null, 2) : "좌측의 '테스트 GET'을 눌러보세요"}
          </pre>
        </div>
      </div>

      <section className="mt-8 text-sm text-gray-500 space-y-1">
        <h3 className="font-medium text-gray-700">쿼리 문법</h3>
        <p>operator 9종: eq / neq / gt / gte / lt / lte / like / ilike / in</p>
        <p className="font-mono text-xs">?col=eq.value&col2=gt.10&col3=in.(a,b,c)&orderBy=col.asc&limit=50&offset=0</p>
      </section>
    </div>
  );
}
