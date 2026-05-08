"use client";

/**
 * useMessages — 단일 conversation 의 메시지 stream + 낙관적 송신 + SSE 실시간 수신.
 *
 * Phase 1:
 *   - keyset cursor 첫 페이지 (limit 30) 만 로드.
 *   - 역방향 무한스크롤 = F2-5+ (Phase 1.x).
 *
 * Phase 2 (F2-2):
 *   - sendOptimistic: prepend → POST → 201 swap / 4xx-5xx mark failed.
 *   - retry: 같은 clientGeneratedId 로 재호출 시 server 멱등성 (UNIQUE 인덱스) 의존.
 *
 * Phase 2 (F2-4 — INFRA-1 동반):
 *   - SSE wiring: use-sse hook 으로 events route 구독 → message.created/updated/deleted
 *     applyEventToMessages reducer 로 cache 변형. clientGeneratedId 매칭 시 optimistic swap.
 *   - SWR 도입은 별도 chunk (현재는 useState/useEffect 패턴 유지).
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
import { applyEventToMessages } from "@/lib/messenger/sse-events";
import { useSse } from "./use-sse";

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
  /** F2-4 — SSE 채널 연결 상태 (UI 인디케이터 용도). */
  sseConnected: boolean;
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

  // F2-4 — SSE 실시간 수신. message.created/updated/deleted 만 cache 변형.
  // typing/receipt/member 이벤트는 추후 trail (별도 hook 분리 예정).
  const sseUrl = conversationId
    ? `/api/v1/t/${TENANT_SLUG}/messenger/conversations/${conversationId}/events`
    : null;
  const handleSseEvent = useCallback(
    (event: Parameters<Parameters<typeof useSse>[1]>[0]) => {
      if (
        event.type !== "message.created" &&
        event.type !== "message.updated" &&
        event.type !== "message.deleted"
      ) {
        return;
      }
      setMessages((prev) => applyEventToMessages([event], prev));
    },
    [],
  );
  const { connected: sseConnected } = useSse(sseUrl, handleSseEvent);

  return { messages, loading, error, hasMore, sseConnected, sendOptimistic };
}
