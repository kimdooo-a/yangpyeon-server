import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "dashboard_session";
const MAX_AGE = 60 * 60 * 24; // 24시간

/** 대시보드 세션 JWT 페이로드 */
export interface DashboardSessionPayload {
  sub: string;
  email: string;
  role: string;
  authenticated: true; // 하위호환
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다");
  }
  return new TextEncoder().encode(secret);
}

/**
 * 대시보드 세션 JWT 생성
 * @param payload - sub, email, role 포함
 */
export async function createSession(payload: {
  sub: string;
  email: string;
  role: string;
}): Promise<string> {
  const token = await new SignJWT({ ...payload, authenticated: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  return token;
}

/**
 * 대시보드 세션 JWT 검증 및 페이로드 반환
 * 레거시 토큰(role 없음)은 role="ADMIN"으로 간주 (30일 전환 기간)
 */
export async function verifySession(
  token: string,
): Promise<DashboardSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());

    // 레거시 쿠키 하위호환: role 없으면 ADMIN으로 간주
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
