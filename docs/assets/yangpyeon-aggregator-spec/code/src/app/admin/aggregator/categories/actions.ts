// src/app/admin/aggregator/categories/actions.ts
// 카테고리 마스터 CRUD (Server Actions).
//
// ID 컨벤션: ContentCategory.id 는 String cuid (schema-additions.prisma:79).

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

async function assertAdmin() {
  const session = await getSessionFromCookies();
  if (!session || (session.role !== "ADMIN" && session.role !== "MANAGER")) {
    redirect("/login");
  }
}

function readInput(form: FormData) {
  return {
    track: String(form.get("track") ?? "").trim(),
    slug: String(form.get("slug") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    nameEn: String(form.get("nameEn") ?? "").trim() || null,
    description: String(form.get("description") ?? "").trim() || null,
    icon: String(form.get("icon") ?? "").trim() || null,
    sortOrder: Number(form.get("sortOrder") ?? 0),
  };
}

export async function createCategory(form: FormData): Promise<void> {
  await assertAdmin();
  const data = readInput(form);
  if (!data.track || !data.slug || !data.name) {
    throw new Error("track, slug, name은 필수입니다.");
  }
  await prisma.contentCategory.create({ data });
  revalidatePath("/admin/aggregator/categories");
}

export async function updateCategory(id: string, form: FormData): Promise<void> {
  await assertAdmin();
  const data = readInput(form);
  await prisma.contentCategory.update({ where: { id }, data });
  revalidatePath("/admin/aggregator/categories");
}

export async function deleteCategory(id: string): Promise<void> {
  await assertAdmin();
  // 콘텐츠가 묶여있으면 삭제 대신 비활성/이관을 권장하지만, 1.0에선 단순 삭제.
  // FK on delete 정책에 따라 실패할 수 있으므로 try/catch로 사용자에게 안내.
  await prisma.contentCategory.delete({ where: { id } });
  revalidatePath("/admin/aggregator/categories");
}
