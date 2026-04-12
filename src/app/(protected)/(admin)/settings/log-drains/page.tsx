"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRefresh } from "@/components/ui/icons";
import { toast } from "sonner";

interface LogDrain {
  id: string;
  name: string;
  type: "HTTP" | "LOKI" | "WEBHOOK";
  url: string;
  authHeader: string | null;
  filters: unknown;
  enabled: boolean;
  lastDeliveredAt: string | null;
  failureCount: number;
  createdAt: string;
}

const TYPES: LogDrain["type"][] = ["HTTP", "LOKI", "WEBHOOK"];

export default function LogDrainsPage() {
  const [items, setItems] = useState<LogDrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<LogDrain["type"]>("HTTP");
  const [url, setUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [filters, setFilters] = useState("{}");
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/log-drains");
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
    let parsedFilters: Record<string, unknown> = {};
    try {
      parsedFilters = filters.trim() ? JSON.parse(filters) : {};
    } catch {
      toast.error("filters는 유효한 JSON이어야 합니다");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/log-drains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          url,
          authHeader: authHeader || null,
          filters: parsedFilters,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("로그 드레인이 생성되었습니다");
        setShowForm(false);
        setName("");
        setUrl("");
        setAuthHeader("");
        setFilters("{}");
        fetchAll();
      } else {
        toast.error(json.error?.message ?? "생성 실패");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function test(id: string) {
    const res = await fetch(`/api/v1/log-drains/${id}/test`, { method: "POST" });
    const json = await res.json();
    if (json.success) {
      const { delivered, failed, error } = json.data;
      if (failed > 0) toast.error(`실패 ${failed}건: ${error ?? "unknown"}`);
      else toast.success(`테스트 전송 성공 (${delivered}건)`);
      fetchAll();
    } else {
      toast.error(json.error?.message ?? "실행 실패");
    }
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/v1/log-drains/${id}`, { method: "DELETE" });
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
        title="로그 드레인"
        description="대시보드 로그를 외부 관측 플랫폼(Loki/HTTP)으로 전송합니다 (ADMIN 전용)"
      >
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-2 bg-brand text-white rounded-lg text-sm hover:opacity-90"
        >
          {showForm ? "취소" : "새 드레인"}
        </button>
        <button onClick={fetchAll} className="p-2 hover:bg-surface-300 rounded-lg text-gray-500">
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
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">유형</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LogDrain["type"])}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-gray-500 mb-1">URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
                placeholder="https://logs.example.com/ingest"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-gray-500 mb-1">Authorization 헤더 (선택)</span>
              <input
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
                placeholder="Bearer ..."
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-xs text-gray-500 mb-1">필터 (JSON)</span>
              <textarea
                value={filters}
                onChange={(e) => setFilters(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-xs font-mono"
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
              <th className="px-4 py-3 font-medium">유형</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">실패</th>
              <th className="px-4 py-3 font-medium">마지막 전송</th>
              <th className="px-4 py-3 font-medium text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400">로딩…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-0">
                <EmptyState message="등록된 드레인이 없습니다" description="상단에서 추가하세요" />
              </td></tr>
            ) : items.map((d) => (
              <tr key={d.id} className="border-b border-border hover:bg-surface-300">
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="px-4 py-3 text-xs">{d.type}</td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-xs">{d.url}</td>
                <td className="px-4 py-3 text-xs">
                  {d.failureCount > 0 ? (
                    <span className="text-red-600">{d.failureCount}회</span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {d.lastDeliveredAt ? new Date(d.lastDeliveredAt).toLocaleString("ko-KR") : "-"}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => test(d.id)}
                    className="text-xs px-2 py-1 bg-surface-100 border border-border rounded hover:bg-surface-300"
                  >
                    테스트 전송
                  </button>
                  <button
                    onClick={() => remove(d.id)}
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
