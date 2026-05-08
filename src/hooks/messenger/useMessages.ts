"use client";

/**
 * useMessages — 단일 conversation 의 메시지 stream + 낙관적 송신.
 *
 * Phase 1:
 *   - keyset cursor 첫 페이지 (limit 30) 만 로드.
 *   - 역방향 무한스크롤 + SSE message.created prepend = F2-3+.
 *
 * Phase 2 (F2-2 — 본 commit):
 *   - sendOptimistic: prepend → POST → 201 swap / 4xx-5xx mark failed.
 *   - retry: 같은 clientGeneratedId 로 재호출 시 server 멱등성 (UNIQUE 인덱스) 의존.
 *
 * tenantSlug = 'default' 하드코드 (multi-tenant routing 도입 전).
 *
 * Backend 응답 shape:
 *   GET  → { success: true, data: { items: [...], nextCursor, hasMore } }
 *   POST → { success: true, data: { message: {...}, created: boolean } }
 *
 *   items 는 desc(createdAt) — 컴포넌트 레벨에서 reverse 해 표시.
 */
import { useCallback, useEffect, useState } from "react";
import {
  buildOptimisticMessage,
  prependOptimistic,
  replaceOptimisticWithServer,
  markOptimisticFailed,
  type MessageRow,
} from "@/lib/messenger/optimistic-messages";

export type { MessageRow } from "@/lib/messenger/optimistic-messages";

interface SendOptimisticPayload {
  kind: "TEXT";
  body: string;
  clientGeneratedId: string;
  /** F2-3 — 답장 인용 대상 메시지 ID. */
  replyToId?: string;
  /** F2-3 — 멘션 받는 사용자 ID 배열 (자기 자신 제외는 server-side filter). */
  mentions?: string[];
}

interface SendOptimisticResult {
  ok: boolean;
  error?: string;
}

interface UseMessagesResult {
  messages: MessageRow[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  sendOptimistic: (
    payload: SendOptimisticPayload,
    senderId: string,
  ) => Promise<SendOptimisticResult>;
}

const TENANT_SLUG = "default";

export function useMessages(conversationId: string): UseMessagesResult {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let disposed = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/v1/t/${TENANT_SLUG}/messenger/conversations/${conversationId}/messages?limit=30`,
    )
      .then((res) => res.json())
      .then((json) => {
        if (disposed) return;
        if (!json?.success) {
          setError(json?.error?.message ?? "fetch 실패");
          return;
        }
        const rows: MessageRow[] = json.data?.items ?? [];
        setMessages(rows);
        setHasMore(Boolean(json.data?.hasMore));
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
  }, [conversationId]);

  const sendOptimistic = useCallback(
    async (
      payload: SendOptimisticPayload,
      senderId: string,
    ): Promise<SendOptimisticResult> => {
      const optimistic = buildOptimisticMessage({ payload, senderId });
      setMessages((prev) => prependOptimistic(prev, optimistic));

      try {
        const res = await fetch(
          `/api/v1/t/${TENANT_SLUG}/messenger/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = await res.json();
        if (!res.ok || !json?.success) {
          const errMsg =
            json?.error?.message ?? `송신 실패 (HTTP ${res.status})`;
          setMessages((prev) =>
            markOptimisticFailed(prev, payload.clientGeneratedId, errMsg),
          );
          return { ok: false, error: errMsg };
        }
        const serverMsg: MessageRow | undefined = json.data?.message;
        if (!serverMsg) {
          const errMsg = "서버 응답 누락";
          setMessages((prev) =>
            markOptimisticFailed(prev, payload.clientGeneratedId, errMsg),
          );
          return { ok: false, error: errMsg };
        }
        setMessages((prev) =>
          replaceOptimisticWithServer(prev, payload.clientGeneratedId, serverMsg),
        );
        return { ok: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "네트워크 오류";
        setMessages((prev) =>
          markOptimisticFailed(prev, payload.clientGeneratedId, errMsg),
        );
        return { ok: false, error: errMsg };
      }
    },
    [conversationId],
  );

  return { messages, loading, error, hasMore, sendOptimistic };
}
