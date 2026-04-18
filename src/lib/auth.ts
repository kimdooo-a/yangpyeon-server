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
 * HS256 legacy secret (기 발급 쿠키 검증용).
 * SP-014 이후 신 토큰은 ES256로 서명하지만, 기 발급된 HS256 쿠키의 자연 만료(24h)까지 허용.
 * AUTH_SECRET 미설정 시 legacy 검증은 스킵 (신 배포 이후 재로그인 강제).
 */
function getLegacySecret(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return new TextEncoder().encode(secret);
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
 * 대시보드 세션 JWT 검증 — ES256 우선, HS256 legacy fallback.
 *
 * 분기 규칙:
 *   - 토큰 헤더에 `kid` 존재 → ES256, DB에서 공개키 조회 후 검증.
 *   - `kid` 없음 → 레거시 HS256, AUTH_SECRET으로 검증 (설정된 경우만).
 *
 * 레거시 토큰(role 없음)은 role="ADMIN"으로 간주 (30일 전환 기간, 세션 14 규칙 유지).
 */
export async function verifySession(
  token: string,
): Promise<DashboardSessionPayload | null> {
  try {
    const header = decodeProtectedHeader(token);

    if (header.kid) {
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
    }

    const legacy = getLegacySecret();
    if (!legacy) return null;
    const { payload } = await jwtVerify(token, legacy, {
      algorithms: ["HS256"],
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
