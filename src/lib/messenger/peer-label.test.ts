/**
 * peer-label.ts — TDD (M4 Phase 2 F2-5).
 *
 * derivePeerLabel(conv, currentUserId) 의 분기 검증:
 *   DIRECT / GROUP / CHANNEL × peer 정보 / title 정보 매트릭스.
 */
import { describe, it, expect } from "vitest";
import { derivePeerLabel } from "./peer-label";

describe("derivePeerLabel", () => {
  describe("GROUP/CHANNEL", () => {
    it("title 있으면 그대로", () => {
      expect(
        derivePeerLabel(
          { kind: "GROUP", title: "팀 회의", members: [] },
          "u-self",
        ),
      ).toBe("팀 회의");
    });

    it("CHANNEL title 있으면 그대로", () => {
      expect(
        derivePeerLabel(
          { kind: "CHANNEL", title: "공지", members: [] },
          "u-self",
        ),
      ).toBe("공지");
    });

    it("title=null → (제목 없음)", () => {
      expect(
        derivePeerLabel(
          { kind: "GROUP", title: null, members: [] },
          "u-self",
        ),
      ).toBe("(제목 없음)");
    });
  });

  describe("DIRECT", () => {
    it("peer.user.name 있으면 name 우선", () => {
      const r = derivePeerLabel(
        {
          kind: "DIRECT",
          title: null,
          members: [
            { userId: "u-self", user: { email: "me@example.com", name: "나" } },
            { userId: "u-peer", user: { email: "alice@example.com", name: "Alice" } },
          ],
        },
        "u-self",
      );
      expect(r).toBe("Alice");
    });

    it("peer.user.name 비어 있으면 email 사용", () => {
      const r = derivePeerLabel(
        {
          kind: "DIRECT",
          title: null,
          members: [
            { userId: "u-self", user: { email: "me@x.com", name: null } },
            { userId: "u-peer", user: { email: "alice@example.com", name: "" } },
          ],
        },
        "u-self",
      );
      expect(r).toBe("alice@example.com");
    });

    it("peer.user.name 공백만이면 email 사용 (trim 후 빈 문자열)", () => {
      const r = derivePeerLabel(
        {
          kind: "DIRECT",
          title: null,
          members: [
            { userId: "u-self", user: { email: "me@x.com" } },
            { userId: "u-peer", user: { email: "alice@example.com", name: "   " } },
          ],
        },
        "u-self",
      );
      expect(r).toBe("alice@example.com");
    });

    it("peer.user 정보 없음 → userId 8자 prefix", () => {
      const r = derivePeerLabel(
        {
          kind: "DIRECT",
          title: null,
          members: [
            { userId: "u-self", user: undefined },
            { userId: "abcdef1234567890", user: undefined },
          ],
        },
        "u-self",
      );
      expect(r).toBe("abcdef12");
    });

    it("peer 멤버 미발견 (혼자) → 'DM'", () => {
      const r = derivePeerLabel(
        {
          kind: "DIRECT",
          title: null,
          members: [{ userId: "u-self", user: { email: "me@x.com" } }],
        },
        "u-self",
      );
      expect(r).toBe("DM");
    });

    it("currentUserId undefined → 첫 멤버를 peer 로 처리", () => {
      const r = derivePeerLabel(
        {
          kind: "DIRECT",
          title: null,
          members: [
            { userId: "u1", user: { email: "alice@x.com", name: "Alice" } },
          ],
        },
        undefined,
      );
      expect(r).toBe("Alice");
    });

    it("members 누락 (undefined) → 'DM'", () => {
      const r = derivePeerLabel(
        { kind: "DIRECT", title: null, members: undefined },
        "u-self",
      );
      expect(r).toBe("DM");
    });
  });
});
