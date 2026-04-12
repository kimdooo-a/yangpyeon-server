"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRefresh, IconUsers } from "@/components/ui/icons";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS = ["ADMIN", "MANAGER", "USER"] as const;

const roleLabel: Record<string, string> = {
  ADMIN: "관리자",
  MANAGER: "매니저",
  USER: "사용자",
};

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // 추가 폼 상태
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("USER");
  const [submitting, setSubmitting] = useState(false);

  // 역할 변경 / 상태 변경 진행 중인 사용자 ID
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/users");
      const json = await res.json();
      if (json.success) {
        setUsers(json.data);
      } else {
        toast.error(json.error?.message ?? "사용자 목록 조회 실패");
      }
    } catch {
      toast.error("사용자 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 사용자 생성
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || undefined,
          password: newPassword,
          role: newRole,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message ?? "사용자 생성 실패");
        return;
      }

      toast.success(`${newEmail} 사용자 생성 완료`);
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRole("USER");
      fetchUsers();
    } catch {
      toast.error("사용자 생성 실패");
    } finally {
      setSubmitting(false);
    }
  };

  // 역할 변경
  const handleRoleChange = async (userId: string, role: string) => {
    setUpdatingId(userId);
    try {
      const res = await fetch("/api/settings/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message ?? "역할 변경 실패");
        return;
      }

      toast.success("역할이 변경되었습니다");
      // 로컬 상태 업데이트
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role } : u)),
      );
    } catch {
      toast.error("역할 변경 실패");
    } finally {
      setUpdatingId(null);
    }
  };

  // 활성/비활성 토글
  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setUpdatingId(userId);
    try {
      const res = await fetch("/api/settings/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, isActive: !currentActive }),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message ?? "상태 변경 실패");
        return;
      }

      toast.success(currentActive ? "비활성화되었습니다" : "활성화되었습니다");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, isActive: !currentActive } : u,
        ),
      );
    } catch {
      toast.error("상태 변경 실패");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="사용자 관리"
        description="대시보드 사용자 계정을 관리합니다"
      >
        <button
          onClick={fetchUsers}
          className="p-2 hover:bg-surface-300 rounded-lg transition-colors text-gray-500 hover:text-gray-800"
        >
          <IconRefresh size={16} />
        </button>
      </PageHeader>

      {/* 사용자 추가 폼 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">사용자 추가</h2>
        </div>
        <form onSubmit={handleCreate} className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="이메일 *"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
              required
            />
            <input
              type="text"
              placeholder="이름 (선택)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <input
              type="password"
              placeholder="비밀번호 (8자 이상) *"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-brand"
              required
              minLength={8}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-surface-300 border border-border rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !newEmail.trim() || !newPassword.trim()}
              className="px-4 py-2 bg-brand text-black text-sm font-medium rounded-md hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "생성 중..." : "사용자 추가"}
            </button>
          </div>
        </form>
      </div>

      {/* 사용자 목록 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium">
            사용자 목록 ({users.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-gray-500">
                <th className="px-5 py-2.5 font-medium">이메일</th>
                <th className="px-5 py-2.5 font-medium">이름</th>
                <th className="px-5 py-2.5 font-medium">역할</th>
                <th className="px-5 py-2.5 font-medium">상태</th>
                <th className="px-5 py-2.5 font-medium">마지막 로그인</th>
                <th className="px-5 py-2.5 font-medium">가입일</th>
                <th className="px-5 py-2.5 font-medium text-right">액션</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-2.5"><div className="h-4 w-32 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-2.5"><div className="h-4 w-20 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-2.5"><div className="h-5 w-14 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-2.5"><div className="h-5 w-14 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-2.5"><div className="h-4 w-24 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-2.5"><div className="h-4 w-24 bg-surface-300 rounded animate-pulse" /></td>
                    <td className="px-5 py-2.5 text-right"><div className="h-6 w-16 bg-surface-300 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={<IconUsers size={32} />}
                      message="등록된 사용자가 없습니다"
                      description="상단 폼에서 첫 사용자를 추가하세요"
                    />
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border hover:bg-surface-300 transition-colors"
                  >
                    {/* 이메일 */}
                    <td className="px-5 py-2.5 text-gray-800">{u.email}</td>

                    {/* 이름 */}
                    <td className="px-5 py-2.5 text-gray-700">
                      {u.name ?? "-"}
                    </td>

                    {/* 역할 — inline select */}
                    <td className="px-5 py-2.5">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={updatingId === u.id}
                        className="bg-surface-300 border border-border rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel[r]}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* 상태 */}
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.isActive
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.isActive ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        />
                        {u.isActive ? "활성" : "비활성"}
                      </span>
                    </td>

                    {/* 마지막 로그인 */}
                    <td className="px-5 py-2.5 text-gray-500 text-xs">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleString("ko-KR")
                        : "-"}
                    </td>

                    {/* 가입일 */}
                    <td className="px-5 py-2.5 text-gray-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                    </td>

                    {/* 액션 — 활성/비활성 토글 */}
                    <td className="px-5 py-2.5 text-right">
                      <button
                        onClick={() => handleToggleActive(u.id, u.isActive)}
                        disabled={updatingId === u.id}
                        className={`text-xs px-3 py-1 rounded transition-colors disabled:opacity-50 ${
                          u.isActive
                            ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                            : "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                      >
                        {u.isActive ? "비활성화" : "활성화"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
