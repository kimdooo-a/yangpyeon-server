"use client";

/**
 * useConversations — 본인 활성 대화 목록 fetch.
 *
 * Phase 1:
 *   - 단순 useState + useEffect + fetch (SWR 미설치, use-current-user 패턴 따름).
 *   - tenantSlug = 'default' 하드코드 (운영 콘솔 본인 → default tenant, memory project_tenant_default_sentinel).
 *   - SSE wiring (conv 채널 message.created → invalidate) 은 Phase 2 (S84-F2).
 */
import { useCallback, useEffect, useState } from "react";

export interface ConversationRow {
  id: string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  title: string | null;
  lastMessageAt: string | null;
  archivedAt: string | null;
  members: Array<{ userId: string; role: string }>;
}

interface UseConversationsResult {
  conversations: ConversationRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** 운영 콘솔 본인 접근은 기본 'default' tenant. */
const TENANT_SLUG = "default";

export function useConversations(): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/t/${TENANT_SLUG}/messenger/conversations`)
      .then((res) => res.json())
      .then((json) => {
        if (disposed) return;
        if (!json?.success) {
          setError(json?.error?.message ?? "fetch 실패");
          return;
        }
        const rows: ConversationRow[] = json.data?.conversations ?? [];
        setConversations(rows);
      })
      .catch((e) => {
        if (disposed) return;
        setError(e instanceof Error ? e.message : "네트워크 오류");
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [tick]);

  return { conversations, loading, error, reload };
}
