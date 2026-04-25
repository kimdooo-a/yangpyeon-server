// src/app/admin/aggregator/items/item-row-actions.tsx
// 클라이언트: 큐레이션 행의 승격/검토/차단/거부 버튼.
//
// id: ContentIngestedItem.id 는 String cuid.
// url: ContentIngestedItem.url (외부 캐노니컬 URL).

"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  promoteItem,
  markManualReview,
  blockItem,
  rejectItem,
  reclassifyItem,
} from "./actions";

type Props = {
  id: string;
  url: string;
  tab: "pending" | "manual" | "blocked";
};

export function ItemRowActions({ id, url, tab }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tab === "pending" ? (
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-500"
          disabled={pending}
          onClick={() => startTransition(() => void promoteItem(id))}
        >
          승격
        </Button>
      ) : null}

      {tab === "manual" ? (
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-500"
          disabled={pending}
          onClick={() => startTransition(() => void promoteItem(id))}
        >
          승인
        </Button>
      ) : null}

      {tab !== "manual" ? (
        <Button
          size="sm"
          variant="outline"
          className="border-amber-700 text-amber-300"
          disabled={pending}
          onClick={() => {
            const note = prompt("수동 검토 메모(옵션):") ?? undefined;
            startTransition(() => void markManualReview(id, note));
          }}
        >
          수동 검토
        </Button>
      ) : null}

      {tab !== "blocked" ? (
        <Button
          size="sm"
          variant="outline"
          className="border-rose-800 text-rose-300"
          disabled={pending}
          onClick={() => {
            const reason = prompt("차단 사유(공개되지 않음):") ?? undefined;
            startTransition(() => void blockItem(id, reason));
          }}
        >
          차단
        </Button>
      ) : null}

      {tab === "pending" ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-zinc-400"
          disabled={pending}
          onClick={() => startTransition(() => void reclassifyItem(id))}
        >
          다시 분류
        </Button>
      ) : null}

      {tab === "pending" ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-rose-400"
          disabled={pending}
          onClick={() => {
            if (!confirm("거부하시겠습니까? 이 항목은 다시 노출되지 않습니다.")) return;
            startTransition(() => void rejectItem(id));
          }}
        >
          거부
        </Button>
      ) : null}

      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
      >
        외부 링크 ↗
      </a>
    </div>
  );
}
