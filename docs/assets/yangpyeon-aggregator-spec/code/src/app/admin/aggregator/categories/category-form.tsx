// src/app/admin/aggregator/categories/category-form.tsx
// 행 인라인 편집 + 신규 생성 폼. 클라이언트 컴포넌트.
//
// 스키마: ContentCategory.id String cuid, ContentCategory.name (한국어).

"use client";

import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCategory, updateCategory, deleteCategory } from "./actions";

export type Cat = {
  id: string;
  track: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  count: number;
};

export function CategoryRowForm({ track, cat }: { track: string; cat: Cat }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(form) => {
        startTransition(() => {
          void updateCategory(cat.id, form);
        });
      }}
      className="grid grid-cols-12 items-center gap-2 border-b border-zinc-900 py-2"
    >
      <input type="hidden" name="track" value={track} />
      <Input
        name="slug"
        defaultValue={cat.slug}
        className="col-span-2 border-zinc-700 bg-zinc-900 font-mono text-xs"
        aria-label="slug"
      />
      <Input
        name="name"
        defaultValue={cat.name}
        className="col-span-2 border-zinc-700 bg-zinc-900"
        aria-label="한국어 이름"
      />
      <Input
        name="nameEn"
        defaultValue={cat.nameEn ?? ""}
        className="col-span-2 border-zinc-700 bg-zinc-900"
        aria-label="영문 이름"
      />
      <Input
        name="description"
        defaultValue={cat.description ?? ""}
        className="col-span-3 border-zinc-700 bg-zinc-900"
        aria-label="설명"
      />
      <Input
        name="icon"
        defaultValue={cat.icon ?? ""}
        className="col-span-1 border-zinc-700 bg-zinc-900 text-center"
        aria-label="아이콘"
      />
      <Input
        name="sortOrder"
        type="number"
        defaultValue={cat.sortOrder}
        className="col-span-1 border-zinc-700 bg-zinc-900 text-center"
        aria-label="정렬"
      />
      <div className="col-span-1 flex items-center gap-1 text-xs text-zinc-400">
        <span title="이 카테고리에 묶인 콘텐츠 수">{cat.count}건</span>
        <Button type="submit" size="sm" variant="outline" disabled={pending}
          className="border-zinc-700 text-zinc-200">
          저장
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-rose-400"
          disabled={pending}
          onClick={() => {
            if (cat.count > 0) {
              if (!confirm(`이 카테고리에 ${cat.count}건의 콘텐츠가 있습니다. 그래도 삭제할까요?`)) return;
            } else if (!confirm("정말 삭제할까요?")) {
              return;
            }
            startTransition(() => {
              void deleteCategory(cat.id);
            });
          }}
        >
          삭제
        </Button>
      </div>
    </form>
  );
}

export function CategoryNewForm({ track }: { track: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(form) => {
        startTransition(async () => {
          await createCategory(form);
          (document.getElementById(`new-${track}`) as HTMLFormElement | null)?.reset();
        });
      }}
      id={`new-${track}`}
      className="grid grid-cols-12 items-center gap-2 border-t border-zinc-800 bg-zinc-900/40 py-2"
    >
      <input type="hidden" name="track" value={track} />
      <Input name="slug" placeholder="slug" required
        className="col-span-2 border-zinc-700 bg-zinc-950 font-mono text-xs" />
      <Input name="name" placeholder="한국어 이름" required
        className="col-span-2 border-zinc-700 bg-zinc-950" />
      <Input name="nameEn" placeholder="English name"
        className="col-span-2 border-zinc-700 bg-zinc-950" />
      <Input name="description" placeholder="설명"
        className="col-span-3 border-zinc-700 bg-zinc-950" />
      <Input name="icon" placeholder="🧠"
        className="col-span-1 border-zinc-700 bg-zinc-950 text-center" />
      <Input name="sortOrder" type="number" defaultValue={100}
        className="col-span-1 border-zinc-700 bg-zinc-950 text-center" />
      <div className="col-span-1">
        <Button type="submit" size="sm" disabled={pending}
          className="bg-emerald-600 hover:bg-emerald-500 w-full">
          {pending ? "추가 중" : "추가"}
        </Button>
      </div>
    </form>
  );
}
