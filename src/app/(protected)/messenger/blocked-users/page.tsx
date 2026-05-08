"use client";

/**
 * /messenger/blocked-users — 본인 차단 목록 + 해제 (M6).
 *
 * 기능:
 *   - 차단 목록 표시 (createdAt desc)
 *   - 차단 사유 표시 (있을 시)
 *   - "해제" 버튼 → DELETE /user-blocks/[id]
 *   - 신규 차단 추가는 별도 chunk (대화 화면에서 메시지 hover → 차단 진입)
 */
import { useState } from "react";
import { Ban, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { useUserBlocks } from "@/hooks/messenger/useUserBlocks";

export default function BlockedUsersPage() {
  const { blocks, loading, error, unblock } = useUserBlocks();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleUnblock = async (id: string) => {
    setPendingId(id);
    const r = await unblock(id);
    setPendingId(null);
    if (r.ok) {
      toast.success("차단을 해제했습니다");
    } else {
      toast.error(r.error ?? "차단 해제 실패");
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="차단한 사용자"
        description="해제 시 양방향 메시지 전송이 다시 가능해집니다"
      />

      {error && (
        <div
          className="mt-4 text-sm text-red-600 p-3 bg-red-50 rounded"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 bg-surface-300 animate-pulse rounded"
            />
          ))}
        </div>
      ) : blocks.length === 0 ? (
        <div className="mt-12 text-center text-sm text-gray-500">
          <Ban size={28} className="mx-auto mb-3 text-gray-400" aria-hidden />
          차단한 사용자가 없습니다
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border bg-surface-100 rounded-md border border-border">
          {blocks.map((b) => (
            <li
              key={b.id}
              className="px-4 py-3 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">
                  사용자 {b.blockedId.slice(0, 8)}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  차단일{" "}
                  {new Date(b.createdAt).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </div>
                {b.reason && (
                  <div className="text-[12px] text-gray-600 mt-1">
                    사유: {b.reason}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleUnblock(b.id)}
                disabled={pendingId === b.id}
                className="px-3 py-1.5 rounded-md border border-border text-xs text-gray-700 hover:bg-surface-200 disabled:cursor-not-allowed flex items-center gap-1 flex-shrink-0"
              >
                <X size={12} />
                {pendingId === b.id ? "해제 중…" : "해제"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
