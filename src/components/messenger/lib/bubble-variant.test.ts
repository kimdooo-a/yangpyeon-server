import { describe, expect, it } from "vitest";
import { getMessageBubbleVariant } from "./bubble-variant";

describe("getMessageBubbleVariant (MessageBubble 시각 variant)", () => {
  it("own — variant=own + bg-brand + justify-end + interactive", () => {
    const v = getMessageBubbleVariant({
      kind: "TEXT",
      deletedAt: null,
      isOwn: true,
    });
    expect(v.variant).toBe("own");
    expect(v.bubbleClass).toContain("bg-brand");
    expect(v.bubbleClass).toContain("text-white");
    expect(v.containerClass).toContain("justify-end");
    expect(v.isInteractive).toBe(true);
  });

  it("other — variant=other + bg-surface-200 + justify-start", () => {
    const v = getMessageBubbleVariant({
      kind: "TEXT",
      deletedAt: null,
      isOwn: false,
    });
    expect(v.variant).toBe("other");
    expect(v.bubbleClass).toContain("bg-surface-200");
    expect(v.bubbleClass).toContain("text-gray-800");
    expect(v.containerClass).toContain("justify-start");
    expect(v.isInteractive).toBe(true);
  });

  it("system — variant=system + 가운데 정렬 + 비대화형 + 작은 회색", () => {
    const v = getMessageBubbleVariant({
      kind: "SYSTEM",
      deletedAt: null,
      isOwn: false,
    });
    expect(v.variant).toBe("system");
    expect(v.containerClass).toContain("justify-center");
    expect(v.bubbleClass).toContain("text-gray-500");
    expect(v.bubbleClass).toContain("text-[11px]");
    expect(v.isInteractive).toBe(false);
  });

  it("recalled — deletedAt 있으면 kind 무관 italic + 비대화형 (own 정렬 유지)", () => {
    const recalledOwn = getMessageBubbleVariant({
      kind: "TEXT",
      deletedAt: new Date("2026-05-03T10:00:00Z"),
      isOwn: true,
    });
    expect(recalledOwn.variant).toBe("recalled");
    expect(recalledOwn.bubbleClass).toContain("italic");
    expect(recalledOwn.isInteractive).toBe(false);
    expect(recalledOwn.containerClass).toContain("justify-end");

    // 상대 회수
    const recalledOther = getMessageBubbleVariant({
      kind: "TEXT",
      deletedAt: "2026-05-03T10:00:00Z",
      isOwn: false,
    });
    expect(recalledOther.variant).toBe("recalled");
    expect(recalledOther.containerClass).toContain("justify-start");
  });
});
