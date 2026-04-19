import { describe, it, expect } from "vitest";
import {
  shouldTouch,
  parseUserAgent,
  TOUCH_THROTTLE_MS,
} from "./activity";

describe("TOUCH_THROTTLE_MS 상수", () => {
  it("기본 60초", () => {
    expect(TOUCH_THROTTLE_MS).toBe(60_000);
  });
});

describe("shouldTouch — GET /sessions 디바운스", () => {
  const base = new Date("2026-04-19T12:00:00Z");

  it("lastUsedAt 60초 전 → true (임계치 포함 이상)", () => {
    const last = new Date(base.getTime() - 60_000);
    expect(shouldTouch(last, base)).toBe(true);
  });

  it("lastUsedAt 30초 전 → false (임계치 미만)", () => {
    const last = new Date(base.getTime() - 30_000);
    expect(shouldTouch(last, base)).toBe(false);
  });

  it("lastUsedAt 59.999초 전 → false (경계 한 틱 미만)", () => {
    const last = new Date(base.getTime() - 59_999);
    expect(shouldTouch(last, base)).toBe(false);
  });

  it("lastUsedAt 60.001초 전 → true (경계 한 틱 초과)", () => {
    const last = new Date(base.getTime() - 60_001);
    expect(shouldTouch(last, base)).toBe(true);
  });

  it("lastUsedAt 1시간 전 → true", () => {
    const last = new Date(base.getTime() - 3_600_000);
    expect(shouldTouch(last, base)).toBe(true);
  });

  it("now == lastUsedAt (diff 0) → false", () => {
    expect(shouldTouch(base, base)).toBe(false);
  });

  it("시계 역행 (now < lastUsedAt) → false (음수 diff)", () => {
    const last = new Date(base.getTime() + 10_000);
    expect(shouldTouch(last, base)).toBe(false);
  });

  it("threshold 커스터마이징 (예: 5초)", () => {
    const last = new Date(base.getTime() - 7_000);
    expect(shouldTouch(last, base, 5_000)).toBe(true);
    expect(shouldTouch(last, base, 10_000)).toBe(false);
  });

  it("threshold = 0 → diff >= 0 이면 항상 true (동일 시각 포함)", () => {
    expect(shouldTouch(base, base, 0)).toBe(true);
  });

  it("now 기본값(현재 시각) 사용 가능", () => {
    const longAgo = new Date(0);
    expect(shouldTouch(longAgo)).toBe(true);
  });
});

describe("parseUserAgent — raw UA 를 사람 읽기 쉬운 문자열로", () => {
  it("Windows Chrome 130", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Chrome 130 · Windows");
  });

  it("macOS Chrome 131", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Chrome 131 · macOS");
  });

  it("iOS Safari 17", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua)).toBe("Safari 17 · iOS");
  });

  it("Android Chrome 130", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Chrome 130 · Android");
  });

  it("Linux Firefox 134", () => {
    const ua =
      "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0";
    expect(parseUserAgent(ua)).toBe("Firefox 134 · Linux");
  });

  it("Edge 131 (Edg/ 토큰은 Chrome 토큰보다 우선)", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
    expect(parseUserAgent(ua)).toBe("Edge 131 · Windows");
  });

  it("curl 8.5.0 → 'curl 8' (OS 분기 생략)", () => {
    expect(parseUserAgent("curl/8.5.0")).toBe("curl 8");
  });

  it("null → '알 수 없음'", () => {
    expect(parseUserAgent(null)).toBe("알 수 없음");
  });

  it("undefined → '알 수 없음'", () => {
    expect(parseUserAgent(undefined)).toBe("알 수 없음");
  });

  it("빈 문자열 → '알 수 없음'", () => {
    expect(parseUserAgent("")).toBe("알 수 없음");
  });

  it("파싱 불가 UA → '기타 브라우저 · 기타 OS'", () => {
    expect(parseUserAgent("SomeUnknownBot/1.0")).toBe(
      "기타 브라우저 · 기타 OS",
    );
  });

  it("OS 만 알 수 있는 경우 — macOS 탐지만 성공", () => {
    expect(parseUserAgent("WeirdBrowser (Macintosh; Mac OS X)")).toBe(
      "기타 브라우저 · macOS",
    );
  });

  it("브라우저만 알 수 있는 경우 — Firefox OS 미탐지", () => {
    expect(parseUserAgent("Firefox/120.0 (Unknown Platform)")).toBe(
      "Firefox 120 · 기타 OS",
    );
  });

  it("Safari macOS (iOS 아님)", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15";
    expect(parseUserAgent(ua)).toBe("Safari 17 · macOS");
  });
});
