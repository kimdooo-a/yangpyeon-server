import { SignJWT, jwtVerify } from "jose";

const CHALLENGE_MAX_AGE = 5 * 60; // 5분
const CHALLENGE_PURPOSE = "mfa_challenge" as const;

export interface MfaChallengePayload {
  sub: string;
  purpose: typeof CHALLENGE_PURPOSE;
}

function getChallengeSecret(): Uint8Array {
  const secret = process.env.JWT_V1_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_V1_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다");
  }
  return new TextEncoder().encode(secret);
}

/**
 * 1차 인증(password) 성공 후, 2차 인증(TOTP/recovery)으로 넘기기 위한 5분 short-lived 토큰.
 * purpose: "mfa_challenge" 로 고정 — access/refresh 토큰과 혼용 방지.
 */
export async function issueMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ purpose: CHALLENGE_PURPOSE })
    .setSubject(userId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MAX_AGE}s`)
    .sign(getChallengeSecret());
}

export async function verifyMfaChallenge(token: string): Promise<MfaChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getChallengeSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== CHALLENGE_PURPOSE) return null;
    if (!payload.sub) return null;
    return { sub: payload.sub as string, purpose: CHALLENGE_PURPOSE };
  } catch {
    return null;
  }
}

export { CHALLENGE_MAX_AGE };
