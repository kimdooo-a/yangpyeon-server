"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FUNCTION_TEMPLATES } from "@/lib/functions/templates";

interface FunctionRow {
  id: string;
  name: string;
  description: string | null;
  runtime: string;
  enabled: boolean;
  updatedAt: string;
  lastRun: { startedAt: string; status: string } | null;
}

interface RunRow {
  id: string;
  status: string;
  durationMs: number | null;
  startedAt: string;
  stdout: string | null;
  stderr: string | null;
}

export default function FunctionsPage() {
  const [rows, setRows] = useState<FunctionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    code: FUNCTION_TEMPLATES[0].code,
    runtime: "NODE_VM" as "NODE_VM" | "WORKER_THREAD",
  });
  const [recentRuns, setRecentRuns] = useState<RunRow[]>([]);
  const [recentRunsFor, setRecentRunsFor] = useState<string | null>(null);
  const [runInput, setRunInput] = useState("{}");
  const [runTargetId, setRunTargetId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/functions");
      const json = await res.json();
      if (json.success) setRows(json.data);
      else toast.error(json.error?.message ?? "목록 조회 실패");
    } catch {
      toast.error("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function handleCreate() {
    if (!form.name.trim()) {
      toast.error("이름을 입력하세요");
      return;
    }
    if (!form.code.trim()) {
      toast.error("코드를 입력하세요");
      return;
    }
    const res = await fetch("/api/v1/functions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("함수가 생성되었습니다");
      setShowCreate(false);
      setForm({ name: "", description: "", code: FUNCTION_TEMPLATES[0].code, runtime: "NODE_VM" });
      fetchList();
    } else {
      toast.error(json.error?.message ?? "생성 실패");
    }
  }

  async function handleRun(id: string) {
    let input: unknown = null;
    try {
      input = runInput.trim() ? JSON.parse(runInput) : null;
    } catch {
      toast.error("입력 JSON 파싱 실패");
      return;
    }
    const res = await fetch(`/api/v1/functions/${id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    const json = await res.json();
    if (json.success) {
      const { status, durationMs, returnValue, stderr } = json.data;
      if (status === "SUCCESS") {
        toast.success(`실행 성공 (${durationMs}ms): ${JSON.stringify(returnValue ?? null).slice(0, 120)}`);
      } else {
        toast.error(`${status} (${durationMs}ms): ${(stderr || "오류").slice(0, 120)}`);
      }
      loadRuns(id);
      fetchList();
    } else {
      toast.error(json.error?.message ?? "실행 실패");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/v1/functions/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      toast.success("삭제되었습니다");
      fetchList();
      if (recentRunsFor === id) {
        setRecentRunsFor(null);
        setRecentRuns([]);
      }
    } else {
      toast.error(json.error?.message ?? "삭제 실패");
    }
  }

  async function loadRuns(id: string) {
    setRecentRunsFor(id);
    const res = await fetch(`/api/v1/functions/${id}/runs`);
    const json = await res.json();
    if (json.success) setRecentRuns(json.data.slice(0, 5));
  }

  function applyTemplate(tplId: string) {
    const t = FUNCTION_TEMPLATES.find((x) => x.id === tplId);
    if (!t) return;
    setForm((f) => ({ ...f, code: t.code, description: f.description || t.description }));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edge Functions" description="격리 실행 환경에서 관리자 전용 코드 스니펫을 실행합니다 (ADMIN 전용)">
        <Button onClick={() => setShowCreate(true)}>신규 함수</Button>
      </PageHeader>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 text-sm font-medium">함수 목록</div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">등록된 함수가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">이름</th>
                <th className="px-4 py-2">Runtime</th>
                <th className="px-4 py-2">활성</th>
                <th className="px-4 py-2">최근 실행</th>
                <th className="px-4 py-2 text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2">{r.runtime}</td>
                  <td className="px-4 py-2">{r.enabled ? "예" : "아니오"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.lastRun
                      ? `${new Date(r.lastRun.startedAt).toLocaleString("ko-KR")} · ${r.lastRun.status}`
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setRunTargetId(r.id);
                          setRunInput("{}");
                        }}
                      >
                        실행
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => loadRuns(r.id)}>
                        로그
                      </Button>
                      <Button size="xs" variant="destructive" onClick={() => handleDelete(r.id)}>
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {runTargetId && (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-2 text-sm font-medium">실행 입력 (JSON)</div>
          <textarea
            className="h-24 w-full rounded-md border bg-background p-2 font-mono text-xs"
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (runTargetId) handleRun(runTargetId);
              }}
            >
              실행
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRunTargetId(null)}>
              취소
            </Button>
          </div>
        </div>
      )}

      {recentRunsFor && (
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm font-medium">최근 실행 (최대 5개)</div>
          {recentRuns.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">실행 기록 없음</div>
          ) : (
            <ul className="divide-y">
              {recentRuns.map((run) => (
                <li key={run.id} className="px-4 py-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{run.status}</span>
                    <span className="text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString("ko-KR")} · {run.durationMs ?? "-"}ms
                    </span>
                  </div>
                  {run.stdout && <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{run.stdout}</pre>}
                  {run.stderr && <pre className="mt-1 whitespace-pre-wrap text-destructive">{run.stderr}</pre>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-popover p-4 shadow-xl ring-1 ring-foreground/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold">신규 함수</h2>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium">이름</label>
                <input
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">설명</label>
                <input
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium">Runtime</label>
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1"
                    value={form.runtime}
                    onChange={(e) => setForm({ ...form, runtime: e.target.value as "NODE_VM" | "WORKER_THREAD" })}
                  >
                    <option value="NODE_VM">NODE_VM</option>
                    <option value="WORKER_THREAD">WORKER_THREAD</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium">템플릿</label>
                  <select
                    className="w-full rounded-md border bg-background px-2 py-1"
                    onChange={(e) => applyTemplate(e.target.value)}
                    defaultValue={FUNCTION_TEMPLATES[0].id}
                  >
                    {FUNCTION_TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">코드 (async function run(input) {`{ ... }`})</label>
                <textarea
                  className="h-64 w-full rounded-md border bg-background p-2 font-mono text-xs"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                취소
              </Button>
              <Button onClick={handleCreate}>생성</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
