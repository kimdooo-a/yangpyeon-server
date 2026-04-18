import { describe, it, expect } from "vitest";
import { coerceValue, CoercionError } from "./coerce";

describe("coerceValue — null pass-through", () => {
  it("returns null when raw is null regardless of type", () => {
    expect(coerceValue("c", "integer", null)).toBeNull();
    expect(coerceValue("c", "text", null)).toBeNull();
    expect(coerceValue("c", "jsonb", null)).toBeNull();
  });
});

describe("coerceValue — integer types", () => {
  it("coerces string digits to number", () => {
    expect(coerceValue("c", "integer", "42")).toBe(42);
    expect(coerceValue("c", "bigint", "999999")).toBe(999999);
    expect(coerceValue("c", "smallint", "7")).toBe(7);
  });

  it("trims whitespace", () => {
    expect(coerceValue("c", "integer", "  42  ")).toBe(42);
  });

  it("accepts negative integers", () => {
    expect(coerceValue("c", "integer", "-5")).toBe(-5);
  });

  it("throws on non-integer strings", () => {
    expect(() => coerceValue("c", "integer", "3.14")).toThrow(CoercionError);
    expect(() => coerceValue("c", "integer", "abc")).toThrow(CoercionError);
  });

  it("⚠ quirk: empty string coerces to 0 (Number('') === 0)", () => {
    // 현재 동작 기록 — 사용자가 빈 폼을 제출하면 0이 들어간다.
    // 이 동작이 문제가 되면 coerceValue에 명시 empty-string 가드 추가 필요.
    expect(coerceValue("c", "integer", "")).toBe(0);
  });
});

describe("coerceValue — numeric/decimal (precision preserved as string)", () => {
  it("returns trimmed string for numeric", () => {
    expect(coerceValue("c", "numeric", "123.456")).toBe("123.456");
    expect(coerceValue("c", "real", "  0.5 ")).toBe("0.5");
    expect(coerceValue("c", "double precision", "-99")).toBe("-99");
  });

  it("accepts decimal(10,2) style", () => {
    expect(coerceValue("c", "decimal(10,2)", "1000.25")).toBe("1000.25");
  });

  it("throws on malformed numeric", () => {
    expect(() => coerceValue("c", "numeric", "1,000")).toThrow(CoercionError);
    expect(() => coerceValue("c", "numeric", "abc")).toThrow(CoercionError);
    expect(() => coerceValue("c", "numeric", "1.2.3")).toThrow(CoercionError);
  });
});

describe("coerceValue — boolean", () => {
  it("accepts native boolean values", () => {
    expect(coerceValue("c", "boolean", true)).toBe(true);
    expect(coerceValue("c", "boolean", false)).toBe(false);
  });

  it("accepts string variants (case-insensitive)", () => {
    expect(coerceValue("c", "boolean", "true")).toBe(true);
    expect(coerceValue("c", "boolean", "TRUE")).toBe(true);
    expect(coerceValue("c", "boolean", "t")).toBe(true);
    expect(coerceValue("c", "boolean", "1")).toBe(true);
    expect(coerceValue("c", "boolean", "false")).toBe(false);
    expect(coerceValue("c", "boolean", "F")).toBe(false);
    expect(coerceValue("c", "boolean", "0")).toBe(false);
  });

  it("throws on unrecognized boolean input", () => {
    expect(() => coerceValue("c", "boolean", "maybe")).toThrow(CoercionError);
    expect(() => coerceValue("c", "boolean", "yes")).toThrow(CoercionError);
  });
});

describe("coerceValue — uuid", () => {
  it("accepts canonical UUID", () => {
    expect(coerceValue("c", "uuid", "550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("accepts uppercase UUID", () => {
    expect(coerceValue("c", "uuid", "550E8400-E29B-41D4-A716-446655440000")).toBe(
      "550E8400-E29B-41D4-A716-446655440000",
    );
  });

  it("trims whitespace", () => {
    expect(coerceValue("c", "uuid", "  550e8400-e29b-41d4-a716-446655440000  ")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("throws on malformed UUID", () => {
    expect(() => coerceValue("c", "uuid", "not-a-uuid")).toThrow(CoercionError);
    expect(() => coerceValue("c", "uuid", "550e8400")).toThrow(CoercionError);
    expect(() => coerceValue("c", "uuid", "550e8400-e29b-41d4-a716-44665544000")).toThrow(
      CoercionError,
    );
  });
});

describe("coerceValue — timestamp/date", () => {
  it("normalizes ISO string to ISO", () => {
    const out = coerceValue("c", "timestamp without time zone", "2026-04-18T10:30:00Z");
    expect(out).toBe("2026-04-18T10:30:00.000Z");
  });

  it("accepts date-only input", () => {
    const out = coerceValue("c", "date", "2026-04-18");
    expect(typeof out).toBe("string");
    expect(out).toMatch(/^2026-04-18T/);
  });

  it("throws on unparseable date", () => {
    expect(() => coerceValue("c", "timestamp", "not-a-date")).toThrow(CoercionError);
  });
});

describe("coerceValue — json/jsonb", () => {
  it("passes through object unchanged", () => {
    const obj = { a: 1, b: [2, 3] };
    expect(coerceValue("c", "jsonb", obj)).toBe(obj);
  });

  it("parses JSON string", () => {
    expect(coerceValue("c", "json", '{"x":1}')).toEqual({ x: 1 });
    expect(coerceValue("c", "jsonb", "[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("throws on malformed JSON", () => {
    expect(() => coerceValue("c", "jsonb", "{not json}")).toThrow(CoercionError);
  });
});

describe("coerceValue — text/varchar (fallback)", () => {
  it("stringifies numbers and booleans", () => {
    expect(coerceValue("c", "text", 42)).toBe("42");
    expect(coerceValue("c", "character varying", true)).toBe("true");
  });

  it("preserves strings as-is", () => {
    expect(coerceValue("c", "text", "hello world")).toBe("hello world");
  });

  it("treats unknown data types as text (fallback)", () => {
    expect(coerceValue("c", "bpchar", "abc")).toBe("abc");
    expect(coerceValue("c", "cidr", "192.168.0.1/24")).toBe("192.168.0.1/24");
  });
});

describe("CoercionError", () => {
  it("carries column name and reason", () => {
    try {
      coerceValue("age", "integer", "abc");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CoercionError);
      expect((err as CoercionError).column).toBe("age");
      expect((err as CoercionError).reason).toMatch(/정수/);
    }
  });
});
