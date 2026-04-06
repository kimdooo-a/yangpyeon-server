"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";

interface MemberDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchMember() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/members/${params.id}`);
      const json = await res.json();
      if (json.success) setMember(json.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMember();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleToggleActive() {
    if (!member) return;
    if (member.isActive) {
      const res = await fetch(`/api/v1/members/${member.id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchMember();
    } else {
      const res = await fetch(`/api/v1/members/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (res.ok) fetchMember();
    }
  }

  async function handleRoleChange(role: string) {
    if (!member) return;
    const res = await fetch(`/api/v1/members/${member.id}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) fetchMember();
  }

  const roleLabel: Record<string, string> = {
    ADMIN: "관리자",
    MANAGER: "매니저",
    USER: "사용자",
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="p-6">
        <p className="text-gray-500">회원을 찾을 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="회원 상세" onRefresh={fetchMember} />

      <div className="bg-surface-200 border border-border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">이메일</span>
            <p className="text-gray-200 mt-1">{member.email}</p>
          </div>
          <div>
            <span className="text-gray-500">이름</span>
            <p className="text-gray-200 mt-1">{member.name ?? "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">전화번호</span>
            <p className="text-gray-200 mt-1">{member.phone ?? "-"}</p>
          </div>
          <div>
            <span className="text-gray-500">역할</span>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={member.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="bg-surface-300 border border-border rounded px-2 py-1 text-gray-200 text-sm"
              >
                {Object.entries(roleLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="text-gray-500">상태</span>
            <p className={`mt-1 ${member.isActive ? "text-green-400" : "text-red-400"}`}>
              {member.isActive ? "활성" : "비활성"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">마지막 로그인</span>
            <p className="text-gray-200 mt-1">
              {member.lastLoginAt
                ? new Date(member.lastLoginAt).toLocaleString("ko-KR")
                : "없음"}
            </p>
          </div>
          <div>
            <span className="text-gray-500">가입일</span>
            <p className="text-gray-200 mt-1">
              {new Date(member.createdAt).toLocaleString("ko-KR")}
            </p>
          </div>
          <div>
            <span className="text-gray-500">수정일</span>
            <p className="text-gray-200 mt-1">
              {new Date(member.updatedAt).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm bg-surface-300 border border-border rounded-lg text-gray-300 hover:text-gray-100"
          >
            목록으로
          </button>
          <button
            onClick={handleToggleActive}
            className={`px-4 py-2 text-sm rounded-lg ${
              member.isActive
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
            }`}
          >
            {member.isActive ? "비활성화" : "활성화"}
          </button>
        </div>
      </div>
    </div>
  );
}
