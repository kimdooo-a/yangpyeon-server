"use client";

/**
 * 세션 14: Schema Visualizer (MVP)
 * - information_schema 기반 테이블/컬럼/FK 렌더
 * - TODO: @xyflow/react 설치 후 드래그 가능한 노드/엣지 뷰로 교체
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import type { SchemaGraph } from "@/lib/types/supabase-clone";

export default function SchemaPage() {
  const [graph, setGraph] = useState<SchemaGraph | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/schema");
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message ?? "스키마 조회 실패");
        return;
      }
      setGraph(json.data as SchemaGraph);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Schema Visualizer"
        description="PostgreSQL public 스키마의 테이블 및 관계 (information_schema 기반)"
      >
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 bg-brand text-white rounded hover:bg-brand/90 disabled:opacity-50 text-sm"
        >
          {loading ? "로딩..." : "새로고침"}
        </button>
      </PageHeader>

      {!graph && loading && (
        <div className="mt-6 text-center text-sm text-gray-500">스키마를 불러오는 중...</div>
      )}

      {graph && (
        <div className="mt-6">
          <div className="mb-3 text-sm text-gray-500">
            테이블 {graph.nodes.length}개 · 관계 {graph.edges.length}개
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {graph.nodes.map((node) => (
              <div key={node.id} className="bg-surface-200 border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-surface-300 border-b border-border">
                  <div className="font-medium text-sm text-gray-800">{node.table}</div>
                  <div className="text-[11px] text-gray-500">{node.schema}</div>
                </div>
                <ul className="text-xs">
                  {node.columns.map((col) => (
                    <li
                      key={col.name}
                      className="flex items-center justify-between px-3 py-1.5 border-b border-border last:border-b-0"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-gray-800 truncate">{col.name}</span>
                        {col.isPrimaryKey && (
                          <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]">PK</span>
                        )}
                        {col.isForeignKey && (
                          <span className="px-1 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px]">FK</span>
                        )}
                      </div>
                      <span className="text-gray-500 font-mono ml-2 shrink-0">{col.dataType}</span>
                    </li>
                  ))}
                </ul>
                {/* FK 참조 */}
                {node.columns.some((c) => c.isForeignKey) && (
                  <div className="px-3 py-2 border-t border-border bg-surface-200 text-[11px] text-gray-500 space-y-0.5">
                    {node.columns
                      .filter((c) => c.isForeignKey && c.references)
                      .map((c) => (
                        <div key={c.name}>
                          <span className="font-mono text-gray-700">{c.name}</span>
                          <span className="mx-1">→</span>
                          <span className="font-mono text-gray-700">
                            {c.references!.table}.{c.references!.column}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TODO: @xyflow/react 설치 후 드래그 가능한 ER 다이어그램으로 교체 예정 */}
    </div>
  );
}
