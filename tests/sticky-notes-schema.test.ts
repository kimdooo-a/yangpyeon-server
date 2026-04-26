import { describe, expect, it } from "vitest";
import {
  createStickyNoteSchema,
  updateStickyNoteSchema,
} from "../src/lib/schemas/sticky-notes";

describe("sticky-notes Zod schemas", () => {
  describe("createStickyNoteSchema", () => {
    it("기본값을 채워 빈 객체를 통과시킨다", () => {
      const result = createStickyNoteSchema.parse({});
      expect(result.color).toBe("#fde68a");
      expect(result.posX).toBe(40);
      expect(result.visibility).toBe("PRIVATE");
      expect(result.pinned).toBe(false);
    });

    it("HEX 색상 검증", () => {
      expect(() => createStickyNoteSchema.parse({ color: "red" })).toThrow();
      expect(() => createStickyNoteSchema.parse({ color: "#abc" })).not.toThrow();
      expect(() => createStickyNoteSchema.parse({ color: "#abcdef" })).not.toThrow();
    });

    it("4000자 초과 content 거부", () => {
      const long = "x".repeat(4001);
      expect(() => createStickyNoteSchema.parse({ content: long })).toThrow();
    });

    it("visibility enum 외 값 거부", () => {
      expect(() =>
        createStickyNoteSchema.parse({ visibility: "PUBLIC" }),
      ).toThrow();
    });

    it("음수 위치 거부", () => {
      expect(() => createStickyNoteSchema.parse({ posX: -1 })).toThrow();
    });
  });

  describe("updateStickyNoteSchema", () => {
    it("빈 객체는 거부", () => {
      expect(() => updateStickyNoteSchema.parse({})).toThrow();
    });

    it("부분 갱신 허용", () => {
      const result = updateStickyNoteSchema.parse({ color: "#86efac" });
      expect(result.color).toBe("#86efac");
    });

    it("width/height 범위 검증", () => {
      expect(() => updateStickyNoteSchema.parse({ width: 100 })).toThrow();
      expect(() => updateStickyNoteSchema.parse({ width: 700 })).toThrow();
      expect(() => updateStickyNoteSchema.parse({ width: 220 })).not.toThrow();
    });
  });
});
