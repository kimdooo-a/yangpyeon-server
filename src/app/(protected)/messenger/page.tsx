"use client";

/**
 * /messenger — 메신저 진입점.
 *
 * 데스크톱 ≥lg(1024px): 3-column shell (사이드바는 RootLayout) + 좌 320px 대화목록 + 우 빈상태.
 * 모바일 <lg: 대화목록만.
 *
 * 대화 클릭 → /messenger/[id] 이동 (라인 모바일 패턴).
 */
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ConversationList } from "@/components/messenger/ConversationList";
import { MessageSearch } from "@/components/messenger/MessageSearch";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function MessengerPage() {
  const router = useRouter();
  const { user } = useCurrentUser();

  const handleSelect = (conversationId: string) => {
    router.push(`/messenger/${conversationId}`);
  };

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* 좌측 — 대화 목록 (모바일에서는 전체 폭) */}
      <aside className="w-full lg:w-80 border-r border-border bg-surface-200 flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <PageHeader title="대화" />
          <button
            type="button"
            className="p-2 rounded-md hover:bg-surface-300 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label="새 대화"
            disabled
            title="새 대화 (Phase 2)"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            onSelect={handleSelect}
            currentUserId={user?.sub}
          />
        </div>
      </aside>

      {/* 우측 — 검색 영역 (데스크톱 only). 대화 미선택 시 30일 본문 검색 진입점. */}
      <div className="hidden lg:flex flex-1 flex-col bg-surface-100 overflow-y-auto">
        <div className="h-14 flex items-center px-4 border-b border-border bg-surface-200">
          <h2 className="text-sm font-semibold text-gray-700">
            메시지 본문 검색
          </h2>
        </div>
        <MessageSearch />
        <div className="text-center text-gray-400 text-xs px-4 pb-6">
          또는 왼쪽 목록에서 대화를 선택해 주세요
        </div>
      </div>
    </div>
  );
}
