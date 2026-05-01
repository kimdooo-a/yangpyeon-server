import { NextRequest } from "next/server";
import { z } from "zod";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { issueApiKey } from "@/lib/auth/keys";
import { writeAuditLog } from "@/lib/audit-log";
import { fetchDateFieldsText, toIsoOrNull } from "@/lib/date-fields";

/** API 키 관리 — operator console, 기본 테넌트(default) UUID */
// 2026-05-01: ALS propagation 깨짐 회피 — tenantPrismaFor 직접 closure 캡처 사용.
const DEFAULT_TENANT_UUID = "00000000-0000-0000-0000-000000000000";
const OPS_CTX = { tenantId: DEFAULT_TENANT_UUID, bypassRls: true } as const;

const API_KEY_DATE_FIELDS = [
  "created_at",
  "updated_at",
  "last_used_at",
  "revoked_at",
] as const;

async function attachApiKeyDates<T extends { id: string }>(rows: T[]) {
  // 세션 44: Prisma 7 parsing-side +9h 시프트 회피 (CK orm-date-filter-audit-sweep)
  const dateMap = await fetchDateFieldsText(
    "api_keys",
    rows.map((r) => r.id),
    API_KEY_DATE_FIELDS,
  );
  return rows.map((r) => {
    const d = dateMap.get(r.id);
    return {
      ...r,
      createdAt: toIsoOrNull(d?.created_at),
      updatedAt: toIsoOrNull(d?.updated_at),
      lastUsedAt: toIsoOrNull(d?.last_used_at),
      revokedAt: toIsoOrNull(d?.revoked_at),
    };
  });
}

const ALLOWED_SCOPES = ["read", "write", "admin"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["PUBLISHABLE", "SECRET"]),
  scopes: z.array(z.enum(ALLOWED_SCOPES)).min(1),
});

export const GET = withRole(["ADMIN"], async () => {
  const keys = await tenantPrismaFor(OPS_CTX).apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      type: true,
      scopes: true,
      ownerId: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return successResponse(await attachApiKeyDates(keys));
});

export const POST = withRole(["ADMIN"], async (request: NextRequest, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식입니다", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
      400
    );
  }

  try {
    const result = await issueApiKey({
      name: parsed.data.name,
      type: parsed.data.type,
      scopes: parsed.data.scopes,
      ownerId: user.sub,
    });

    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: "POST",
      path: "/api/v1/api-keys",
      ip: request.headers.get("x-forwarded-for") ?? "unknown",
      action: "API_KEY_ISSUE",
      detail: `${user.email} -> ${result.apiKey.name} (${result.apiKey.type}, scopes=${parsed.data.scopes.join(",")})`,
    });

    // 평문 키를 1회만 반환 (이후 조회 불가)
    const [apiKeyWithDates] = await attachApiKeyDates([result.apiKey]);
    return successResponse(
      {
        apiKey: apiKeyWithDates,
        plaintext: result.issued.plaintext,
        prefix: result.issued.prefix,
      },
      201
    );
  } catch (err) {
    return errorResponse(
      "ISSUE_FAILED",
      err instanceof Error ? err.message : "발급 실패",
      500
    );
  }
});
