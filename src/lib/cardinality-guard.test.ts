// Phase 1.7 (T1.7) ADR-029 §3.3 — cardinality-guard 단위 테스트.

import { beforeEach, describe, expect, it } from "vitest";
import {
  isWithinCardinalityCap,
  resetCardinalityGuard,
  getCardinalityDropCount,
  getCardinalitySnapshot,
  MAX_SERIES_PER_TENANT,
} from "./cardinality-guard";

describe("cardinality-guard — C1 정책 (per-tenant series 캡)", () => {
  beforeEach(() => resetCardinalityGuard());

  it("첫 100 series 모두 허용 (cap 내)", () => {
    for (let i = 0; i < MAX_SERIES_PER_TENANT; i += 1) {
      expect(isWithinCardinalityCap("almanac", "api_calls", `bucket-${i}`)).toBe(
        true,
      );
    }
    expect(getCardinalityDropCount()).toBe(0);
    const snap = getCardinalitySnapshot();
    expect(snap).toContainEqual({
      tenantId: "almanac",
      seriesCount: MAX_SERIES_PER_TENANT,
    });
  });

  it("101번째 series 는 차단 + drop counter 증가", () => {
    for (let i = 0; i < MAX_SERIES_PER_TENANT; i += 1) {
      isWithinCardinalityCap("almanac", "api_calls", `bucket-${i}`);
    }
    expect(getCardinalityDropCount()).toBe(0);
    // 101번째 — cap 초과
    expect(
      isWithinCardinalityCap("almanac", "api_calls", "bucket-overflow"),
    ).toBe(false);
    expect(getCardinalityDropCount()).toBe(1);

    // 추가 차단도 카운터 증가.
    expect(
      isWithinCardinalityCap("almanac", "api_calls", "bucket-overflow-2"),
    ).toBe(false);
    expect(getCardinalityDropCount()).toBe(2);
  });

  it("기존 series 재진입은 항상 허용 (cap 영향 없음)", () => {
    isWithinCardinalityCap("almanac", "api_calls", "bucket-1");
    // 같은 series 재진입 — 100번 더 호출해도 OK.
    for (let i = 0; i < 100; i += 1) {
      expect(
        isWithinCardinalityCap("almanac", "api_calls", "bucket-1"),
      ).toBe(true);
    }
    expect(getCardinalityDropCount()).toBe(0);
  });

  it("tenant 간 격리 — 한 tenant 폭주가 다른 tenant 영향 없음", () => {
    // tenant A 가 cap 채움
    for (let i = 0; i < MAX_SERIES_PER_TENANT; i += 1) {
      isWithinCardinalityCap("tenant-A", "api_calls", `b-${i}`);
    }
    // 추가 series → 차단
    expect(isWithinCardinalityCap("tenant-A", "api_calls", "b-overflow")).toBe(
      false,
    );
    // tenant B 는 cap 영향 없음 (자기만의 100)
    for (let i = 0; i < MAX_SERIES_PER_TENANT; i += 1) {
      expect(isWithinCardinalityCap("tenant-B", "api_calls", `b-${i}`)).toBe(
        true,
      );
    }
    // tenant B 도 101번째는 차단
    expect(
      isWithinCardinalityCap("tenant-B", "api_calls", "b-overflow"),
    ).toBe(false);

    expect(getCardinalityDropCount()).toBe(2);
    const snap = getCardinalitySnapshot();
    expect(snap.find((s) => s.tenantId === "tenant-A")?.seriesCount).toBe(100);
    expect(snap.find((s) => s.tenantId === "tenant-B")?.seriesCount).toBe(100);
  });

  it("metricName + bucketKey 조합이 유니크 키 — 다른 metric 은 별개 series", () => {
    isWithinCardinalityCap("almanac", "api_calls", "route-1");
    isWithinCardinalityCap("almanac", "query_duration", "route-1");
    const snap = getCardinalitySnapshot();
    expect(snap.find((s) => s.tenantId === "almanac")?.seriesCount).toBe(2);
  });

  it("bucketKey 미지정도 별개 series", () => {
    isWithinCardinalityCap("almanac", "api_calls"); // bucketKey undefined
    isWithinCardinalityCap("almanac", "api_calls", "specific");
    const snap = getCardinalitySnapshot();
    expect(snap.find((s) => s.tenantId === "almanac")?.seriesCount).toBe(2);
  });
});
