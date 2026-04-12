"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRefresh } from "@/components/ui/icons";
import { toast } from "sonner";

interface Webhook {
  id: string;
  name: string;
  sourceTable: string;
  event: string;
  url: string;
  headers: unknown;
  secret: string | null;
  enabled: boolean;
  lastTriggeredAt: string | null;
  failureCount: number;
  createdAt: string;
}

const TABLES = ["users", "folders", "files", "sql_queries", "webhooks", "cron_jobs"];
const EVENTS = ["INSERT", "UPDATE", "DELETE", "ANY"];

export default function WebhooksPage() {
  const [items, setItems] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [sourceTable, setSourceTable] = useState<string>("users");
  const [event, setEvent] = useState<string>("ANY");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/webhooks");
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function submit() {
    if (!name || !url) {
      toast.error("이름과 URL은 필수입니다");
      return;
    }
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = headers.trim() ? JSON.parse(headers) : {};
    } catch {
      toast.error("headers는 유효한 JSON이어야 합니다");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          sourceTable,
          event,
          url,
          headers: parsedHeaders,
          secret: secret || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("웹훅이 생성되었습니다");
        setShowForm(false);
        setName("");
        setUrl("");
        setHeaders("{}");
        setSecret("");
        fetchAll();
      } else {
        toast.error(json.error?.message ?? "생성 실패");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function trigger(id: string) {
    const res = await fetch(`/api/v1/webhooks/${id}/trigger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (json.success) {
      const { ok, status, error, durationMs } = json.data;
      if (ok) toast.success(`테스트 성공 (${status}, ${durationMs}ms)`);
      else toast.error(`테스트 실패: ${error ?? "unknown"} (${durationMs}ms)`);
      fetchAll();
    } else {
      toast.error(json.error?.message ?? "실행 실패");
    }
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/v1/webhooks/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      toast.success("삭제되었습니다");
      fetchAll();
    } else {
      toast.error(json.error?.message ?? "삭제 실패");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="데이터베이스 웹훅"
        description="테이블 이벤트를 외부 HTTPS 엔드포인트로 전달합니다"
      >
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-2 bg-brand text-white rounded-lg text-sm hover:opacity-90"
        >
          {showForm ? "취소" : "새 웹훅"}
        </button>
        <button
          onClick={fetchAll}
          className="p-2 hover:bg-surface-300 rounded-lg text-gray-500"
        >
          <IconRefresh size={16} />
        </button>
      </PageHeader>

      {showForm && (
        <div className="mt-4 p-4 bg-surface-200 border border-border rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">이름</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
                placeholder="예: 신규 가입 알림"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">URL (HTTPS)</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
                placeholder="https://example.com/hook"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">대상 테이블</span>
              <select
                value={sourceTable}
                onChange={(e) => setSourceTable(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
              >
                {TABLES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">이벤트</span>
              <select
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
              >
                {EVENTS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-gray-500 mb-1">헤더 (JSON)</span>
              <textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-xs font-mono"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-gray-500 mb-1">시크릿 (선택, X-Webhook-Secret 헤더로 전송)</span>
              <input
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              disabled={submitting}
              onClick={submit}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm disabled:opacity-60"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-gray-500">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">테이블/이벤트</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">실패</th>
              <th className="px-4 py-3 font-medium">마지막 실행</th>
              <th className="px-4 py-3 font-medium text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400">로딩…</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState message="등록된 웹훅이 없습니다" description="상단 [새 웹훅] 으로 추가하세요" />
                </td>
              </tr>
            ) : items.map((w) => (
              <tr key={w.id} className="border-b border-border hover:bg-surface-300">
                <td className="px-4 py-3 font-medium">{w.name}</td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="font-mono text-xs">{w.sourceTable}</span>
                  <span className="mx-1 text-gray-400">/</span>
                  <span className="text-xs">{w.event}</span>
                </td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{w.url}</td>
                <td className="px-4 py-3">
                  {w.failureCount > 0 ? (
                    <span className="text-red-600 text-xs">{w.failureCount}회</span>
                  ) : (
                    <span className="text-gray-400 text-xs">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {w.lastTriggeredAt ? new Date(w.lastTriggeredAt).toLocaleString("ko-KR") : "-"}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => trigger(w.id)}
                    className="text-xs px-2 py-1 bg-surface-100 border border-border rounded hover:bg-surface-300"
                  >
                    테스트 전송
                  </button>
                  <button
                    onClick={() => remove(w.id)}
                    className="text-xs px-2 py-1 bg-surface-100 border border-border rounded text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
