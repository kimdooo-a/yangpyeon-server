/**
 * yangpyeon-server: PUBLISHABLE API 키 가드 (`x-api-key` 헤더 기반)
 *
 * 기존 `src/lib/api-guard.ts`의 `withAuth`/`withRole` 옆에 두는 신규 가드.
 * - 외부(Almanac 등) 클라이언트가 호출하는 PUBLISHABLE 키 전용 라우트에 적용한다.
 * - 헤더가 없으면 `allowAnonymous` 옵션이 true일 때만 익명 호출을 허용한다.
 *   (익명/인증 분기 후의 rate limit은 caller가 IP/키 단위로 별도 처리한다.)
 *
 * yangpyeon `model ApiKey`(prisma/schema.prisma)는 만료 컬럼 `expiresAt`이 없다.
 *   → revoke(`revokedAt != null`) 만 키 무효화 신호로 사용한다.
 *   → 만료 정책이 필요하면 ApiKey 모델에 expiresAt 추가 + 본 가드 분기 보강 필요.
 */

import { NextRequest } from "next/server";
import crypto from "crypto";
import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

/** PUBLISHABLE: 외부 노출 키, SECRET: 서버-서버 신뢰 키 */
export type ApiKeyType = "PUBLISHABLE" | "SECRET";

/** 핸들러로 전달되는 API 키 컨텍스트 (익명 호출이면 null) */
export interface ApiKeyContext {
  id: string;
  name: string;
  type: ApiKeyType;
  /** 추후 fine-grained 권한 확장용 — 현재는 빈 배열 */
  scopes: string[];
}

/**
 * 핸들러 시그니처. Next.js 16 App Router의 dynamic route segment를 위해
 * `context.params`는 Promise로 받는다.
 */
export type ApiKeyHandler = (
  request: NextRequest,
  apiKey: ApiKeyContext | null,
  context?: { params: Promise<Record<string, string>> }
) => Promise<Response>;

/**
 * `x-api-key` 헤더로 PUBLISHABLE 키를 검증한다.
 *
 * - 키 검증: SHA-256 해시 비교 (yangpyeon `api_keys.key_hash` 컬럼).
 * - revoke(`revokedAt != null`)된 키는 차단.
 * - `allowedTypes`에 포함되지 않은 키 타입은 403.
 * - 헤더가 없으면 기본은 401, `options.allowAnonymous=true`일 때만 익명 통과.
 *
 * @param allowedTypes 허용할 키 타입 화이트리스트 (Almanac은 ["PUBLISHABLE"])
 * @param handler      라우트 핸들러
 * @param options.allowAnonymous true이면 헤더 없을 때 apiKey=null로 통과
 */
export function withApiKey(
  allowedTypes: ApiKeyType[],
  handler: ApiKeyHandler,
  options?: { allowAnonymous?: boolean }
) {
  return async (
    request: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    const headerKey = request.headers.get("x-api-key");
    let apiKey: ApiKeyContext | null = null;

    if (headerKey) {
      // 키 자체는 절대 저장하지 않고 SHA-256 해시만 비교한다.
      const hash = crypto.createHash("sha256").update(headerKey).digest("hex");

      const row = await prisma.apiKey.findFirst({
        where: { keyHash: hash, revokedAt: null },
      });

      if (!row) {
        return errorResponse(
          "INVALID_API_KEY",
          "유효하지 않은 API 키입니다",
          401
        );
      }
      if (!allowedTypes.includes(row.type as ApiKeyType)) {
        return errorResponse(
          "FORBIDDEN_KEY_TYPE",
          "허용되지 않은 키 타입입니다",
          403
        );
      }

      apiKey = {
        id: row.id,
        name: row.name,
        type: row.type as ApiKeyType,
        scopes: [], // 추후 확장
      };
    } else if (options?.allowAnonymous !== true) {
      return errorResponse(
        "UNAUTHORIZED",
        "API 키가 필요합니다 (x-api-key 헤더)",
        401
      );
    }

    return handler(request, apiKey, context);
  };
}
