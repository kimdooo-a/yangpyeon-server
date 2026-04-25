// src/app/admin/aggregator/items/actions.ts
// 큐레이션 액션: 승격(promote), 수동 검토 표시, 차단, 거부, 재분류.
//
// ID 컨벤션: ContentIngestedItem.id 는 String cuid (schema-additions.prisma:131)
//   → 모든 액션은 string id 시그니처.
// 세션: yangpyeon `getSessionFromCookies()` → DashboardSessionPayload { sub, email, role, authenticated }
//   → reviewedById = session.sub.

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
  return session;
}

function paths() {
  revalidatePath("/admin/aggregator/items");
  revalidatePath("/admin/aggregator/dashboard");
}

/** ready로 강제 승격 + auto_ok 플래그. promote 잡이 다음 tick에 ContentItem으로 넘긴다. */
export async function promoteItem(id: string): Promise<void> {
  const session = await assertAdmin();
  await prisma.contentIngestedItem.update({
    where: { id },
    data: {
      status: "ready",
      qualityFlag: "auto_ok",
      reviewedById: session.sub,
      reviewedAt: new Date(),
    },
  });
  paths();
}

export async function markManualReview(id: string, note?: string): Promise<void> {
  const session = await assertAdmin();
  await prisma.contentIngestedItem.update({
    where: { id },
    data: {
      qualityFlag: "manual_review",
      reviewedById: session.sub,
      reviewedAt: new Date(),
      reviewNote: note?.slice(0, 500) ?? null,
    },
  });
  paths();
}

/** 차단 — status 는 rejected, qualityFlag는 blocked. promote 잡이 픽업하지 않는다. */
export async function blockItem(id: string, reason?: string): Promise<void> {
  const session = await assertAdmin();
  await prisma.contentIngestedItem.update({
    where: { id },
    data: {
      status: "rejected",
      qualityFlag: "blocked",
      reviewedById: session.sub,
      reviewedAt: new Date(),
      reviewNote: reason?.slice(0, 500) ?? null,
    },
  });
  paths();
}

export async function rejectItem(id: string): Promise<void> {
  const session = await assertAdmin();
  await prisma.contentIngestedItem.update({
    where: { id },
    data: {
      status: "rejected",
      reviewedById: session.sub,
      reviewedAt: new Date(),
    },
  });
  paths();
}

export async function reclassifyItem(id: string): Promise<void> {
  await assertAdmin();
  // 분류 워커가 다시 픽업하도록 status를 pending으로 되돌리고 분류 결과를 비운다.
  await prisma.contentIngestedItem.update({
    where: { id },
    data: {
      status: "pending",
      suggestedTrack: null,
      suggestedCategorySlug: null,
      processedAt: null,
    },
  });
  paths();
}
