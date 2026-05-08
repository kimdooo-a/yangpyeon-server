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
 * F2-3 — 답장 인용 + 멘션 popover. conv detail (멤버 목록) 을 useEffect fetch (SWR 도입은 F2-4 INFRA-1 동반).
 *        replyTo state 는 page 가 보유, MessageComposer/MessageList 양쪽에 prop 전달.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MoreVertical, Info } from "lucide-react";
import { toast } from "sonner";
import { ConversationList } from "@/components/messenger/ConversationList";
import { MessageList } from "@/components/messenger/MessageList";
import {
  MessageComposer,
  type ReplyTarget,
} from "@/components/messenger/MessageComposer";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMessages } from "@/hooks/messenger/useMessages";
import type { SendPayload } from "@/lib/messenger/composer-logic";
import type { MentionCandidate } from "@/lib/messenger/mention-search";

const TENANT_SLUG = "default";

interface ConversationMemberRow {
  userId: string;
  role: string;
  user?: { email: string; name?: string | null } | null;
}

export default function MessengerConversationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useCurrentUser();
  const conversationId = params.id;
  const { messages, loading, error, sendOptimistic } = useMessages(conversationId);

  const [members, setMembers] = useState<ConversationMemberRow[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  // F2-3 — conv detail fetch (멤버 목록, email/name include). SWR 미도입 상태라 useEffect 직접.
  // INFRA-1 도입 후 SWR mutate 로 자연 교체 (F2-4 동반).
  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/t/${TENANT_SLUG}/messenger/conversations/${conversationId}`,
        );
        const json = await res.json();
        if (!alive) return;
        if (json?.success && Array.isArray(json.data?.conversation?.members)) {
          setMembers(json.data.conversation.members as ConversationMemberRow[]);
        } else {
          // 멤버 fetch 실패는 멘션 popover 비활성화로만 표시 (composer 의 @ 버튼 disabled).
          // 메시지 송수신 자체에는 영향 없음.
          setMembers([]);
        }
      } catch {
        if (alive) setMembers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      members
        .filter((m) => m.user?.email)
        .map((m) => ({
          userId: m.userId,
          email: m.user!.email,
          role: m.role,
        })),
    [members],
  );

  const senderMap = useMemo(() => {
    const map: Record<string, { email: string; name?: string | null }> = {};
    for (const m of members) {
      if (m.user?.email) {
        map[m.userId] = { email: m.user.email, name: m.user.name ?? null };
      }
    }
    return map;
  }, [members]);

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
        toast.error(result.error ?? "송신 실패");
      }
    },
    [sendOptimistic, user?.sub],
  );

  return (
    <div className="flex h-[calc(100vh-0px)]">
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

      <section className="flex-1 flex flex-col bg-surface-100">
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

        {user ? (
          <MessageList
            messages={messages}
            loading={loading}
            error={error}
            currentUserId={user.sub}
            senderMap={senderMap}
            onReplyMessage={setReplyTo}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            로그인 정보 확인 중…
          </div>
        )}

        <MessageComposer
          onSend={handleSend}
          disabled={!user}
          members={mentionCandidates}
          currentUserId={user?.sub}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
        />
        <p className="text-[10px] text-gray-400 px-3 pb-1.5">
          ⓘ F2-3 — 답장 + 멘션 활성. 첨부/이모지/SSE 실시간 = F2-4+
        </p>
      </section>
    </div>
  );
}
