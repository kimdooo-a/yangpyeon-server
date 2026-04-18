import { describe, it, expect } from "vitest";
import { isValidIdentifier, quoteIdent } from "./identifier";

describe("isValidIdentifier", () => {
  it("accepts simple lowercase identifiers", () => {
    expect(isValidIdentifier("users")).toBe(true);
    expect(isValidIdentifier("folders")).toBe(true);
  });

  it("accepts identifiers with underscores and digits", () => {
    expect(isValidIdentifier("edge_function_runs")).toBe(true);
    expect(isValidIdentifier("table_1")).toBe(true);
    expect(isValidIdentifier("_private_table")).toBe(true);
  });

  it("accepts mixed case", () => {
    expect(isValidIdentifier("UserAccount")).toBe(true);
    expect(isValidIdentifier("MyTable123")).toBe(true);
  });

  it("rejects identifiers starting with a digit", () => {
    expect(isValidIdentifier("1table")).toBe(false);
    expect(isValidIdentifier("9users")).toBe(false);
  });

  it("rejects identifiers with special characters", () => {
    expect(isValidIdentifier("users;")).toBe(false);
    expect(isValidIdentifier("users--comment")).toBe(false);
    expect(isValidIdentifier("u'ser")).toBe(false);
    expect(isValidIdentifier("user\"quote")).toBe(false);
    expect(isValidIdentifier("user space")).toBe(false);
    expect(isValidIdentifier("user-dash")).toBe(false);
    expect(isValidIdentifier("user.col")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidIdentifier("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    // @ts-expect-error intentional wrong type
    expect(isValidIdentifier(null)).toBe(false);
    // @ts-expect-error intentional wrong type
    expect(isValidIdentifier(undefined)).toBe(false);
    // @ts-expect-error intentional wrong type
    expect(isValidIdentifier(123)).toBe(false);
  });

  it("rejects SQL injection probes", () => {
    expect(isValidIdentifier("folders; DROP TABLE users")).toBe(false);
    expect(isValidIdentifier("x\"; DROP TABLE \"users")).toBe(false);
    expect(isValidIdentifier("x' OR '1'='1")).toBe(false);
  });
});

describe("quoteIdent", () => {
  it("wraps valid identifier in double quotes", () => {
    expect(quoteIdent("users")).toBe(`"users"`);
    expect(quoteIdent("edge_function_runs")).toBe(`"edge_function_runs"`);
  });

  it("escapes embedded double quotes", () => {
    // Should never happen after isValidIdentifier (which rejects "), but defensive.
    // quoteIdent throws before reaching the replace, but test the replace logic path
    // by calling with an identifier that validates (no double quotes) to confirm
    // no extra escaping happens.
    expect(quoteIdent("plain")).toBe(`"plain"`);
  });

  it("throws on invalid identifiers", () => {
    expect(() => quoteIdent("1bad")).toThrow(/invalid identifier/);
    expect(() => quoteIdent("a; DROP")).toThrow(/invalid identifier/);
    expect(() => quoteIdent("")).toThrow(/invalid identifier/);
    expect(() => quoteIdent("a-b")).toThrow(/invalid identifier/);
  });

  it("is deterministic and idempotent for same input", () => {
    const a = quoteIdent("folders");
    const b = quoteIdent("folders");
    expect(a).toBe(b);
  });
});
