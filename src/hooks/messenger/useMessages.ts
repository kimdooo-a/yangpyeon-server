"use client";

/**
 * useMessages — 단일 conversation 의 메시지 stream + 낙관적 송신 + SSE 실시간 수신.
 *
 * INFRA-2 (S98) — useState/useEffect/fetch → SWR 마이그레이션:
 *   - 캐시 dedup: 같은 conversation 다중 호출자가 fetch 1회 공유
 *   - mutate(updater, { revalidate: false }) 으로 sendOptimistic / SSE 이벤트 둘 다 동일 패턴
 *   - 시그니처 보존 (page.tsx 변경 0)
 *
 * Phase 1: keyset cursor 첫 페이지 (limit 30) 만 로드. 역방향 무한스크롤 = F2-5+.
 *
 * Phase 2 (F2-2): sendOptimistic = prepend → POST → 201 swap / 4xx-5xx mark failed.
 *   server `(tenantId, conversationId, clientGeneratedId)` UNIQUE 멱등 의존.
 *
 * Phase 2 (F2-4): SSE wiring — message.created/updated/deleted 만 cache 변형.
 *   typing/receipt/member 이벤트는 trail (별도 hook 분리 예정).
 *
 * tenantSlug = 'default' 하드코드 (multi-tenant routing 도입 전).
 *
 * Backend 응답 shape:
 *   GET  → { success: true, data: { items: [...], nextCursor, hasMore } }
 *   POST → { success: true, data: { message: {...}, created: boolean } }
 *
 *   items 는 desc(createdAt) — 컴포넌트 레벨에서 reverse 해 표시.
 */
import { useCallback } from "react";
import useSWR from "swr";
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

/**
 * sendOptimistic payload 시그니처 — `composer-logic.ts` 의 `SendPayload` 와 정합.
 * F2-1 TEXT 단독 → F2-3 replyToId/mentions → M5-ATTACH-3 (S96) IMAGE/FILE + attachments.
 */
interface SendOptimisticPayload {
  kind: "TEXT" | "IMAGE" | "FILE";
  body: string | null;
  clientGeneratedId: string;
  /** F2-3 — 답장 인용 대상 메시지 ID. */
  replyToId?: string;
  /** F2-3 — 멘션 받는 사용자 ID 배열 (자기 자신 제외는 server-side filter). */
  mentions?: string[];
  /** M5-ATTACH-3 — 첨부 fileId 배열 (uploadAttachment 결과 합산). */
  attachments?: Array<{
    fileId: string;
    kind: "IMAGE" | "FILE" | "VOICE";
    displayOrder?: number;
  }>;
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

/** SWR 캐시에 저장하는 단위 — items 와 함께 nextCursor / hasMore 보존. */
interface MessagesCache {
  items: MessageRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const TENANT_SLUG = "default";

function messagesUrl(conversationId: string): string {
  return `/api/v1/t/${TENANT_SLUG}/messenger/conversations/${conversationId}/messages?limit=30`;
}

async function fetchMessages(url: string): Promise<MessagesCache> {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return {
    items: (json.data?.items ?? []) as MessageRow[],
    nextCursor: (json.data?.nextCursor ?? null) as string | null,
    hasMore: Boolean(json.data?.hasMore),
  };
}

const EMPTY_CACHE: MessagesCache = { items: [], nextCursor: null, hasMore: false };

/** items 만 변형하는 reducer 를 SWR mutate updater 로 변환. */
function withItems(updater: (items: MessageRow[]) => MessageRow[]) {
  return (current?: MessagesCache): MessagesCache => {
    const base = current ?? EMPTY_CACHE;
    return { ...base, items: updater(base.items) };
  };
}

export function useMessages(conversationId: string): UseMessagesResult {
  const swrKey = conversationId ? messagesUrl(conversationId) : null;
  const { data, error, isLoading, mutate } = useSWR<MessagesCache, Error>(
    swrKey,
    fetchMessages,
  );

  const sendOptimistic = useCallback(
    async (
      payload: SendOptimisticPayload,
      senderId: string,
    ): Promise<SendOptimisticResult> => {
      if (!conversationId) {
        return { ok: false, error: "대화 미선택" };
      }
      const optimistic = buildOptimisticMessage({ payload, senderId });
      // 1. 즉시 prepend (UX)
      await mutate(
        withItems((items) => prependOptimistic(items, optimistic)),
        { revalidate: false },
      );

      try {
        const res = await fetch(
          `/api/v1/t/${TENANT_SLUG}/messenger/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          const errMsg =
            json?.error?.message ?? `송신 실패 (HTTP ${res.status})`;
          await mutate(
            withItems((items) =>
              markOptimisticFailed(items, payload.clientGeneratedId, errMsg),
            ),
            { revalidate: false },
          );
          return { ok: false, error: errMsg };
        }
        const serverMsg: MessageRow | undefined = json.data?.message;
        if (!serverMsg) {
          const errMsg = "서버 응답 누락";
          await mutate(
            withItems((items) =>
              markOptimisticFailed(items, payload.clientGeneratedId, errMsg),
            ),
            { revalidate: false },
          );
          return { ok: false, error: errMsg };
        }
        await mutate(
          withItems((items) =>
            replaceOptimisticWithServer(
              items,
              payload.clientGeneratedId,
              serverMsg,
            ),
          ),
          { revalidate: false },
        );
        return { ok: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "네트워크 오류";
        await mutate(
          withItems((items) =>
            markOptimisticFailed(items, payload.clientGeneratedId, errMsg),
          ),
          { revalidate: false },
        );
        return { ok: false, error: errMsg };
      }
    },
    [conversationId, mutate],
  );

  // F2-4 — SSE 실시간 수신. message.created/updated/deleted 만 cache 변형.
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
      void mutate(
        withItems((items) => applyEventToMessages([event], items)),
        { revalidate: false },
      );
    },
    [mutate],
  );
  const { connected: sseConnected } = useSse(sseUrl, handleSseEvent);

  return {
    messages: data?.items ?? [],
    loading: isLoading,
    error: error ? error.message : null,
    hasMore: data?.hasMore ?? false,
    sseConnected,
    sendOptimistic,
  };
}
