"use client";

/**
 * useMessages — 단일 conversation 의 메시지 stream.
 *
 * Phase 1:
 *   - keyset cursor 첫 페이지만 로드 (limit 30).
 *   - 역방향 무한스크롤 (loadOlder) + SSE message.created → 캐시 prepend 는 Phase 2.
 *   - tenantSlug = 'default' 하드코드.
 *
 * Backend 응답: { success: true, data: { items: [...], nextCursor, hasMore } }
 *   items 는 desc(createdAt) — 컴포넌트 레벨에서 reverse 해 표시 시 오름차순.
 */
import { useEffect, useState } from "react";

export interface MessageRow {
  id: string;
  kind: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  body: string | null;
  senderId: string;
  replyToId: string | null;
  clientGeneratedId: string;
  editedAt: string | null;
  editCount: number;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  attachments: Array<{ id: string; fileId: string; kind: string; displayOrder: number }>;
  mentions: Array<{ id: string; mentionedUserId: string }>;
}

interface UseMessagesResult {
  messages: MessageRow[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
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

  return { messages, loading, error, hasMore };
}
