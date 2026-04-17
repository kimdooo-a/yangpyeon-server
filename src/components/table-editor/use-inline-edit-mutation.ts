"use client";

import { useCallback } from "react";
import { toast } from "sonner";

interface UseInlineEditMutationArgs {
  table: string;
  onRowUpdated: (row: Record<string, unknown>) => void;
  /** 서버가 반환한 current row로 로컬을 덮어쓰고 싶을 때 사용 */
  onRowReplaced: (row: Record<string, unknown>) => void;
  /** 서버가 404 반환 시 그리드 재fetch 유도 */
  onRowMissing: () => void;
}

interface CellEditArgs {
  pkValue: string;
  column: string;
  value: string | boolean;
  expectedUpdatedAt: string | null;
}

export function useInlineEditMutation({
  table,
  onRowUpdated,
  onRowReplaced,
  onRowMissing,
}: UseInlineEditMutationArgs) {
  const submit = useCallback(
    async ({ pkValue, column, value, expectedUpdatedAt }: CellEditArgs): Promise<
      "ok" | "conflict-resolved" | "failed"
    > => {
      const body: Record<string, unknown> = {
        values: { [column]: { action: "set", value } },
      };
      if (expectedUpdatedAt) body.expected_updated_at = expectedUpdatedAt;

      const res = await fetch(
        `/api/v1/tables/${table}/${encodeURIComponent(pkValue)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json();

      if (res.ok && payload.success) {
        onRowUpdated(payload.data.row);
        return "ok";
      }

      if (res.status === 409 && payload.error?.code === "CONFLICT") {
        return await new Promise((resolve) => {
          toast.error("누군가 먼저 수정했습니다", {
            duration: 30000,
            description: `${table} 행 ${pkValue}이 다른 세션에서 변경됨`,
            action: {
              label: "덮어쓰기",
              onClick: async () => {
                const retryBody: Record<string, unknown> = {
                  values: { [column]: { action: "set", value } },
                  expected_updated_at: payload.error.current?.updated_at,
                };
                const retry = await fetch(
                  `/api/v1/tables/${table}/${encodeURIComponent(pkValue)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(retryBody),
                  },
                );
                const retryBodyJson = await retry.json();
                if (retry.ok && retryBodyJson.success) {
                  onRowUpdated(retryBodyJson.data.row);
                  toast.success("덮어쓰기 완료");
                  resolve("conflict-resolved");
                } else {
                  toast.error("덮어쓰기 실패");
                  resolve("failed");
                }
              },
            },
            cancel: {
              label: "취소",
              onClick: () => {
                if (payload.error.current) {
                  onRowReplaced(payload.error.current);
                }
                resolve("failed");
              },
            },
          });
        });
      }

      if (res.status === 404) {
        toast.error("행이 이미 삭제되었습니다");
        onRowMissing();
        return "failed";
      }

      const msg = payload.error?.message ?? "수정 실패";
      toast.error(msg);
      return "failed";
    },
    [table, onRowUpdated, onRowReplaced, onRowMissing],
  );

  return { submit };
}
