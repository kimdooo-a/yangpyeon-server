import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma";

const ACCESS_MAX_AGE = 15 * 60; // 15분
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7일

export const V1_REFRESH_COOKIE = "v1_refresh_token";

function getAccessSecret() {
  const secret = process.env.JWT_V1_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_V1_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 32자)");
  }
  return new TextEncoder().encode(secret);
}

function getRefreshSecret() {
  const secret = process.env.JWT_V1_REFRESH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_V1_REFRESH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 32자)");
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
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

export async function createRefreshToken(userId: string): Promise<string> {
  return new SignJWT({
    sub: userId,
    type: "refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_MAX_AGE}s`)
    .sign(getRefreshSecret());
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

export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getRefreshSecret());
    if (payload.type !== "refresh") return null;
    return payload as unknown as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export { ACCESS_MAX_AGE, REFRESH_MAX_AGE };
