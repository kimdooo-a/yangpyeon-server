"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

interface Member {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/v1/members?${params}`);
      const json = await res.json();
      if (json.success) {
        setMembers(json.data);
        setPagination(json.pagination);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const roleLabel: Record<string, string> = {
    ADMIN: "관리자",
    MANAGER: "매니저",
    USER: "사용자",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title="회원 관리" onRefresh={fetchMembers} />

      {/* 검색 */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="이메일 또는 이름 검색..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full max-w-md px-3 py-2 bg-surface-200 border border-border rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand"
        />
      </div>

      {/* 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-gray-400">
              <th className="px-4 py-3 font-medium">이메일</th>
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  로딩 중...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  회원이 없습니다
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/50 hover:bg-surface-300/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/members/${m.id}`}
                      className="text-brand hover:underline"
                    >
                      {m.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{m.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-300 text-gray-300">
                      {roleLabel[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={m.isActive ? "online" : "stopped"}
                      label={m.isActive ? "활성" : "비활성"}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(m.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
          <span>
            전체 {pagination.total}명 (
            {pagination.page}/{pagination.totalPages} 페이지)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-surface-200 border border-border rounded disabled:opacity-50"
            >
              이전
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(pagination.totalPages, p + 1))
              }
              disabled={page === pagination.totalPages}
              className="px-3 py-1 bg-surface-200 border border-border rounded disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
