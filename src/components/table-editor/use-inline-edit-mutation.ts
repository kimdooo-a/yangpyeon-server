"use client";

import { useCallback } from "react";
import { toast } from "sonner";

interface UseInlineEditMutationArgs {
  table: string;
  /** 복합 PK 경로 사용 시 지정 (pg_index.indkey 순). 비어있으면 단일 PK 경로 */
  compositePkColumns?: string[];
  onRowUpdated: (row: Record<string, unknown>) => void;
  onRowReplaced: (row: Record<string, unknown>) => void;
  onRowMissing: () => void;
}

interface CellEditArgs {
  /** 단일 PK일 때 PK 스칼라 값 */
  pkValue?: string;
  /** 복합 PK일 때 컬럼별 값 */
  pkValuesMap?: Record<string, unknown>;
  column: string;
  value: string | boolean;
  expectedUpdatedAt: string | null;
}

export function useInlineEditMutation({
  table,
  compositePkColumns,
  onRowUpdated,
  onRowReplaced,
  onRowMissing,
}: UseInlineEditMutationArgs) {
  const isComposite = (compositePkColumns?.length ?? 0) > 1;

  const submit = useCallback(
    async ({
      pkValue,
      pkValuesMap,
      column,
      value,
      expectedUpdatedAt,
    }: CellEditArgs): Promise<
      "ok" | "conflict-resolved" | "failed"
    > => {
      const url = isComposite
        ? `/api/v1/tables/${table}/composite`
        : `/api/v1/tables/${table}/${encodeURIComponent(pkValue ?? "")}`;

      const body: Record<string, unknown> = {
        values: { [column]: { action: "set", value } },
      };
      if (isComposite) body.pk_values = pkValuesMap ?? {};
      if (expectedUpdatedAt) body.expected_updated_at = expectedUpdatedAt;

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();

      if (res.ok && payload.success) {
        onRowUpdated(payload.data.row);
        return "ok";
      }

      if (res.status === 409 && payload.error?.code === "CONFLICT") {
        return await new Promise((resolve) => {
          toast.error("누군가 먼저 수정했습니다", {
            duration: 30000,
            description: `${table} 행이 다른 세션에서 변경됨`,
            action: {
              label: "덮어쓰기",
              onClick: async () => {
                const retryBody: Record<string, unknown> = {
                  values: { [column]: { action: "set", value } },
                  expected_updated_at: payload.error.current?.updated_at,
                };
                if (isComposite) retryBody.pk_values = pkValuesMap ?? {};
                const retry = await fetch(url, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(retryBody),
                });
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
    [table, isComposite, onRowUpdated, onRowReplaced, onRowMissing],
  );

  return { submit };
}
