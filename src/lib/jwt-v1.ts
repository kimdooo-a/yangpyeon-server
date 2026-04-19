import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/client";

const ACCESS_MAX_AGE = 15 * 60; // 15분

/**
 * Phase 15-D 이후: Refresh 는 DB-backed opaque 토큰 (src/lib/sessions/tokens.ts) 으로 이관.
 * 이 모듈은 이제 access token(HS256) 만 다룸.
 */

export const V1_REFRESH_COOKIE = "v1_refresh_token";

function getAccessSecret() {
  const secret = process.env.JWT_V1_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_V1_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 32자)");
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access";
}

export async function createAccessToken(payload: {
  userId: string;
  email: string;
  role: Role;
}): Promise<string> {
  return new SignJWT({
    sub: payload.userId,
    email: payload.email,
    role: payload.role,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_MAX_AGE}s`)
    .sign(getAccessSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAccessSecret());
    if (payload.type !== "access") return null;
    return payload as unknown as AccessTokenPayload;
  } catch {
    return null;
  }
}

export { ACCESS_MAX_AGE };
