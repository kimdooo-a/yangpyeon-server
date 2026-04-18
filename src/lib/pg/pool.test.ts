import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * pg.Pool 모킹 — vi.mock은 호이스팅되므로 변수 참조 시 vi.hoisted 사용.
 *
 * 모든 테스트에서 동일한 mockConnect / mockQuery / mockRelease 인스턴스를 공유하여
 * 호출 순서와 인자를 spy 한다. globalThis.__pgPool 캐시는 beforeEach에서 리셋.
 */
const { mockConnect, mockQuery, mockRelease, MockPool } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();
  const mockConnect = vi.fn();
  // `new Pool(...)` 으로 호출되므로 생성자 가능한 일반 function 사용 (화살표 X)
  const MockPool = vi.fn(function (this: { connect: typeof mockConnect }) {
    this.connect = mockConnect;
  });
  return { mockConnect, mockQuery, mockRelease, MockPool };
});

vi.mock("pg", () => ({
  Pool: MockPool,
}));

// 모킹 후에 import — vi.mock 호이스팅으로 이 import 시점에는 이미 mock 적용 상태.
import { runReadonly, runReadwrite } from "./pool";

beforeEach(() => {
  vi.clearAllMocks();
  // 모듈 내부 글로벌 캐시 리셋 (테스트 격리)
  (globalThis as { __pgPool?: unknown }).__pgPool = undefined;
  // 기본 client 동작 — 각 테스트에서 query 응답을 mockResolvedValueOnce로 추가 설정
  mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
});

// ---------------------------------------------------------------------------
// runReadonly
// ---------------------------------------------------------------------------

describe("runReadonly — happy path", () => {
  it("BEGIN READ ONLY → SET LOCAL statement_timeout → SET LOCAL ROLE app_readonly → SELECT → COMMIT 순서로 호출", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN READ ONLY
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockResolvedValueOnce(undefined) // SET LOCAL ROLE app_readonly
      .mockResolvedValueOnce({
        rows: [{ id: 1, name: "alice" }],
        fields: [
          { name: "id", dataTypeID: 23 },
          { name: "name", dataTypeID: 25 },
        ],
        rowCount: 1,
      }) // SELECT
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await runReadonly("SELECT id, name FROM users WHERE id = $1", [1]);

    const calls = mockQuery.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "BEGIN READ ONLY",
      "SET LOCAL statement_timeout = 10000",
      "SET LOCAL ROLE app_readonly",
      "SELECT id, name FROM users WHERE id = $1",
      "COMMIT",
    ]);
    expect(mockRelease).toHaveBeenCalledTimes(1);

    expect(result.rows).toEqual([{ id: 1, name: "alice" }]);
    expect(result.rowCount).toBe(1);
    expect(result.fields).toEqual([
      { name: "id", dataType: "23" },
      { name: "name", dataType: "25" },
    ]);
  });

  it("SELECT params 가 client.query 의 두번째 인자로 전달", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    await runReadonly("SELECT * FROM t WHERE a = $1 AND b = $2", [42, "x"]);

    // 4번째 호출이 SELECT
    expect(mockQuery.mock.calls[3]).toEqual([
      "SELECT * FROM t WHERE a = $1 AND b = $2",
      [42, "x"],
    ]);
  });
});

describe("runReadonly — app_readonly 롤 부재 관대 정책", () => {
  it("SET LOCAL ROLE app_readonly 가 throw 해도 SELECT 진행, COMMIT 도달", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN READ ONLY
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockRejectedValueOnce(new Error("role app_readonly does not exist")) // SET ROLE 실패
      .mockResolvedValueOnce({ rows: [{ ok: true }], fields: [], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await runReadonly("SELECT 1 AS ok");

    const calls = mockQuery.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "BEGIN READ ONLY",
      "SET LOCAL statement_timeout = 10000",
      "SET LOCAL ROLE app_readonly",
      "SELECT 1 AS ok",
      "COMMIT",
    ]);
    expect(result.rows).toEqual([{ ok: true }]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe("runReadonly — useReadonlyRole=false", () => {
  it("SET LOCAL ROLE app_readonly 호출을 스킵", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN READ ONLY
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: 0 }) // SELECT
      .mockResolvedValueOnce(undefined); // COMMIT

    await runReadonly("SELECT 1", [], { useReadonlyRole: false });

    const calls = mockQuery.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "BEGIN READ ONLY",
      "SET LOCAL statement_timeout = 10000",
      "SELECT 1",
      "COMMIT",
    ]);
    expect(calls).not.toContain("SET LOCAL ROLE app_readonly");
  });
});

describe("runReadonly — timeoutMs 옵션", () => {
  it("기본값 10000 적용", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    await runReadonly("SELECT 1");

    expect(mockQuery.mock.calls[1][0]).toBe("SET LOCAL statement_timeout = 10000");
  });

  it("timeoutMs=3000 옵션 반영", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    await runReadonly("SELECT 1", [], { timeoutMs: 3000 });

    expect(mockQuery.mock.calls[1][0]).toBe("SET LOCAL statement_timeout = 3000");
  });
});

describe("runReadonly — 에러 처리", () => {
  it("SELECT 실패 시 ROLLBACK 호출 + 에러 전파 + release 호출", async () => {
    const selectErr = new Error("syntax error");
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN READ ONLY
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockResolvedValueOnce(undefined) // SET LOCAL ROLE app_readonly
      .mockRejectedValueOnce(selectErr) // SELECT 실패
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(runReadonly("SELECT bad")).rejects.toThrow("syntax error");

    const calls = mockQuery.mock.calls.map((c) => c[0]);
    expect(calls).toContain("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("ROLLBACK 자체가 실패해도 원본 에러를 전파하고 release 호출", async () => {
    const selectErr = new Error("primary failure");
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(selectErr) // SELECT
      .mockRejectedValueOnce(new Error("rollback also failed")); // ROLLBACK

    await expect(runReadonly("SELECT bad")).rejects.toThrow("primary failure");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe("runReadonly — fields/rowCount 매핑", () => {
  it("dataTypeID 를 String 으로 변환하여 dataType 으로 매핑", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [],
        fields: [
          { name: "col_int", dataTypeID: 23 },
          { name: "col_text", dataTypeID: 25 },
          { name: "col_bool", dataTypeID: 16 },
        ],
        rowCount: 0,
      })
      .mockResolvedValueOnce(undefined);

    const result = await runReadonly("SELECT * FROM x");

    expect(result.fields).toEqual([
      { name: "col_int", dataType: "23" },
      { name: "col_text", dataType: "25" },
      { name: "col_bool", dataType: "16" },
    ]);
  });

  it("fields 가 undefined 여도 빈 배열 반환", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: undefined, rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    const result = await runReadonly("SELECT 1");
    expect(result.fields).toEqual([]);
  });

  it("rowCount 가 null 이어도 0 으로 반환", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: null })
      .mockResolvedValueOnce(undefined);

    const result = await runReadonly("SELECT 1");
    expect(result.rowCount).toBe(0);
  });
});

describe("runReadonly — DATABASE_URL 부재", () => {
  it("DATABASE_URL 미설정 시 에러", async () => {
    delete process.env.DATABASE_URL;
    await expect(runReadonly("SELECT 1")).rejects.toThrow(
      /DATABASE_URL 환경변수가 설정되지 않았습니다/,
    );
  });
});

// ---------------------------------------------------------------------------
// runReadwrite
// ---------------------------------------------------------------------------

describe("runReadwrite — happy path", () => {
  it("BEGIN → SET LOCAL ROLE app_readwrite → SET LOCAL statement_timeout → 쿼리 → COMMIT 순서로 호출", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL ROLE app_readwrite
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT

    const result = await runReadwrite("UPDATE foo SET bar = $1 WHERE id = $2 RETURNING id", [
      "hello",
      1,
    ]);

    expect(mockQuery.mock.calls.map((c) => c[0])).toEqual([
      "BEGIN",
      "SET LOCAL ROLE app_readwrite",
      "SET LOCAL statement_timeout = 10000",
      "UPDATE foo SET bar = $1 WHERE id = $2 RETURNING id",
      "COMMIT",
    ]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.rowCount).toBe(1);
  });

  it("쿼리 params 가 client.query 의 두번째 인자로 전달", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    await runReadwrite("INSERT INTO t (a, b) VALUES ($1, $2)", [1, "x"]);

    // 4번째 호출이 INSERT
    expect(mockQuery.mock.calls[3]).toEqual([
      "INSERT INTO t (a, b) VALUES ($1, $2)",
      [1, "x"],
    ]);
  });
});

describe("runReadwrite — fail-closed: app_readwrite 롤 부재", () => {
  it("SET LOCAL ROLE app_readwrite 실패 시 ROLLBACK + 에러 전파 (관대 처리 안함)", async () => {
    const roleErr = new Error("role app_readwrite does not exist");
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(roleErr) // SET LOCAL ROLE app_readwrite — 실패
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(
      runReadwrite("UPDATE foo SET bar = 1"),
    ).rejects.toThrow("role app_readwrite does not exist");

    const calls = mockQuery.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      "BEGIN",
      "SET LOCAL ROLE app_readwrite",
      "ROLLBACK",
    ]);
    // UPDATE 와 COMMIT 은 호출되지 않아야 함
    expect(calls).not.toContain("UPDATE foo SET bar = 1");
    expect(calls).not.toContain("COMMIT");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe("runReadwrite — timeoutMs", () => {
  it("기본값 10000ms 적용", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    await runReadwrite("UPDATE foo SET bar = 1");

    expect(mockQuery.mock.calls[2][0]).toBe("SET LOCAL statement_timeout = 10000");
  });

  it("timeoutMs=5000 옵션 반영", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    await runReadwrite("UPDATE foo SET bar = 1", [], { timeoutMs: 5000 });

    expect(mockQuery.mock.calls[2][0]).toBe("SET LOCAL statement_timeout = 5000");
  });
});

describe("runReadwrite — 쿼리 실패 시 ROLLBACK + 에러 전파", () => {
  it("UPDATE 실패 시 ROLLBACK 호출 + 에러 전파 + release", async () => {
    const updateErr = new Error("constraint violation");
    mockQuery
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL ROLE app_readwrite
      .mockResolvedValueOnce(undefined) // SET LOCAL statement_timeout
      .mockRejectedValueOnce(updateErr) // UPDATE 실패
      .mockResolvedValueOnce(undefined); // ROLLBACK

    await expect(runReadwrite("UPDATE bad SET x = 1")).rejects.toThrow(
      "constraint violation",
    );

    const calls = mockQuery.mock.calls.map((c) => c[0]);
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("ROLLBACK 자체가 실패해도 원본 에러를 전파하고 release 호출", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("query failed")) // UPDATE
      .mockRejectedValueOnce(new Error("rollback failed")); // ROLLBACK

    await expect(runReadwrite("UPDATE bad")).rejects.toThrow("query failed");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("BEGIN 실패 시에도 release 호출 (finally 보장)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("begin failed")); // BEGIN
    // ROLLBACK 시도 — 실패해도 무시
    mockQuery.mockRejectedValueOnce(new Error("rollback after begin failed"));

    await expect(runReadwrite("UPDATE x")).rejects.toThrow("begin failed");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe("runReadwrite — rowCount null 처리", () => {
  it("결과의 rowCount 가 null 이어도 0 으로 반환", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce(undefined);

    const result = await runReadwrite("UPDATE foo SET bar = 1");
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it("rowCount 가 양수면 그대로 반환", async () => {
    mockQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }], rowCount: 3 })
      .mockResolvedValueOnce(undefined);

    const result = await runReadwrite("DELETE FROM foo WHERE x = 1");
    expect(result.rowCount).toBe(3);
    expect(result.rows).toHaveLength(3);
  });
});

describe("runReadwrite — DATABASE_URL 부재", () => {
  it("DATABASE_URL 미설정 시 에러", async () => {
    delete process.env.DATABASE_URL;
    await expect(runReadwrite("UPDATE foo SET bar = 1")).rejects.toThrow(
      /DATABASE_URL 환경변수가 설정되지 않았습니다/,
    );
  });
});

// ---------------------------------------------------------------------------
// 풀 캐시
// ---------------------------------------------------------------------------

describe("getPgPool — 글로벌 캐시", () => {
  it("동일 프로세스 내에서 Pool 생성자는 한 번만 호출 (캐시)", async () => {
    mockQuery
      .mockResolvedValue(undefined) // 모든 호출에 기본 응답
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [], fields: [], rowCount: 0 })
      .mockResolvedValueOnce(undefined);

    MockPool.mockClear();

    await runReadonly("SELECT 1");
    await runReadonly("SELECT 2");

    // 두 번째 호출은 캐시된 Pool 사용 — Pool 생성자는 1회만
    expect(MockPool).toHaveBeenCalledTimes(1);
  });
});
