/**
 * ConversationListItem 시각 분류 로직 — 순수 함수.
 *
 * 컴포넌트의 prop → className/플래그 매핑을 격리하여 단위 테스트로 검증.
 * (vitest 환경이 node 전용이라 렌더 테스트 불가. 분류 책임을 헬퍼로 추출하면 .test.ts 로 검증 가능.)
 *
 * Phase 2 에서 시각 검증은 kdydesignaudit / chrome-devtools-mcp.
 */

export interface ConversationItemVariant {
  /** 좌측 border + 배경 (active 상태). */
  containerClass: string;
  /** 본문 미리보기 텍스트 색 — muted 또는 unread=0 시 회색, unread>0 시 강조. */
  bodyClass: string;
  /** 안 읽은 수 배지 표시 여부. */
  showUnreadBadge: boolean;
  /** 음소거 자물쇠 아이콘 표시 여부. */
  showMutedIcon: boolean;
  /** 멘션 표식 (@) 표시 여부 — 멘션 + unread>0 동시. */
  showMentionMark: boolean;
}

export interface ConversationItemClassInput {
  isActive: boolean;
  isMuted: boolean;
  hasMention: boolean;
  unreadCount: number;
}

export function getConversationItemClasses(
  input: ConversationItemClassInput,
): ConversationItemVariant {
  const { isActive, isMuted, hasMention, unreadCount } = input;
  const base =
    "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors border-l-2 ";
  const containerClass = isActive
    ? base + "border-brand bg-brand/5"
    : base + "border-transparent hover:bg-surface-300";
  const bodyClass =
    isMuted || unreadCount === 0 ? "text-gray-500" : "text-gray-800 font-medium";
  return {
    containerClass,
    bodyClass,
    showUnreadBadge: unreadCount > 0,
    showMutedIcon: isMuted,
    showMentionMark: hasMention && unreadCount > 0,
  };
}
