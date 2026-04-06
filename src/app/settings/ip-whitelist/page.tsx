"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { IconShield } from "@/components/ui/icons";
import { toast } from "sonner";

interface IpEntry {
  id: number;
  ip: string;
  description: string | null;
  createdAt: string | null;
}

export default function IpWhitelistPage() {
  const [list, setList] = useState<IpEntry[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ip-whitelist");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setList(data.list ?? []);
      setEnabled(data.enabled ?? false);
    } catch {
      toast.error("화이트리스트 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/ip-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), description: description.trim() || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "추가 실패");
        return;
      }

      toast.success(`${ip} 추가 완료`);
      setIp("");
      setDescription("");
      fetchList();
    } catch {
      toast.error("IP 추가 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry: IpEntry) => {
    if (!confirm(`${entry.ip}을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch("/api/settings/ip-whitelist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "삭제 실패");
        return;
      }

      toast.success(`${entry.ip} 삭제 완료`);
      fetchList();
    } catch {
      toast.error("IP 삭제 실패");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="IP 화이트리스트"
        description="허용된 IP만 대시보드에 접근할 수 있습니다"
      />

      {/* 상태 표시 카드 */}
      <div className="bg-surface-200 border border-border rounded-lg p-5">
        <div className="flex items-center gap-3">
          <IconShield size={20} className={enabled ? "text-brand" : "text-gray-500"} />
          <div>
            <p className="text-sm font-medium">
              {enabled ? (
                <span className="text-brand">활성</span>
              ) : (
                <span className="text-gray-500">비활성</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {enabled
                ? list.length === 0
                  ? "화이트리스트가 비어있어 모든 IP가 허용됩니다"
                  : `${list.length}개 IP 허용 중`
                : "환경변수 IP_WHITELIST_ENABLED=true 로 활성화하세요"}
            </p>
          </div>
        </div>
      </div>

      {/* IP 추가 폼 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">IP 추가</h2>
        </div>
        <form onSubmit={handleAdd} className="p-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="IP 주소 (예: 192.168.1.1)"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="flex-1 bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
            required
          />
          <input
            type="text"
            placeholder="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={submitting || !ip.trim()}
            className="px-4 py-2 bg-brand text-black text-sm font-medium rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {submitting ? "추가 중..." : "추가"}
          </button>
        </form>
      </div>

      {/* IP 목록 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">등록된 IP ({list.length})</h2>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            로딩 중...
          </div>
        ) : list.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            등록된 IP가 없습니다. 비어있으면 모든 IP가 허용됩니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-gray-500">
                  <th className="px-5 py-2.5 text-left font-medium">IP</th>
                  <th className="px-5 py-2.5 text-left font-medium">설명</th>
                  <th className="px-5 py-2.5 text-left font-medium">등록일</th>
                  <th className="px-5 py-2.5 text-right font-medium">삭제</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-300 transition-colors"
                  >
                    <td className="px-5 py-2.5 text-gray-800 font-mono text-xs">
                      {entry.ip}
                    </td>
                    <td className="px-5 py-2.5 text-gray-500">
                      {entry.description || "-"}
                    </td>
                    <td className="px-5 py-2.5 text-gray-500 text-xs">
                      {entry.createdAt
                        ? new Date(entry.createdAt).toLocaleDateString("ko-KR")
                        : "-"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(entry)}
                        className="text-red-600 hover:text-red-700 text-xs transition-colors"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
