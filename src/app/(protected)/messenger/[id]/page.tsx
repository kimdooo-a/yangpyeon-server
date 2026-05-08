"use client";

/**
 * /messenger/[id] — 단일 대화 채팅창.
 *
 * 데스크톱 ≥lg: 좌 320px 대화목록 (활성 강조) + 우 채팅창 (헤더 + 메시지 + composer).
 * 모바일 <lg: 채팅창만 (목록은 /messenger 로 ←뒤로가기).
 *
 * F2-1 (M4 Phase 2 첫 단계): MessageComposer 활성. textarea autosize + Enter 송신
 * + IME composing 처리 + clientGeneratedId UUIDv7. 낙관적 업데이트 + SSE wiring 은 F2-2/F2-4.
 */
import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, Info } from "lucide-react";
import { toast } from "sonner";
import { ConversationList } from "@/components/messenger/ConversationList";
import { MessageList } from "@/components/messenger/MessageList";
import { MessageComposer } from "@/components/messenger/MessageComposer";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { SendPayload } from "@/lib/messenger/composer-logic";

const TENANT_SLUG = "default";

export default function MessengerConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const conversationId = params.id;

  const handleSelect = (id: string) => {
    router.push(`/messenger/${id}`);
  };

  /**
   * F2-1 송신 — 단순 POST + 결과 토스트. 낙관적 업데이트 + 캐시 invalidate 는 F2-2.
   * useMessages 가 cursor-only 라 reload 는 SWR 도입 (S87-INFRA-1) 후 자연스러움.
   * 임시: 송신 성공/실패 토스트만 + window reload 회피 — 사용자가 새로 누르면 자연 반영.
   */
  const handleSend = useCallback(
    async (payload: SendPayload) => {
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
          throw new Error(json?.error?.message ?? `송신 실패 (${res.status})`);
        }
        // F2-2 에서 useMessages 캐시 prepend 로 교체 예정.
        // 본 stage 에서는 송신만 — 자연 polling/refresh 또는 SSE 도입 시 자연 반영.
      } catch (err) {
        console.error("[messenger] send failed", err);
        toast.error(err instanceof Error ? err.message : "송신 실패");
      }
    },
    [conversationId],
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

        {/* Composer (F2-1 — TEXT 송신 활성, 첨부/이모지/멘션/답장 = F2-3+) */}
        <MessageComposer onSend={handleSend} disabled={!user} />
        <p className="text-[10px] text-gray-400 px-3 pb-1.5">
          ⓘ F2-1 — TEXT 송신 활성. 첨부/멘션/답장 + 낙관적 업데이트는 F2-2~F2-3 에서 활성화됩니다
        </p>
      </section>
    </div>
  );
}
