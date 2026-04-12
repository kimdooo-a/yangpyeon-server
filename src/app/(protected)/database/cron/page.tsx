"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

interface CronRow {
  id: string;
  name: string;
  schedule: string;
  kind: "SQL" | "FUNCTION" | "WEBHOOK";
  payload: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
}

export default function CronPage() {
  const [rows, setRows] = useState<CronRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    schedule: "*/5 * * * *",
    kind: "SQL" as "SQL" | "FUNCTION" | "WEBHOOK",
    payload: '{"sql":"select 1"}',
  });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/cron");
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
    let payload: Record<string, unknown> = {};
    try {
      payload = form.payload.trim() ? JSON.parse(form.payload) : {};
    } catch {
      toast.error("payload JSON 파싱 실패");
      return;
    }
    const res = await fetch("/api/v1/cron", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        schedule: form.schedule,
        kind: form.kind,
        payload,
      }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Cron Job 생성 완료");
      setShowCreate(false);
      setForm({ name: "", schedule: "*/5 * * * *", kind: "SQL", payload: '{"sql":"select 1"}' });
      fetchList();
    } else {
      toast.error(json.error?.message ?? "생성 실패");
    }
  }

  async function toggleEnabled(row: CronRow) {
    const res = await fetch(`/api/v1/cron/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success(row.enabled ? "비활성화" : "활성화");
      fetchList();
    } else {
      toast.error(json.error?.message ?? "변경 실패");
    }
  }

  async function runNow(row: CronRow) {
    const res = await fetch(`/api/v1/cron/${row.id}/run`, { method: "POST" });
    const json = await res.json();
    if (json.success) {
      toast.success(`실행 결과: ${json.data.status}${json.data.message ? ` · ${json.data.message}` : ""}`);
      fetchList();
    } else {
      toast.error(json.error?.message ?? "실행 실패");
    }
  }

  async function handleDelete(row: CronRow) {
    if (!confirm(`"${row.name}" 삭제?`)) return;
    const res = await fetch(`/api/v1/cron/${row.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      toast.success("삭제됨");
      fetchList();
    } else {
      toast.error(json.error?.message ?? "삭제 실패");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Cron Jobs" description="주기 실행 작업 관리 (생성/수정: MANAGER+, 활성화/실행: ADMIN)">
        <Button onClick={() => setShowCreate(true)}>신규 Cron</Button>
      </PageHeader>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 text-sm font-medium">Cron 목록</div>
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">등록된 Cron Job이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">이름</th>
                <th className="px-4 py-2">Schedule</th>
                <th className="px-4 py-2">Kind</th>
                <th className="px-4 py-2">활성</th>
                <th className="px-4 py-2">마지막 실행</th>
                <th className="px-4 py-2">상태</th>
                <th className="px-4 py-2 text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.schedule}</td>
                  <td className="px-4 py-2">{r.kind}</td>
                  <td className="px-4 py-2">{r.enabled ? "예" : "아니오"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.lastRunAt ? new Date(r.lastRunAt).toLocaleString("ko-KR") : "-"}
                  </td>
                  <td className="px-4 py-2 text-xs">{r.lastStatus ?? "-"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="outline" onClick={() => runNow(r)}>
                        지금 실행
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => toggleEnabled(r)}>
                        {r.enabled ? "비활성" : "활성"}
                      </Button>
                      <Button size="xs" variant="destructive" onClick={() => handleDelete(r)}>
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

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-popover p-4 shadow-xl ring-1 ring-foreground/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold">신규 Cron Job</h2>
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
                <label className="mb-1 block text-xs font-medium">Schedule (cron 5필드 또는 "every 5m")</label>
                <input
                  className="w-full rounded-md border bg-background px-2 py-1 font-mono text-xs"
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Kind</label>
                <select
                  className="w-full rounded-md border bg-background px-2 py-1"
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as "SQL" | "FUNCTION" | "WEBHOOK" })}
                >
                  <option value="SQL">SQL (읽기 전용)</option>
                  <option value="FUNCTION">FUNCTION (Edge Function)</option>
                  <option value="WEBHOOK">WEBHOOK</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">
                  Payload JSON (SQL: {`{"sql":"..."}`} / FUNCTION: {`{"functionId":"...","input":{}}`} / WEBHOOK: {`{"webhookId":"..."}`})
                </label>
                <textarea
                  className="h-32 w-full rounded-md border bg-background p-2 font-mono text-xs"
                  value={form.payload}
                  onChange={(e) => setForm({ ...form, payload: e.target.value })}
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
