"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Table2 } from "lucide-react";

interface TableSummary {
  schema: string;
  name: string;
  rowEstimate: number;
  columnCount: number;
}

export default function TablesPage() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/tables")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error?.message ?? "테이블 목록 조회 실패");
        }
        setTables(body.data.tables);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "조회 실패"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
          <Table2 size={20} /> 테이블 에디터
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          public 스키마의 테이블을 읽기 전용으로 탐색합니다. (app_readonly 롤)
        </p>
      </header>

      {loading && <div className="text-sm text-zinc-500">로딩 중…</div>}
      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && tables.length === 0 && (
        <div className="rounded border border-zinc-800 p-6 text-center text-sm text-zinc-500">
          public 스키마에 테이블이 없습니다.
        </div>
      )}

      {!loading && !error && tables.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tables.map((t) => (
            <li key={t.name}>
              <Link
                href={`/tables/${t.name}`}
                className="block rounded border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-600 hover:bg-zinc-900"
              >
                <div className="flex items-center gap-2 font-mono text-sm text-zinc-100">
                  <Table2 size={14} className="text-zinc-400" />
                  {t.name}
                </div>
                <div className="mt-2 flex gap-3 text-xs text-zinc-500">
                  <span>컬럼 {t.columnCount}</span>
                  <span>
                    행 ~{t.rowEstimate.toLocaleString()}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
