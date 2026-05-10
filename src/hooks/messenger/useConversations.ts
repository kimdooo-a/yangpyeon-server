"use client";

/**
 * useConversations — 본인 활성 대화 목록 fetch (SWR 기반).
 *
 * INFRA-2 (S98) — useState/useEffect/fetch → SWR 마이그레이션.
 *   - 캐시 dedup: 같은 페이지 내 다중 호출자가 fetch 1회 공유
 *   - 자동 revalidation (focus, reconnect — SWR 기본)
 *   - reload() = mutate() 매핑, 시그니처 보존 (기존 호출자 변경 0)
 *
 * tenantSlug = 'default' 하드코드 (운영 콘솔 본인 → default tenant,
 * memory project_tenant_default_sentinel).
 */
import { useCallback } from "react";
import useSWR from "swr";

export interface ConversationRow {
  id: string;
  kind: "DIRECT" | "GROUP" | "CHANNEL";
  title: string | null;
  lastMessageAt: string | null;
  archivedAt: string | null;
  members: Array<{
    userId: string;
    role: string;
    /** F2-5 — DIRECT peer 이름 / GROUP fallback 표시용 (backend GET include 확장). */
    user?: { email: string | null; name: string | null } | null;
  }>;
}

interface UseConversationsResult {
  conversations: ConversationRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const TENANT_SLUG = "default";
const CONVERSATIONS_KEY = `/api/v1/t/${TENANT_SLUG}/messenger/conversations`;

async function fetchConversations(url: string): Promise<ConversationRow[]> {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return (json.data?.conversations ?? []) as ConversationRow[];
}

export function useConversations(): UseConversationsResult {
  const { data, error, isLoading, mutate } = useSWR<ConversationRow[], Error>(
    CONVERSATIONS_KEY,
    fetchConversations,
  );

  const reload = useCallback(() => {
    void mutate();
  }, [mutate]);

  return {
    conversations: data ?? [],
    loading: isLoading,
    error: error ? error.message : null,
    reload,
  };
}
