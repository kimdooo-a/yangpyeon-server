"use client";

/**
 * /messenger/admin/reports — 운영자 신고 큐 (M6).
 *
 * 가드:
 *   - Frontend: useCurrentUser 의 role !== ADMIN/OWNER → 403 메시지.
 *   - Backend: withTenantRole(["OWNER","ADMIN"]) 자동 검증.
 *
 * 기능:
 *   - status 탭 (OPEN/RESOLVED/DISMISSED)
 *   - 신고 목록 (id, reporter, target, reason, createdAt)
 *   - resolve dialog (action enum + note 옵션) → POST /resolve
 */
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useReportQueue } from "@/hooks/messenger/useReportQueue";
import {
  ALL_RESOLVE_ACTIONS,
  ALL_REPORT_STATUSES,
  describeResolveImpact,
  formatResolveAction,
  formatReportStatus,
  type ResolveAction,
  type ReportStatus,
} from "@/lib/messenger/report-actions";

export default function MessengerReportsPage() {
  const { user, loading: userLoading } = useCurrentUser();
  const [status, setStatus] = useState<ReportStatus>("OPEN");
  const { reports, loading, error, resolve } = useReportQueue(status);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<ResolveAction>("DISMISS");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = useMemo(() => {
    const role = user?.role;
    return role === "ADMIN" || role === "OWNER";
  }, [user?.role]);

  if (userLoading) {
    return (
      <div className="p-6 text-sm text-gray-500">사용자 정보 확인 중…</div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600 mb-2">
          <AlertTriangle size={18} />
          <span className="text-sm font-semibold">접근 권한이 없습니다</span>
        </div>
        <p className="text-xs text-gray-500">
          본 페이지는 OWNER 또는 ADMIN 권한이 필요합니다.
        </p>
      </div>
    );
  }

  const handleResolve = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    const r = await resolve(selectedId, action, note || undefined);
    setSubmitting(false);
    if (r.ok) {
      toast.success(`처리 완료 — ${formatResolveAction(action)}`);
      setSelectedId(null);
      setNote("");
      setAction("DISMISS");
    } else {
      toast.error(r.error ?? "처리 실패");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <PageHeader
          title="신고 큐"
          description="메신저 abuse-report 관리"
        />
      </div>

      {/* status 탭 */}
      <div
        role="tablist"
        aria-label="신고 상태 필터"
        className="flex gap-1 mb-4 border-b border-border"
      >
        {ALL_REPORT_STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              status === s
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {formatReportStatus(s)}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="text-sm text-red-600 mb-4 p-3 bg-red-50 rounded"
          role="alert"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 bg-surface-300 animate-pulse rounded"
            />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-12">
          {formatReportStatus(status)} 상태의 신고가 없습니다
        </div>
      ) : (
        <ul className="divide-y divide-border bg-surface-100 rounded-md border border-border">
          {reports.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-500 mb-1">
                    신고 ID {r.id.slice(0, 8)} ·{" "}
                    {new Date(r.createdAt).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </div>
                  <div className="text-sm text-gray-800 mb-1">
                    <span className="font-semibold">사유:</span> {r.reason}
                  </div>
                  <div className="text-[12px] text-gray-600 grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">신고자:</span>{" "}
                      {r.reporterId.slice(0, 8)}
                    </div>
                    {r.targetMessageId && (
                      <div>
                        <span className="text-gray-500">대상 메시지:</span>{" "}
                        {r.targetMessageId.slice(0, 8)}
                      </div>
                    )}
                    {r.targetUserId && (
                      <div>
                        <span className="text-gray-500">대상 사용자:</span>{" "}
                        {r.targetUserId.slice(0, 8)}
                      </div>
                    )}
                    {r.resolverNote && (
                      <div className="col-span-2">
                        <span className="text-gray-500">처리 메모:</span>{" "}
                        {r.resolverNote}
                      </div>
                    )}
                  </div>
                </div>
                {status === "OPEN" && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex-shrink-0"
                  >
                    처리
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Resolve dialog (간단 inline form, 시간 부족 시 별도 chunk) */}
      {selectedId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="신고 처리"
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => !submitting && setSelectedId(null)}
        >
          <div
            className="bg-surface-100 rounded-lg shadow-xl max-w-md w-full mx-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-800 mb-3">
              신고 {selectedId.slice(0, 8)} 처리
            </h3>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              처리 액션
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as ResolveAction)}
              className="w-full bg-surface-100 border border-border rounded-md px-3 py-2 text-sm mb-1"
              disabled={submitting}
            >
              {ALL_RESOLVE_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {formatResolveAction(a)}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mb-3">
              {describeResolveImpact(action)}
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              메모 (선택, 최대 500자)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full bg-surface-100 border border-border rounded-md px-3 py-2 text-sm resize-none mb-4"
              disabled={submitting}
              placeholder="처리 사유 등 (audit 로그에 저장)"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-md text-sm text-gray-600 hover:bg-surface-300 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleResolve}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:bg-surface-300 disabled:cursor-not-allowed"
              >
                {submitting ? "처리 중…" : "처리"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
