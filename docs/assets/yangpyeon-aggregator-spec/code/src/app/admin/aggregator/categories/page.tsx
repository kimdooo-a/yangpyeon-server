// src/app/admin/aggregator/categories/page.tsx
// 트랙별 카테고리 마스터 편집. 6개 트랙은 Tabs로 분리.

import { prisma } from "@/lib/prisma";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryRowForm, CategoryNewForm, type Cat } from "./category-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TRACKS = [
  { id: "hustle", label: "Hustle" },
  { id: "work", label: "Work" },
  { id: "build", label: "Build" },
  { id: "invest", label: "Invest" },
  { id: "learn", label: "Learn" },
  { id: "community", label: "Community" },
];

async function getData(): Promise<Cat[]> {
  const cats = await prisma.contentCategory.findMany({
    orderBy: [{ track: "asc" }, { sortOrder: "asc" }, { slug: "asc" }],
  });

  // 카테고리별 staging 아이템 수 — staging은 suggestedCategorySlug로 분류 추천이 들어감.
  // 게시(published)된 콘텐츠 수 카운트를 원하면 ContentItem.categoryId 기준으로 별도 groupBy.
  const counts = await prisma.contentIngestedItem.groupBy({
    by: ["suggestedCategorySlug"],
    _count: { _all: true },
  });
  const countBySlug = new Map<string, number>();
  for (const c of counts) {
    if (c.suggestedCategorySlug != null) {
      countBySlug.set(c.suggestedCategorySlug, c._count._all);
    }
  }

  return cats.map((c) => ({
    id: c.id,
    track: c.track,
    slug: c.slug,
    name: c.name,
    nameEn: c.nameEn,
    description: c.description,
    icon: c.icon,
    sortOrder: c.sortOrder,
    count: countBySlug.get(c.slug) ?? 0,
  }));
}

export default async function CategoriesPage() {
  const all = await getData();
  const byTrack = new Map<string, Cat[]>();
  for (const t of TRACKS) byTrack.set(t.id, []);
  for (const c of all) {
    if (!byTrack.has(c.track)) byTrack.set(c.track, []);
    byTrack.get(c.track)!.push(c);
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-zinc-100">카테고리 마스터</CardTitle>
        <CardDescription className="text-zinc-400">
          트랙별로 분리합니다. 콘텐츠 수가 많은 카테고리를 삭제하면 게시 페이지에 영향이 갑니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={TRACKS[0].id}>
          <TabsList className="border border-zinc-800 bg-zinc-900">
            {TRACKS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
              >
                {t.label}
                <span className="ml-2 text-xs text-zinc-500">
                  ({byTrack.get(t.id)?.length ?? 0})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {TRACKS.map((t) => {
            const cats = byTrack.get(t.id) ?? [];
            return (
              <TabsContent key={t.id} value={t.id} className="mt-4">
                <div className="grid grid-cols-12 gap-2 border-b border-zinc-800 pb-2 text-xs uppercase tracking-wider text-zinc-500">
                  <div className="col-span-2">slug</div>
                  <div className="col-span-2">한국어</div>
                  <div className="col-span-2">English</div>
                  <div className="col-span-3">설명</div>
                  <div className="col-span-1 text-center">아이콘</div>
                  <div className="col-span-1 text-center">정렬</div>
                  <div className="col-span-1 text-right">액션</div>
                </div>
                {cats.length === 0 ? (
                  <p className="py-4 text-center text-sm text-zinc-500">
                    {t.label} 트랙에 등록된 카테고리가 없습니다.
                  </p>
                ) : (
                  cats.map((c) => <CategoryRowForm key={c.id} track={t.id} cat={c} />)
                )}
                <CategoryNewForm track={t.id} />
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
