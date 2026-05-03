"use client";

/**
 * /messenger/[id] — 단일 대화 채팅창.
 *
 * 데스크톱 ≥lg: 좌 320px 대화목록 (활성 강조) + 우 채팅창 (헤더 + 메시지 + composer placeholder).
 * 모바일 <lg: 채팅창만 (목록은 /messenger 로 ←뒤로가기).
 *
 * Phase 1: composer 는 disabled placeholder. 인터랙티브 (입력/전송/답장) 는 Phase 2 (S84-G).
 */
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, Info, Paperclip, Smile, AtSign } from "lucide-react";
import { ConversationList } from "@/components/messenger/ConversationList";
import { MessageList } from "@/components/messenger/MessageList";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function MessengerConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const conversationId = params.id;

  const handleSelect = (id: string) => {
    router.push(`/messenger/${id}`);
  };

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
            <div className="w-8 h-8 rounded-full bg-surface-300 flex-shrink-0" aria-hidden="true" />
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
          <MessageList conversationId={conversationId} currentUserId={user.sub} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            로그인 정보 확인 중…
          </div>
        )}

        {/* Composer placeholder (Phase 1 = disabled, Phase 2 인터랙티브) */}
        <div className="border-t border-border bg-surface-200 px-3 py-2.5">
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled
              className="p-2 rounded-md text-gray-400"
              aria-label="첨부 (Phase 2)"
              title="첨부 (Phase 2)"
            >
              <Paperclip size={18} />
            </button>
            <button
              type="button"
              disabled
              className="p-2 rounded-md text-gray-400"
              aria-label="이모지 (Phase 2)"
              title="이모지 (Phase 2)"
            >
              <Smile size={18} />
            </button>
            <button
              type="button"
              disabled
              className="p-2 rounded-md text-gray-400"
              aria-label="멘션 (Phase 2)"
              title="멘션 (Phase 2)"
            >
              <AtSign size={18} />
            </button>
            <textarea
              disabled
              rows={1}
              placeholder="메시지 입력 — Phase 2 활성화 예정"
              aria-label="메시지 입력"
              className="flex-1 resize-none bg-surface-100 border border-border rounded-md px-3 py-2 text-sm text-gray-500 placeholder-gray-400 cursor-not-allowed"
            />
            <button
              type="button"
              disabled
              className="px-4 py-2 rounded-md bg-surface-300 text-gray-400 text-sm font-medium cursor-not-allowed"
              aria-label="전송 (Phase 2)"
            >
              전송
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            ⓘ Phase 1 — 송신/답장/멘션/첨부는 Phase 2 (S84-G) 에서 활성화됩니다
          </p>
        </div>
      </section>
    </div>
  );
}
