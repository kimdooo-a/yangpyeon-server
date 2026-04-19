import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { fetchDateFieldsText, toIsoOrNull } from "./date-fields";
import { prisma } from "@/lib/prisma";

const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;

describe("fetchDateFieldsText", () => {
  beforeEach(() => {
    queryRawMock.mockReset();
  });

  it("ids 가 비면 즉시 빈 Map 반환 (DB 호출 없음)", async () => {
    const map = await fetchDateFieldsText("users", [], ["created_at"]);
    expect(map.size).toBe(0);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("fields 가 비면 즉시 빈 Map 반환", async () => {
    const map = await fetchDateFieldsText("users", ["a"], []);
    expect(map.size).toBe(0);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("화이트리스트 외 테이블 → throw", async () => {
    await expect(
      fetchDateFieldsText("evil_table", ["a"], ["created_at"]),
    ).rejects.toThrow(/화이트리스트/);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("컬럼명 SQL injection 시도 → throw", async () => {
    await expect(
      fetchDateFieldsText("users", ["a"], ["created_at; DROP TABLE users"]),
    ).rejects.toThrow(/형식 위반/);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it("대문자 컬럼명 → throw (PG snake_case 강제)", async () => {
    await expect(
      fetchDateFieldsText("users", ["a"], ["createdAt"]),
    ).rejects.toThrow(/형식 위반/);
  });

  it("정상 호출 시 Map 반환 (id → fields record)", async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: "u1",
        created_at_text: "2026-04-06 14:11:17.147+00",
        updated_at_text: "2026-04-06 15:00:00+00",
      },
      {
        id: "u2",
        created_at_text: null,
        updated_at_text: "2026-04-06 16:00:00+00",
      },
    ]);
    const map = await fetchDateFieldsText("users", ["u1", "u2"], [
      "created_at",
      "updated_at",
    ]);
    expect(map.size).toBe(2);
    expect(map.get("u1")).toEqual({
      created_at: "2026-04-06 14:11:17.147+00",
      updated_at: "2026-04-06 15:00:00+00",
    });
    expect(map.get("u2")?.created_at).toBeNull();
    expect(map.get("u2")?.updated_at).toBe("2026-04-06 16:00:00+00");
  });

  it("DB 결과에 누락된 _text 컬럼 → null 처리", async () => {
    queryRawMock.mockResolvedValueOnce([{ id: "u1", created_at_text: undefined }]);
    const map = await fetchDateFieldsText("users", ["u1"], ["created_at"]);
    expect(map.get("u1")).toEqual({ created_at: null });
  });
});

describe("toIsoOrNull", () => {
  it("null/undefined/빈 문자열 → null", () => {
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
    expect(toIsoOrNull("")).toBeNull();
  });
  it("PG timestamptz 텍스트 → ISO 변환 (UTC 정확)", () => {
    expect(toIsoOrNull("2026-04-06 14:11:17.147+00")).toBe(
      "2026-04-06T14:11:17.147Z",
    );
  });
  it("PG timestamptz w/o ms → ISO 변환", () => {
    expect(toIsoOrNull("2026-04-06 14:11:17+00")).toBe(
      "2026-04-06T14:11:17.000Z",
    );
  });
});
