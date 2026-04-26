/**
 * circuit-breaker-state 단위 테스트.
 *
 * 검증 대상 (07-adr-028-impl-spec §8 상태 전이도):
 *   1. CLOSED → OPEN at threshold 도달
 *   2. OPEN → HALF_OPEN after cooldown (isCooldownElapsed)
 *   3. HALF_OPEN → CLOSED on success
 *   4. HALF_OPEN → OPEN on failure (cooldown 재시작 — openedAt 갱신)
 *   + 추가: CLOSED → CLOSED (failures < threshold), CLOSED → CLOSED (success)
 */
import { describe, it, expect } from "vitest";
import {
  decideTransition,
  isCooldownElapsed,
  type CircuitState,
} from "./circuit-breaker-state";

const NOW = new Date("2026-04-27T12:00:00.000Z");
const COOLDOWN_MS = 60 * 60_000; // 1h — 07-adr-028-impl-spec §8

describe("decideTransition — 상태 전이 (07-adr-028-impl-spec §8)", () => {
  it("CLOSED + failure (failures < threshold) → CLOSED 유지", () => {
    const r = decideTransition({
      current: "CLOSED",
      success: false,
      failuresAfter: 3,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("CLOSED");
    expect(r.opened).toBe(false);
    expect(r.closed).toBe(false);
    expect(r.openedAt).toBeUndefined();
  });

  it("CLOSED + failure (failures = threshold) → OPEN 진입", () => {
    const r = decideTransition({
      current: "CLOSED",
      success: false,
      failuresAfter: 5,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("OPEN");
    expect(r.opened).toBe(true);
    expect(r.closed).toBe(false);
    expect(r.openedAt).toEqual(NOW);
  });

  it("CLOSED + success → CLOSED (closed=false, 회복 이벤트 아님)", () => {
    const r = decideTransition({
      current: "CLOSED",
      success: true,
      failuresAfter: 0,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("CLOSED");
    expect(r.opened).toBe(false);
    expect(r.closed).toBe(false);
  });

  it("HALF_OPEN + success → CLOSED (회복 이벤트, closed=true)", () => {
    const r = decideTransition({
      current: "HALF_OPEN",
      success: true,
      failuresAfter: 0,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("CLOSED");
    expect(r.opened).toBe(false);
    expect(r.closed).toBe(true);
  });

  it("HALF_OPEN + failure → OPEN (cooldown 재시작, openedAt 갱신)", () => {
    const r = decideTransition({
      current: "HALF_OPEN",
      success: false,
      failuresAfter: 6,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("OPEN");
    expect(r.opened).toBe(true);
    expect(r.closed).toBe(false);
    expect(r.openedAt).toEqual(NOW);
  });

  it("OPEN + failure → OPEN 유지 (openedAt 보존, opened=false)", () => {
    const r = decideTransition({
      current: "OPEN",
      success: false,
      failuresAfter: 7,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("OPEN");
    expect(r.opened).toBe(false); // 새 OPEN 이 아님 — caller 가 audit 발사 X.
    expect(r.closed).toBe(false);
    expect(r.openedAt).toBeUndefined();
  });

  it("OPEN + success → CLOSED (외부 caller 가 HALF_OPEN 거치지 않고 즉시 회복 케이스)", () => {
    // 일반 흐름은 OPEN→HALF_OPEN→CLOSED 지만 본 함수는 결과만 받음:
    // OPEN 상태에서 success 가 들어오면 CLOSED 로 복귀 (caller 가 HALF_OPEN 으로 사전 전이했다면 위 HALF_OPEN+success 케이스로 들어옴).
    const r = decideTransition({
      current: "OPEN",
      success: true,
      failuresAfter: 0,
      threshold: 5,
      now: NOW,
    });
    expect(r.nextState).toBe("CLOSED");
    expect(r.closed).toBe(true);
  });
});

describe("isCooldownElapsed — OPEN→HALF_OPEN 게이트", () => {
  it("openedAt = null → 즉시 elapsed (정합성 깨진 경우 회복 시도)", () => {
    expect(isCooldownElapsed(null, NOW, COOLDOWN_MS)).toBe(true);
  });

  it("openedAt 1h 전 → cooldown 정확히 만료", () => {
    const openedAt = new Date(NOW.getTime() - COOLDOWN_MS);
    expect(isCooldownElapsed(openedAt, NOW, COOLDOWN_MS)).toBe(true);
  });

  it("openedAt 30min 전 (1h cooldown) → 아직 경과 안 함", () => {
    const openedAt = new Date(NOW.getTime() - 30 * 60_000);
    expect(isCooldownElapsed(openedAt, NOW, COOLDOWN_MS)).toBe(false);
  });

  it("openedAt 1h+1ms 전 → 경과", () => {
    const openedAt = new Date(NOW.getTime() - COOLDOWN_MS - 1);
    expect(isCooldownElapsed(openedAt, NOW, COOLDOWN_MS)).toBe(true);
  });
});

describe("전체 시나리오 — CLOSED→OPEN→(cooldown)→HALF_OPEN→CLOSED 흐름", () => {
  it("성공/실패 시퀀스가 정확히 5개 상태를 거친다", () => {
    let state: CircuitState = "CLOSED";
    let failures = 0;

    // 5번 연속 실패 → OPEN.
    for (let i = 0; i < 4; i++) {
      failures++;
      const r = decideTransition({
        current: state,
        success: false,
        failuresAfter: failures,
        threshold: 5,
        now: NOW,
      });
      state = r.nextState;
      expect(state).toBe("CLOSED");
    }

    failures++;
    const opened = decideTransition({
      current: state,
      success: false,
      failuresAfter: failures,
      threshold: 5,
      now: NOW,
    });
    state = opened.nextState;
    expect(state).toBe("OPEN");
    expect(opened.openedAt).toEqual(NOW);

    // (외부 caller 가) cooldown 경과 후 HALF_OPEN 으로 사전 전이.
    state = "HALF_OPEN";

    // HALF_OPEN 에서 성공 → CLOSED 회복.
    const recovered = decideTransition({
      current: state,
      success: true,
      failuresAfter: 0,
      threshold: 5,
      now: NOW,
    });
    state = recovered.nextState;
    expect(state).toBe("CLOSED");
    expect(recovered.closed).toBe(true);
  });
});
