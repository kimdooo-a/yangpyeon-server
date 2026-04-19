import { SignJWT, jwtVerify, decodeProtectedHeader } from "jose";
import { cookies } from "next/headers";
import { getSigningKey, getPublicKeyByKid, JWKS_ALG } from "@/lib/jwks/store";

const COOKIE_NAME = "dashboard_session";
const MAX_AGE = 60 * 60 * 24; // 24시간

/** 대시보드 세션 JWT 페이로드 */
export interface DashboardSessionPayload {
  sub: string;
  email: string;
  role: string;
  authenticated: true; // 하위호환
}

/**
 * 대시보드 세션 JWT 생성 — ES256 비대칭 서명.
 * 참조: docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md §7.2.1
 * SP-014 Go 판정: kid 헤더 기반 JWKS 검증, 회전 시 endpoint-side grace 운용.
 */
export async function createSession(payload: {
  sub: string;
  email: string;
  role: string;
}): Promise<string> {
  const signing = await getSigningKey();
  const token = await new SignJWT({ ...payload, authenticated: true })
    .setProtectedHeader({ alg: JWKS_ALG, kid: signing.kid })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(signing.key);
  return token;
}

/**
 * 대시보드 세션 JWT 검증 — ES256 only (JWKS 기반).
 *
 * 세션 45 이전: kid 없는 토큰은 AUTH_SECRET 기반 HS256 legacy fallback 으로 검증했음.
 * 세션 45 에서 HS256 fallback 제거 (세션 33 JWKS 도입 후 24h+ 경과 → 레거시 쿠키 자연 만료).
 * 이제 kid 없는 토큰은 즉시 null 반환 → 재로그인 유도.
 */
export async function verifySession(
  token: string,
): Promise<DashboardSessionPayload | null> {
  try {
    const header = decodeProtectedHeader(token);
    if (!header.kid) return null;

    const publicKey = await getPublicKeyByKid(header.kid);
    if (!publicKey) return null;
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [JWKS_ALG],
    });
    return {
      sub: (payload.sub as string) ?? "legacy",
      email: (payload.email as string) ?? "admin",
      role: (payload.role as string) ?? "ADMIN",
      authenticated: true,
    };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<DashboardSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function verifyPassword(input: string): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;

  // 타이밍 공격 방지: 고정 시간 비교
  if (input.length !== password.length) return false;
  let result = 0;
  for (let i = 0; i < input.length; i++) {
    result |= input.charCodeAt(i) ^ password.charCodeAt(i);
  }
  return result === 0;
}

export { COOKIE_NAME, MAX_AGE };
