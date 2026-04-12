"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRefresh } from "@/components/ui/icons";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  type: "PUBLISHABLE" | "SECRET";
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const SCOPES = ["read", "write", "admin"] as const;

export default function ApiKeysPage() {
  const [items, setItems] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<"PUBLISHABLE" | "SECRET">("SECRET");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [submitting, setSubmitting] = useState(false);

  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/api-keys");
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
    if (!name) {
      toast.error("이름은 필수입니다");
      return;
    }
    if (scopes.length === 0) {
      toast.error("스코프를 1개 이상 선택하세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, type, scopes }),
      });
      const json = await res.json();
      if (json.success) {
        setIssuedKey(json.data.plaintext);
        setShowForm(false);
        setName("");
        setScopes(["read"]);
        fetchAll();
      } else {
        toast.error(json.error?.message ?? "발급 실패");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("이 키를 폐기하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    const res = await fetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      toast.success("폐기되었습니다");
      fetchAll();
    } else {
      toast.error(json.error?.message ?? "폐기 실패");
    }
  }

  function copyIssued() {
    if (!issuedKey) return;
    navigator.clipboard.writeText(issuedKey).then(
      () => toast.success("클립보드에 복사되었습니다"),
      () => toast.error("복사 실패")
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="API 키"
        description="서비스 연동용 API 키를 발급/폐기합니다 (ADMIN 전용)"
      >
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-2 bg-brand text-white rounded-lg text-sm hover:opacity-90"
        >
          {showForm ? "취소" : "새 키 발급"}
        </button>
        <button onClick={fetchAll} className="p-2 hover:bg-surface-300 rounded-lg text-gray-500">
          <IconRefresh size={16} />
        </button>
      </PageHeader>

      {issuedKey && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-800">
            이 키는 지금만 확인할 수 있습니다. 안전한 곳에 저장하세요.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 p-2 bg-white border border-amber-200 rounded text-xs font-mono break-all">
              {issuedKey}
            </code>
            <button
              onClick={copyIssued}
              className="px-3 py-2 bg-amber-600 text-white rounded text-xs hover:bg-amber-700"
            >
              복사
            </button>
            <button
              onClick={() => setIssuedKey(null)}
              className="px-3 py-2 bg-white border border-amber-300 rounded text-xs text-amber-700 hover:bg-amber-100"
            >
              닫기
            </button>
          </div>
        </div>
      )}

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
                onChange={(e) => setType(e.target.value as "PUBLISHABLE" | "SECRET")}
                className="w-full px-3 py-2 bg-surface-100 border border-border rounded text-sm"
              >
                <option value="SECRET">SECRET (서버 전용)</option>
                <option value="PUBLISHABLE">PUBLISHABLE (클라이언트 노출 허용)</option>
              </select>
            </label>
          </div>
          <div>
            <span className="block text-xs text-gray-500 mb-1">스코프</span>
            <div className="flex gap-4">
              {SCOPES.map((s) => (
                <label key={s} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={(e) => {
                      if (e.target.checked) setScopes([...scopes, s]);
                      else setScopes(scopes.filter((x) => x !== s));
                    }}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              disabled={submitting}
              onClick={submit}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm disabled:opacity-60"
            >
              {submitting ? "발급 중…" : "발급"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-gray-500">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">Prefix</th>
              <th className="px-4 py-3 font-medium">유형</th>
              <th className="px-4 py-3 font-medium">스코프</th>
              <th className="px-4 py-3 font-medium">마지막 사용</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">로딩…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="p-0">
                <EmptyState message="발급된 키가 없습니다" description="상단에서 새 키를 발급하세요" />
              </td></tr>
            ) : items.map((k) => (
              <tr key={k.id} className="border-b border-border hover:bg-surface-300">
                <td className="px-4 py-3 font-medium">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{k.prefix}</td>
                <td className="px-4 py-3 text-xs">{k.type}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{k.scopes.join(", ")}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("ko-KR") : "-"}
                </td>
                <td className="px-4 py-3">
                  {k.revokedAt ? (
                    <span className="text-xs text-red-600">폐기됨</span>
                  ) : (
                    <span className="text-xs text-emerald-600">활성</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!k.revokedAt && (
                    <button
                      onClick={() => revoke(k.id)}
                      className="text-xs px-2 py-1 bg-surface-100 border border-border rounded text-red-600 hover:bg-red-50"
                    >
                      폐기
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
