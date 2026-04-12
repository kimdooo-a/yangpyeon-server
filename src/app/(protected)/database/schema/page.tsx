"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import type { SchemaGraph } from "@/lib/types/supabase-clone";
import "@xyflow/react/dist/style.css";

const SchemaFlow = dynamic(() => import("./SchemaFlow"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[640px] items-center justify-center rounded-lg border border-border bg-surface-200 text-sm text-gray-500">
      다이어그램 로딩 중...
    </div>
  ),
});

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

  const counts = useMemo(
    () => ({
      tables: graph?.nodes.length ?? 0,
      edges: graph?.edges.length ?? 0,
    }),
    [graph],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Schema Visualizer"
        description="PostgreSQL public 스키마 ER 다이어그램 (information_schema 기반, 드래그 가능)"
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
            테이블 {counts.tables}개 · 관계 {counts.edges}개
          </div>
          <div className="h-[640px] overflow-hidden rounded-lg border border-border bg-surface-200">
            <SchemaFlow graph={graph} />
          </div>
        </div>
      )}
    </div>
  );
}
