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

      {/* 우측 — 빈 상태 (데스크톱 only) */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-surface-100">
        <div className="text-center text-gray-500">
          <div
            className="mx-auto w-16 h-16 rounded-full bg-surface-300 flex items-center justify-center mb-4 text-3xl"
            aria-hidden="true"
          >
            💬
          </div>
          <p className="text-sm mb-1">대화를 선택해 주세요</p>
          <p className="text-xs text-gray-400">왼쪽 목록에서 대화를 클릭하세요</p>
        </div>
      </div>
    </div>
  );
}
