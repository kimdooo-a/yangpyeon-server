// @vitest-environment jsdom
/**
 * INFRA-2 Task #2 — useConversations SWR 마이그레이션 TDD.
 *
 * 검증 범위:
 *   1. fetch 성공 → conversations + loading=false + error=null
 *   2. fetch 5xx → error 비어있지 않음
 *   3. reload() → 캐시 무효화 후 재 fetch (server.use 갱신값 반영)
 *
 * 시그니처 보존: 기존 호출자(ConversationList.tsx 등) page.tsx 변경 0.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { server } from "@/test/msw/server";
import { useConversations, type ConversationRow } from "./useConversations";

const sampleRow: ConversationRow = {
  id: "conv-1",
  kind: "DIRECT",
  title: null,
  lastMessageAt: null,
  archivedAt: null,
  members: [],
};

const TENANT_PATH = "/api/v1/t/default/messenger/conversations";

// SWR provider — 각 테스트마다 fresh cache 로 격리.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      {children}
    </SWRConfig>
  );
}

describe("useConversations (SWR)", () => {
  beforeEach(() => {
    server.use(
      http.get(TENANT_PATH, () =>
        HttpResponse.json({
          success: true,
          data: { conversations: [sampleRow] },
        }),
      ),
    );
  });

  it("loads conversations on mount", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations).toEqual([sampleRow]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces server error message", async () => {
    server.use(
      http.get(TENANT_PATH, () =>
        HttpResponse.json(
          { success: false, error: { message: "권한 없음" } },
          { status: 403 },
        ),
      ),
    );

    const { result } = renderHook(() => useConversations(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("권한 없음");
    expect(result.current.conversations).toEqual([]);
  });

  it("dedupes parallel hook instances via SWR cache", async () => {
    let fetchCount = 0;
    server.use(
      http.get(TENANT_PATH, () => {
        fetchCount++;
        return HttpResponse.json({
          success: true,
          data: { conversations: [sampleRow] },
        });
      }),
    );

    renderHook(
      () => {
        useConversations();
        useConversations();
        useConversations();
      },
      { wrapper },
    );

    // 첫 fetch 발화 후 SWR dedup 으로 추가 fetch 0.
    await waitFor(() => expect(fetchCount).toBeGreaterThanOrEqual(1));
    // 추가 fetch 가 없음을 한 틱 기다려 확정.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCount).toBe(1);
  });

  it("reload() refetches with latest server response", async () => {
    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toEqual([sampleRow]);

    const updated: ConversationRow = { ...sampleRow, title: "갱신됨" };
    server.use(
      http.get(TENANT_PATH, () =>
        HttpResponse.json({
          success: true,
          data: { conversations: [updated] },
        }),
      ),
    );

    await act(async () => {
      result.current.reload();
    });

    await waitFor(() =>
      expect(result.current.conversations).toEqual([updated]),
    );
  });
});
