"use client";

/**
 * ConversationList — 좌측 대화 목록 컨테이너 (320px).
 *
 * Phase 1: useConversations 훅으로 SWR-like fetch + 로딩/빈상태/에러 분기.
 * Phase 2: SSE conv.message.created → 캐시 invalidate.
 */
import { useConversations } from "@/hooks/messenger/useConversations";
import { ConversationListItem } from "./ConversationListItem";
import { derivePeerLabel } from "@/lib/messenger/peer-label";

export interface ConversationListProps {
  /** 현재 활성 conversation id. URL `/messenger/[id]` 의 id 와 일치. */
  activeConversationId?: string;
  onSelect: (conversationId: string) => void;
  /** 본인 sub — DIRECT 의 peer 이름 표시 분기에 사용. */
  currentUserId?: string;
}

export function ConversationList({
  activeConversationId,
  onSelect,
  currentUserId,
}: ConversationListProps) {
  const { conversations, loading, error, reload } = useConversations();

  if (loading) {
    return (
      <div className="p-3 space-y-2" aria-busy="true" aria-label="대화 목록 로딩 중">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-10 h-10 rounded-full bg-surface-300 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 bg-surface-300 rounded animate-pulse" />
              <div className="h-3 w-40 bg-surface-300 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-600">
        대화 목록을 불러오지 못했습니다.
        <button
          onClick={reload}
          className="ml-2 underline text-brand hover:text-brand-dark"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        <div className="mx-auto w-12 h-12 rounded-full bg-surface-300 flex items-center justify-center mb-3 text-2xl" aria-hidden="true">
          💬
        </div>
        <p className="mb-2">대화가 없습니다</p>
        <p className="text-xs text-gray-400">새 대화를 시작해 보세요</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border" role="list" aria-label="대화 목록">
      {conversations.map((conv) => {
        const peerLabel = derivePeerLabel(conv, currentUserId);
        return (
          <div role="listitem" key={conv.id}>
            <ConversationListItem
              conversation={{
                id: conv.id,
                kind: conv.kind,
                title: conv.title,
                lastMessageAt: conv.lastMessageAt,
              }}
              displayName={peerLabel}
              lastMessageSnippet={null}
              isActive={activeConversationId === conv.id}
              isMuted={false}
              hasMention={false}
              unreadCount={0}
              onClick={() => onSelect(conv.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

