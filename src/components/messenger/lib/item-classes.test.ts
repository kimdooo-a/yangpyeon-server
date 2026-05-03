import { describe, expect, it } from "vitest";
import { getConversationItemClasses } from "./item-classes";

describe("getConversationItemClasses (ConversationListItem 시각 분류)", () => {
  it("active state — border-brand + bg-brand/5 + base 클래스 보존", () => {
    const v = getConversationItemClasses({
      isActive: true,
      isMuted: false,
      hasMention: false,
      unreadCount: 0,
    });
    expect(v.containerClass).toContain("border-brand");
    expect(v.containerClass).toContain("bg-brand/5");
    expect(v.containerClass).toContain("border-l-2");
    expect(v.containerClass).not.toContain("hover:bg-surface-300");
  });

  it("unread badge — unreadCount>0 시 showUnreadBadge=true + 본문 강조", () => {
    const v = getConversationItemClasses({
      isActive: false,
      isMuted: false,
      hasMention: false,
      unreadCount: 3,
    });
    expect(v.showUnreadBadge).toBe(true);
    expect(v.bodyClass).toContain("text-gray-800");
    expect(v.bodyClass).toContain("font-medium");
  });

  it("muted state — showMutedIcon=true + 본문 회색 (unread 0)", () => {
    const v = getConversationItemClasses({
      isActive: false,
      isMuted: true,
      hasMention: false,
      unreadCount: 0,
    });
    expect(v.showMutedIcon).toBe(true);
    expect(v.showUnreadBadge).toBe(false);
    expect(v.bodyClass).toContain("text-gray-500");
  });

  it("mention 표식 — hasMention + unread>0 동시일 때만 showMentionMark=true", () => {
    const withUnread = getConversationItemClasses({
      isActive: false,
      isMuted: false,
      hasMention: true,
      unreadCount: 1,
    });
    expect(withUnread.showMentionMark).toBe(true);

    // 멘션은 있어도 모두 읽었으면 표식 X (스팸 회피).
    const allRead = getConversationItemClasses({
      isActive: false,
      isMuted: false,
      hasMention: true,
      unreadCount: 0,
    });
    expect(allRead.showMentionMark).toBe(false);
  });
});
