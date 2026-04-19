import { describe, it, expect } from "vitest";
import {
  computeCleanupWindow,
  runCleanupTasks,
  CLEANUP_HOUR_KST,
  type CleanupTask,
} from "./cleanup-scheduler";

describe("computeCleanupWindow — KST 03:00 매치", () => {
  it("KST 03:00 정각 매치 (UTC 18:00 전일)", () => {
    // 2026-04-19 18:00 UTC === 2026-04-20 03:00 KST
    const { match, key } = computeCleanupWindow(new Date("2026-04-19T18:00:00Z"));
    expect(match).toBe(true);
    expect(key).toBe("2026-04-20-03");
  });

  it("KST 03:30 도 윈도우 내 (시간 단위 매치)", () => {
    const { match } = computeCleanupWindow(new Date("2026-04-19T18:30:00Z"));
    expect(match).toBe(true);
  });

  it("KST 02:59 는 매치 아님", () => {
    // 2026-04-19 17:59 UTC === 2026-04-20 02:59 KST
    const { match } = computeCleanupWindow(new Date("2026-04-19T17:59:00Z"));
    expect(match).toBe(false);
  });

  it("KST 04:00 은 매치 아님", () => {
    const { match } = computeCleanupWindow(new Date("2026-04-19T19:00:00Z"));
    expect(match).toBe(false);
  });

  it("dedupe key 는 kstHour zero-padded + 날짜", () => {
    const { key } = computeCleanupWindow(new Date("2026-04-19T18:30:00Z"));
    expect(key).toBe("2026-04-20-03");
  });

  it("월 경계 처리 (UTC 말일 → KST 익월 1일)", () => {
    // 2026-04-30 18:00 UTC === 2026-05-01 03:00 KST
    const { match, key } = computeCleanupWindow(new Date("2026-04-30T18:00:00Z"));
    expect(match).toBe(true);
    expect(key).toBe("2026-05-01-03");
  });

  it("kstHour 커스텀 지원", () => {
    const { match, key } = computeCleanupWindow(new Date("2026-04-19T15:00:00Z"), 0);
    // 2026-04-19 15:00 UTC === 2026-04-20 00:00 KST
    expect(match).toBe(true);
    expect(key).toBe("2026-04-20-00");
  });

  it("기본 kstHour 상수 확인", () => {
    expect(CLEANUP_HOUR_KST).toBe(3);
  });
});

describe("runCleanupTasks — task 독립 실행", () => {
  it("모든 task summary 를 이름으로 반환", async () => {
    const tasks: CleanupTask[] = [
      { name: "a", run: async () => 3 },
      { name: "b", run: async () => 0 },
      { name: "c", run: async () => 7 },
    ];
    const summary = await runCleanupTasks(tasks);
    expect(summary).toEqual({ a: 3, b: 0, c: 7 });
  });

  it("한 task 실패가 뒤 task 를 블로킹하지 않음", async () => {
    const tasks: CleanupTask[] = [
      { name: "ok", run: async () => 5 },
      { name: "fail", run: async () => { throw new Error("boom"); } },
      { name: "after-fail", run: async () => 2 },
    ];
    const summary = await runCleanupTasks(tasks);
    expect(summary.ok).toBe(5);
    expect(summary.fail).toBe("ERROR: boom");
    expect(summary["after-fail"]).toBe(2);
  });

  it("Error 외 throw 도 방어적 처리", async () => {
    const tasks: CleanupTask[] = [
      { name: "string-throw", run: async () => { throw "just-a-string"; } },
    ];
    const summary = await runCleanupTasks(tasks);
    expect(summary["string-throw"]).toBe("ERROR");
  });

  it("빈 task 리스트 허용", async () => {
    const summary = await runCleanupTasks([]);
    expect(summary).toEqual({});
  });

  it("task 순서는 입력 순서 보존 (sequential)", async () => {
    const order: string[] = [];
    const tasks: CleanupTask[] = [
      { name: "first", run: async () => { order.push("first"); return 1; } },
      { name: "second", run: async () => { order.push("second"); return 2; } },
      { name: "third", run: async () => { order.push("third"); return 3; } },
    ];
    await runCleanupTasks(tasks);
    expect(order).toEqual(["first", "second", "third"]);
  });
});
