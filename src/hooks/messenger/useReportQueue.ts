"use client";

/**
 * useReportQueue — 운영자용 신고 큐 fetch + resolve mutation (M6).
 *
 * Backend:
 *   GET  /messenger/admin/reports?status=...&limit=30
 *   POST /messenger/admin/reports/[id]/resolve  (action + note?)
 *
 * 가드: backend 가 withTenantRole(["OWNER","ADMIN"]) — 비권한 사용자는 403.
 *       frontend 도 user.role 검증 권장 (페이지 진입 차단).
 */
import { useCallback, useEffect, useState } from "react";
import type {
  ResolveAction,
  ReportStatus,
} from "@/lib/messenger/report-actions";

const TENANT_SLUG = "default";

export interface AbuseReportRow {
  id: string;
  reporterId: string;
  targetMessageId: string | null;
  targetUserId: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolverNote: string | null;
}

interface UseReportQueueResult {
  reports: AbuseReportRow[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  reload: () => void;
  resolve: (
    id: string,
    action: ResolveAction,
    note?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

export function useReportQueue(
  status: ReportStatus | undefined,
): UseReportQueueResult {
  const [reports, setReports] = useState<AbuseReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("limit", "30");
    fetch(
      `/api/v1/t/${TENANT_SLUG}/messenger/admin/reports?${params.toString()}`,
    )
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (!json?.success) {
          setError(json?.error?.message ?? "fetch 실패");
          setReports([]);
          return;
        }
        setReports(json.data?.items ?? []);
        setHasMore(Boolean(json.data?.hasMore));
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "네트워크 오류");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [status, tick]);

  const resolve = useCallback(
    async (id: string, action: ResolveAction, note?: string) => {
      try {
        const res = await fetch(
          `/api/v1/t/${TENANT_SLUG}/messenger/admin/reports/${id}/resolve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, note }),
          },
        );
        const json = await res.json();
        if (!res.ok || !json?.success) {
          return {
            ok: false,
            error: json?.error?.message ?? `처리 실패 (HTTP ${res.status})`,
          };
        }
        reload();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "네트워크 오류",
        };
      }
    },
    [reload],
  );

  return { reports, loading, error, hasMore, reload, resolve };
}
