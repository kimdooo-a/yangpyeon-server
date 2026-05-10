/**
 * Almanac plugin cors helper 단위 테스트.
 *
 * 검증 대상:
 *   - origin 미지정 → 빈 객체
 *   - allowed origin 매치 → 4 헤더 + Vary
 *   - 비매치 origin → 빈 객체 (브라우저가 CORS 거부)
 *   - 환경변수 미설정 → 모든 origin 거부
 *   - applyCors → 응답에 헤더 append
 *   - preflightResponse → 204 + 헤더
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyCors, buildCorsHeaders, preflightResponse } from "./cors";

const ORIG_ENV = process.env.ALMANAC_ALLOWED_ORIGINS;

beforeEach(() => {
  process.env.ALMANAC_ALLOWED_ORIGINS =
    "https://almanac-flame.vercel.app, https://almanac.test";
});

afterEach(() => {
  if (ORIG_ENV === undefined) {
    delete process.env.ALMANAC_ALLOWED_ORIGINS;
  } else {
    process.env.ALMANAC_ALLOWED_ORIGINS = ORIG_ENV;
  }
});

describe("buildCorsHeaders", () => {
  it("origin 헤더 미지정 → 빈 객체", () => {
    const req = new Request("http://localhost/x");
    expect(buildCorsHeaders(req)).toEqual({});
  });

  it("허용 origin 매치 → 4 헤더 + Vary", () => {
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://almanac.test" },
    });
    expect(buildCorsHeaders(req)).toEqual({
      "Access-Control-Allow-Origin": "https://almanac.test",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-api-key, content-type",
      Vary: "Origin",
    });
  });

  it("비매치 origin → 빈 객체", () => {
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://evil.example.com" },
    });
    expect(buildCorsHeaders(req)).toEqual({});
  });

  it("ALMANAC_ALLOWED_ORIGINS 미설정 → 모든 origin 거부", () => {
    delete process.env.ALMANAC_ALLOWED_ORIGINS;
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://almanac.test" },
    });
    expect(buildCorsHeaders(req)).toEqual({});
  });

  it("ALMANAC_ALLOWED_ORIGINS 빈 문자열 → 모든 origin 거부", () => {
    process.env.ALMANAC_ALLOWED_ORIGINS = "";
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://almanac.test" },
    });
    expect(buildCorsHeaders(req)).toEqual({});
  });
});

describe("applyCors", () => {
  it("응답에 CORS 헤더 append + 동일 응답 반환", () => {
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://almanac.test" },
    });
    const res = new Response("body", { status: 200 });
    const result = applyCors(req, res);

    expect(result).toBe(res);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://almanac.test",
    );
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("비매치 origin → 헤더 추가 없음", () => {
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://evil.example.com" },
    });
    const res = new Response("body", { status: 200 });
    applyCors(req, res);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("preflightResponse", () => {
  it("204 + CORS 헤더 (origin 매치)", async () => {
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://almanac.test" },
    });
    const res = preflightResponse(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://almanac.test",
    );
    expect(await res.text()).toBe("");
  });

  it("origin 비매치 → 204 + 빈 헤더 (브라우저가 CORS 거부)", () => {
    const req = new Request("http://localhost/x", {
      headers: { origin: "https://evil.example.com" },
    });
    const res = preflightResponse(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
