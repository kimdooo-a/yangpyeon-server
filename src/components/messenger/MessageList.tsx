"use client";

/**
 * MessageList — 채팅창 메시지 영역 (overflow-y-auto, 역순 표시).
 *
 * useMessages 훅으로 cursor-based fetch.
 * Phase 1: 첫 페이지만 로드. 역방향 무한스크롤 + SSE wiring 은 Phase 2.
 *
 * 자동 스크롤: 첫 로드 시 맨 아래로 (메시지 가장 최근).
 */
import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/messenger/useMessages";
import { MessageBubble } from "./MessageBubble";

export interface MessageListProps {
  conversationId: string;
  /** 현재 사용자 sub — isOwn 분기. */
  currentUserId: string;
}

export function MessageList({ conversationId, currentUserId }: MessageListProps) {
  const { messages, loading, error } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 첫 로드 후 맨 아래로 스크롤 (오름차순 표시 가정).
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [loading, messages.length]);

  if (loading) {
    return (
      <div className="flex-1 p-4 space-y-3" aria-busy="true" aria-label="메시지 로딩 중">
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

  return (
    <div
      className="flex-1 overflow-y-auto py-2"
      role="log"
      aria-live="polite"
      aria-label="메시지 목록"
    >
      {ordered.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isOwn={msg.senderId === currentUserId}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
