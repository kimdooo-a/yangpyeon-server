// src/app/admin/aggregator/sources/source-row-actions.tsx
// 클라이언트 인터랙션: 소스 행의 active 토글, "지금 fetch", 삭제.

"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  toggleSource,
  triggerFetchNow,
  deleteSource,
} from "./actions";

type Props = {
  id: number;
  active: boolean;
};

export function SourceRowActions({ id, active }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={pending}
        onCheckedChange={(next: boolean) => {
          startTransition(() => {
            void toggleSource(id, next);
          });
        }}
        aria-label="소스 활성 토글"
      />
      <Button
        size="sm"
        variant="outline"
        className="border-zinc-700 text-zinc-200"
        disabled={pending}
        onClick={() => {
          startTransition(() => {
            void triggerFetchNow(id);
          });
        }}
      >
        지금 fetch
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-rose-400 hover:bg-rose-900/20"
        disabled={pending}
        onClick={() => {
          if (!confirm("정말 이 소스를 삭제할까요? 수집 이력은 유지되지만 새 수집은 중단됩니다.")) return;
          startTransition(() => {
            void deleteSource(id);
          });
        }}
      >
        삭제
      </Button>
    </div>
  );
}
