"use client";

/**
 * useMessageSearch — 본문 검색 (M5).
 *
 * Phase 1: 사용자 명시 trigger (Enter 또는 검색 버튼). debounce 는 별도 chunk.
 * Backend GET /messages/search — q (1~100자) + convId? + cursor? + limit?.
 *
 * tenantSlug = 'default' (multi-tenant routing 도입 전).
 */
import { useCallback, useState } from "react";
import type { MessageRow } from "@/lib/messenger/optimistic-messages";
import { canSearch } from "@/lib/messenger/search-query";

const TENANT_SLUG = "default";

export interface SearchResultRow extends MessageRow {
  conversationId: string;
}

interface UseMessageSearchResult {
  results: SearchResultRow[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  search: (query: string, convId?: string) => Promise<void>;
  reset: () => void;
}

export function useMessageSearch(): UseMessageSearchResult {
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const reset = useCallback(() => {
    setResults([]);
    setError(null);
    setHasMore(false);
  }, []);

  const search = useCallback(async (query: string, convId?: string) => {
    if (!canSearch(query)) {
      reset();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (convId) params.set("convId", convId);
      const res = await fetch(
        `/api/v1/t/${TENANT_SLUG}/messenger/messages/search?${params.toString()}`,
      );
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? `검색 실패 (HTTP ${res.status})`);
        setResults([]);
        return;
      }
      const items: SearchResultRow[] = json.data?.items ?? [];
      setResults(items);
      setHasMore(Boolean(json.data?.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [reset]);

  return { results, loading, error, hasMore, search, reset };
}
