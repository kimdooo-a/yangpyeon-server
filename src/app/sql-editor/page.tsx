"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import type { SqlRunResult } from "@/lib/types/supabase-clone";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 items-center justify-center rounded-lg border border-border bg-surface-200 text-xs text-gray-500">
      에디터 로딩 중...
    </div>
  ),
});

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  scope: "PRIVATE" | "SHARED" | "FAVORITE";
  ownerId: string;
  updatedAt: string;
}

export default function SqlEditorPage() {
  const [sql, setSql] = useState<string>("SELECT id, email, role FROM users LIMIT 20;");
  const [result, setResult] = useState<SqlRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/sql/queries");
      const json = await res.json();
      if (json.success) setSavedQueries(json.data);
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const execute = useCallback(async () => {
    if (!sql.trim()) {
      toast.error("SQL을 입력하세요");
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message ?? "실행 실패");
        return;
      }
      setResult(json.data as SqlRunResult);
      toast.success(`${json.data.rowCount}행 조회 (${json.data.durationMs}ms)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "실행 실패");
    } finally {
      setRunning(false);
    }
  }, [sql]);

  const save = useCallback(async () => {
    if (!saveName.trim() || !sql.trim()) {
      toast.error("이름과 SQL을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/sql/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName, sql, scope: "PRIVATE" }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error?.message ?? "저장 실패");
        return;
      }
      toast.success("저장되었습니다");
      setSaveName("");
      loadSaved();
    } finally {
      setSaving(false);
    }
  }, [saveName, sql, loadSaved]);

  const removeQuery = useCallback(async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/v1/sql/queries/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error?.message ?? "삭제 실패");
      return;
    }
    toast.success("삭제되었습니다");
    loadSaved();
  }, [loadSaved]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="SQL Editor" description="읽기 전용 PostgreSQL 쿼리 실행기 (app_readonly 롤)" />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* 좌측: 에디터 + 결과 */}
        <div className="flex flex-col gap-4">
          <div className="h-64 overflow-hidden rounded-lg border border-border bg-surface-200">
            <MonacoEditor
              height="100%"
              defaultLanguage="sql"
              value={sql}
              onChange={(value) => setSql(value ?? "")}
              theme="vs"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: "on",
                tabSize: 2,
                renderLineHighlight: "line",
                padding: { top: 8, bottom: 8 },
              }}
              onMount={(editor, monaco) => {
                editor.addCommand(
                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                  () => {
                    document.getElementById("sql-execute-btn")?.click();
                  },
                );
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="sql-execute-btn"
              onClick={execute}
              disabled={running}
              className="px-4 py-2 bg-brand text-white rounded hover:bg-brand/90 disabled:opacity-50 text-sm"
              title="Ctrl/Cmd + Enter로 실행"
            >
              {running ? "실행 중..." : "실행 (⌘+⏎)"}
            </button>
            <input
              type="text"
              placeholder="저장 이름"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="px-3 py-2 bg-surface-200 border border-border rounded text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-brand"
            />
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-surface-300 border border-border text-gray-700 rounded hover:bg-surface-300/80 disabled:opacity-50 text-sm"
            >
              저장
            </button>
          </div>

          {/* 결과 */}
          <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
            {result ? (
              <div>
                <div className="px-3 py-2 border-b border-border text-xs text-gray-500 flex items-center gap-3">
                  <span>{result.rowCount}행</span>
                  <span>{result.durationMs}ms</span>
                  {result.truncated && <span className="text-amber-600">(1000행으로 잘림)</span>}
                </div>
                <div className="overflow-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-300 sticky top-0">
                      <tr>
                        {result.fields.map((f) => (
                          <th key={f.name} className="px-3 py-2 text-left font-medium text-gray-700 whitespace-nowrap">
                            {f.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-t border-border hover:bg-surface-300/50">
                          {result.fields.map((f) => (
                            <td key={f.name} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                              {formatCell(row[f.name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {result.rows.length === 0 && (
                        <tr>
                          <td colSpan={result.fields.length || 1} className="px-3 py-8 text-center text-gray-500">
                            결과가 없습니다
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-gray-500 text-sm">
                쿼리를 실행하면 결과가 여기에 표시됩니다
              </div>
            )}
          </div>
        </div>

        {/* 우측: 저장된 쿼리 */}
        <aside className="bg-surface-200 border border-border rounded-lg overflow-hidden h-fit">
          <div className="px-3 py-2 border-b border-border text-xs font-medium text-gray-700">
            저장된 쿼리 ({savedQueries.length})
          </div>
          <ul className="max-h-[600px] overflow-auto">
            {savedQueries.length === 0 ? (
              <li className="px-3 py-6 text-center text-gray-500 text-sm">저장된 쿼리 없음</li>
            ) : (
              savedQueries.map((q) => (
                <li key={q.id} className="border-b border-border last:border-b-0 px-3 py-2 hover:bg-surface-300/50">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSql(q.sql)}
                      className="flex-1 text-left text-sm text-gray-800 hover:text-brand truncate"
                      title={q.sql}
                    >
                      {q.name}
                    </button>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-300 text-gray-500">
                      {q.scope}
                    </span>
                    <button
                      onClick={() => removeQuery(q.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                      aria-label="삭제"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
