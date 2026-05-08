"use client";

/**
 * useUserBlocks — 본인 차단 목록 fetch + 해제 (M6).
 *
 * Backend:
 *   GET    /messenger/user-blocks
 *   POST   /messenger/user-blocks  (blockedId + reason?)
 *   DELETE /messenger/user-blocks/[id]
 */
import { useCallback, useEffect, useState } from "react";

const TENANT_SLUG = "default";

export interface UserBlockRow {
  id: string;
  blockerId: string;
  blockedId: string;
  reason: string | null;
  createdAt: string;
}

interface UseUserBlocksResult {
  blocks: UserBlockRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  block: (
    blockedId: string,
    reason?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  unblock: (blockId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useUserBlocks(): UseUserBlocksResult {
  const [blocks, setBlocks] = useState<UserBlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/t/${TENANT_SLUG}/messenger/user-blocks`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (!json?.success) {
          setError(json?.error?.message ?? "fetch 실패");
          setBlocks([]);
          return;
        }
        setBlocks(json.data?.blocks ?? []);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "네트워크 오류");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const block = useCallback(
    async (blockedId: string, reason?: string) => {
      try {
        const res = await fetch(
          `/api/v1/t/${TENANT_SLUG}/messenger/user-blocks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockedId, reason }),
          },
        );
        const json = await res.json();
        if (!res.ok || !json?.success) {
          return {
            ok: false,
            error: json?.error?.message ?? `차단 실패 (HTTP ${res.status})`,
          };
        }
        reload();
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "네트워크 오류",
        };
      }
    },
    [reload],
  );

  const unblock = useCallback(
    async (blockId: string) => {
      try {
        const res = await fetch(
          `/api/v1/t/${TENANT_SLUG}/messenger/user-blocks/${blockId}`,
          { method: "DELETE" },
        );
        const json = await res.json();
        if (!res.ok || !json?.success) {
          return {
            ok: false,
            error: json?.error?.message ?? `해제 실패 (HTTP ${res.status})`,
          };
        }
        reload();
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "네트워크 오류",
        };
      }
    },
    [reload],
  );

  return { blocks, loading, error, reload, block, unblock };
}
