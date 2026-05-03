"use client";

/**
 * ConversationListItem — 대화 목록 단일 행.
 *
 * 시각 분류 로직은 lib/item-classes.ts 의 순수 함수에 위임 (8 단위 테스트 PASS).
 * 본 컴포넌트는 헬퍼 결과를 JSX 로 매핑만 한다.
 *
 * Phase 1 데이터 가정 (backend GET /messenger/conversations 응답):
 *   - id, kind, title, lastMessageAt, members[{ userId, role }]
 *   - unreadCount / isPinned / isMuted / lastMessage / hasMention 은 별도 endpoint 미반영 (Phase 2 wiring).
 *     컴포넌트가 prop 으로 받아서 표시 (디폴트 0/false/null).
 */
import { Bell, BellOff, AtSign } from "lucide-react";
import {
  getConversationItemClasses,
  type ConversationItemClassInput,
} from "./lib/item-classes";

export interface ConversationListItemProps extends ConversationItemClassInput {
  conversation: {
    id: string;
    kind: "DIRECT" | "GROUP" | "CHANNEL";
    title: string | null;
    lastMessageAt: string | Date | null;
  };
  /** 마지막 메시지 미리보기 (≤80자). Phase 1 = null 가능. */
  lastMessageSnippet: string | null;
  /** 표시용 라벨 — DIRECT 면 peer name, GROUP 이면 title. */
  displayName: string;
  onClick: () => void;
}

function formatTime(at: string | Date | null): string {
  if (!at) return "";
  const d = typeof at === "string" ? new Date(at) : at;
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

export function ConversationListItem(props: ConversationListItemProps) {
  const {
    conversation,
    lastMessageSnippet,
    displayName,
    onClick,
    isActive,
    isMuted,
    hasMention,
    unreadCount,
  } = props;

  const v = getConversationItemClasses({ isActive, isMuted, hasMention, unreadCount });
  const time = formatTime(conversation.lastMessageAt);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={v.containerClass}
      aria-label={`대화 ${displayName}, ${unreadCount > 0 ? `안 읽은 메시지 ${unreadCount}건` : "모두 읽음"}`}
      aria-current={isActive ? "true" : undefined}
    >
      {/* 아바타 placeholder (Phase 2 = 실제 avatar) */}
      <div className="w-10 h-10 rounded-full bg-surface-300 flex-shrink-0 flex items-center justify-center text-gray-500 text-xs font-semibold">
        {displayName.slice(0, 2)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-800 truncate font-medium">{displayName}</span>
          {v.showMutedIcon && <BellOff size={12} className="text-gray-400 flex-shrink-0" aria-label="음소거" />}
          {v.showMentionMark && <AtSign size={12} className="text-brand flex-shrink-0" aria-label="멘션 있음" />}
        </div>
        <div className={`text-xs truncate ${v.bodyClass}`}>
          {lastMessageSnippet ?? "메시지가 없습니다"}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[11px] text-gray-500">{time}</span>
        {v.showUnreadBadge && (
          <span
            className="bg-brand text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </div>
    </div>
  );
}
