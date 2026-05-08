"use client";

/**
 * MessageList — 채팅창 메시지 영역 (overflow-y-auto, 역순 표시).
 *
 * F2-2 (M4 Phase 2):
 *   - messages/loading/error 를 부모 page.tsx 에서 props 로 주입 (낙관적 송신과 cache 공유).
 *   - pending/failed 시각 표식: optimistic 메시지에 opacity / 빨간 점.
 * F2-3:
 *   - replyTo lookup: messages 배열을 id-indexed map 으로 변환 → MessageBubble 에 부모 메시지 prop 주입.
 *   - 부모가 같은 페이지에 없으면 (이전 페이지) MessageBubble 자체 fallback 처리.
 *   - onReplyMessage 콜백 — page 가 replyTo state 갱신.
 *
 * Phase 1 보존:
 *   - 첫 로드 후 맨 아래 자동 스크롤. 역방향 무한스크롤 + SSE wiring 은 F2-4.
 */
import { useEffect, useMemo, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import {
  isOptimisticPending,
  isOptimisticFailed,
  type MessageRow,
} from "@/lib/messenger/optimistic-messages";
import type { ReplyTarget } from "./MessageComposer";

export interface MessageListProps {
  messages: MessageRow[];
  loading: boolean;
  error: string | null;
  /** 현재 사용자 sub — isOwn 분기. */
  currentUserId: string;
  /** F2-3 — userId → 표시 이름/이메일 lookup (conv members 파생). */
  senderMap?: Record<string, { email: string; name?: string | null }>;
  /** F2-3 — 답장 버튼 클릭 시 호출. page 가 replyTo state 갱신. */
  onReplyMessage?: (target: ReplyTarget) => void;
}

export function MessageList({
  messages,
  loading,
  error,
  currentUserId,
  senderMap,
  onReplyMessage,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 첫 로드 후 맨 아래로 스크롤. 메시지 prepend 시에도 새 메시지 자동 노출.
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [loading, messages.length]);

  const messagesById = useMemo(() => {
    const map: Record<string, MessageRow> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  if (loading) {
    return (
      <div
        className="flex-1 p-4 space-y-3"
        aria-busy="true"
        aria-label="메시지 로딩 중"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-start">
            <div className="bg-surface-300 animate-pulse rounded-xl h-10 w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-red-600 p-4">
        메시지를 불러오지 못했습니다.
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-4">
        아직 주고받은 메시지가 없습니다
      </div>
    );
  }

  // backend 가 desc(createdAt) 로 반환 → 화면은 asc 로 표시 (오래된 위, 최신 아래).
  const ordered = [...messages].reverse();

  const senderLabel = (uid: string): string | null => {
    const u = senderMap?.[uid];
    if (!u) return null;
    return u.name && u.name.trim().length > 0 ? u.name : u.email;
  };

  return (
    <div
      className="flex-1 overflow-y-auto py-2"
      role="log"
      aria-live="polite"
      aria-label="메시지 목록"
    >
      {ordered.map((msg) => {
        const parent = msg.replyToId ? messagesById[msg.replyToId] : undefined;
        const replyToProp = parent
          ? {
              body: parent.body,
              kind: parent.kind,
              senderName: senderLabel(parent.senderId),
              deletedAt: parent.deletedAt,
            }
          : msg.replyToId
            ? null // 부모 lookup 실패 — MessageBubble fallback 라벨
            : null;
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.senderId === currentUserId}
            pending={isOptimisticPending(msg)}
            failed={isOptimisticFailed(msg)}
            failureReason={msg._optimistic?.error}
            replyTo={replyToProp}
            onReply={
              onReplyMessage
                ? () =>
                    onReplyMessage({
                      id: msg.id,
                      body: msg.body,
                      kind: msg.kind,
                      deletedAt: msg.deletedAt,
                      senderName: senderLabel(msg.senderId),
                    })
                : undefined
            }
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
