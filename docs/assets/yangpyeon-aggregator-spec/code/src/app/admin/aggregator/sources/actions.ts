// src/app/admin/aggregator/sources/actions.ts
// 소스 CRUD를 위한 Server Actions.
//
// ID 컨벤션: ContentSource.id 는 Int autoincrement (schema-additions.prisma:101).
//   form 입력은 string이므로 Number() 변환 필수.
// kind enum: 대문자 RSS|HTML|API|FIRECRAWL (schema-additions.prisma:40).

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, ContentSourceKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

const KIND_VALUES = ["RSS", "HTML", "API", "FIRECRAWL"] as const;

type SourceInput = {
  slug: string;
  name: string;
  url: string;
  kind: ContentSourceKind;
  defaultTrack: string | null;
  country: string | null;
  parserConfig: Prisma.InputJsonValue;
  active: boolean;
};

async function assertAdmin() {
  const session = await getSessionFromCookies();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }
  return session;
}

function parseJson(raw: string | null | undefined): Prisma.InputJsonValue {
  if (!raw || raw.trim() === "") return {};
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch (e) {
    throw new Error("parserConfig JSON 파싱 실패: " + (e as Error).message);
  }
}

function parseKind(raw: unknown): ContentSourceKind {
  const upper = String(raw ?? "").toUpperCase();
  if ((KIND_VALUES as readonly string[]).includes(upper)) return upper as ContentSourceKind;
  throw new Error(`알 수 없는 kind: ${raw} — 허용값: ${KIND_VALUES.join("|")}`);
}

function readInput(form: FormData): SourceInput {
  return {
    slug: String(form.get("slug") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    url: String(form.get("url") ?? "").trim(),
    kind: parseKind(form.get("kind")),
    defaultTrack: (form.get("defaultTrack") as string | null) || null,
    country: (form.get("country") as string | null) || null,
    parserConfig: parseJson(form.get("parserConfig") as string | null),
    active: form.get("active") === "on",
  };
}

export async function createSource(form: FormData): Promise<void> {
  await assertAdmin();
  const data = readInput(form);
  if (!data.slug || !data.name || !data.url) {
    throw new Error("slug, name, url은 필수입니다.");
  }
  await prisma.contentSource.create({ data });
  revalidatePath("/admin/aggregator/sources");
  revalidatePath("/admin/aggregator/dashboard");
}

export async function updateSource(id: number, form: FormData): Promise<void> {
  await assertAdmin();
  const data = readInput(form);
  await prisma.contentSource.update({ where: { id }, data });
  revalidatePath("/admin/aggregator/sources");
  revalidatePath("/admin/aggregator/dashboard");
}

export async function toggleSource(id: number, active: boolean): Promise<void> {
  await assertAdmin();
  await prisma.contentSource.update({ where: { id }, data: { active } });
  revalidatePath("/admin/aggregator/sources");
  revalidatePath("/admin/aggregator/dashboard");
}

export async function deleteSource(id: number): Promise<void> {
  await assertAdmin();
  await prisma.contentSource.delete({ where: { id } });
  revalidatePath("/admin/aggregator/sources");
  revalidatePath("/admin/aggregator/dashboard");
}

/**
 * "지금 fetch" 버튼: 단일 소스 강제 수집 트리거.
 * TODO: 별도 라우트 필요 — POST /api/v1/admin/aggregator/sources/[id]/fetch
 *       내부에서 fetcher 워커 큐에 즉시 잡을 enqueue 하는 형태가 권장.
 *       임시로 이 액션은 lastError만 비우고 페이지를 재검증한다.
 */
export async function triggerFetchNow(id: number): Promise<void> {
  await assertAdmin();
  // 다음 cron tick에 우선 처리되도록 lastFetchedAt을 NULL로 리셋.
  await prisma.contentSource.update({
    where: { id },
    data: { lastFetchedAt: null, lastError: null },
  });
  revalidatePath("/admin/aggregator/sources");
}
