"use client";

/**
 * /messenger/[id] — 단일 대화 채팅창.
 *
 * 데스크톱 ≥lg: 좌 320px 대화목록 (활성 강조) + 우 채팅창 (헤더 + 메시지 + composer).
 * 모바일 <lg: 채팅창만 (목록은 /messenger 로 ←뒤로가기).
 *
 * F2-1 — composer + UUIDv7 + Enter 송신.
 * F2-2 — 낙관적 송신: useMessages 를 page 레벨로 lift, MessageList 와 cache 공유.
 *        sendOptimistic 이 prepend → POST → 201 swap / 4xx-5xx mark failed.
 *        SSE wiring + 재시도 트리거 UI = F2-4+.
 */
import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, Info } from "lucide-react";
import { toast } from "sonner";
import { ConversationList } from "@/components/messenger/ConversationList";
import { MessageList } from "@/components/messenger/MessageList";
import { MessageComposer } from "@/components/messenger/MessageComposer";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMessages } from "@/hooks/messenger/useMessages";
import type { SendPayload } from "@/lib/messenger/composer-logic";

export default function MessengerConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const conversationId = params.id;
  const { messages, loading, error, sendOptimistic } = useMessages(conversationId);

  const handleSelect = (id: string) => {
    router.push(`/messenger/${id}`);
  };

  const handleSend = useCallback(
    async (payload: SendPayload) => {
      if (!user?.sub) {
        toast.error("로그인 정보가 없어 송신할 수 없습니다");
        return;
      }
      const result = await sendOptimistic(payload, user.sub);
      if (!result.ok) {
        // pending 메시지는 cache 에 _optimistic.status='failed' 로 남아 빨간 점 노출됨.
        // toast 는 보조 알림 — 사용자가 다른 대화 보고 있을 때도 인지 가능.
        toast.error(result.error ?? "송신 실패");
      }
    },
    [sendOptimistic, user?.sub],
  );

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* 좌측 — 대화 목록 (데스크톱 only, 모바일은 /messenger 로 push) */}
      <aside className="hidden lg:flex w-80 border-r border-border bg-surface-200 flex-col">
        <div className="h-14 flex items-center px-4 border-b border-border">
          <h1 className="text-lg font-semibold">대화</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            activeConversationId={conversationId}
            onSelect={handleSelect}
            currentUserId={user?.sub}
          />
        </div>
      </aside>

      {/* 우측 — 채팅창 */}
      <section className="flex-1 flex flex-col bg-surface-100">
        {/* 채팅창 헤더 */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-surface-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-md hover:bg-surface-300 text-gray-500"
              aria-label="목록으로"
              onClick={() => router.push("/messenger")}
            >
              <ChevronLeft size={18} />
            </button>
            <div
              className="w-8 h-8 rounded-full bg-surface-300 flex-shrink-0"
              aria-hidden="true"
            />
            <div>
              <div className="text-sm font-semibold text-gray-800">
                {conversationId.slice(0, 8)}
              </div>
              <div className="text-[11px] text-gray-500">대화 ID</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-2 rounded-md hover:bg-surface-300 text-gray-500"
              aria-label="대화 메뉴"
              disabled
              title="메뉴 (Phase 2)"
            >
              <MoreVertical size={18} />
            </button>
            <button
              type="button"
              className="p-2 rounded-md hover:bg-surface-300 text-gray-500"
              aria-label="정보 패널"
              disabled
              title="정보 패널 (Phase 2)"
            >
              <Info size={18} />
            </button>
          </div>
        </header>

        {/* 메시지 영역 */}
        {user ? (
          <MessageList
            messages={messages}
            loading={loading}
            error={error}
            currentUserId={user.sub}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            로그인 정보 확인 중…
          </div>
        )}

        {/* Composer (F2-1 + F2-2 — 낙관적 송신 활성, 첨부/이모지/멘션/답장 = F2-3+) */}
        <MessageComposer onSend={handleSend} disabled={!user} />
        <p className="text-[10px] text-gray-400 px-3 pb-1.5">
          ⓘ F2-2 — 낙관적 송신 활성 (전송 중 = 흐림, 실패 시 ⚠ 실패 표시). 첨부/멘션/답장 = F2-3+
        </p>
      </section>
    </div>
  );
}
