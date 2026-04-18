import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";

/**
 * RP (Relying Party) 설정.
 * - rpID: 쿠키/CORS와 다른 브라우저-엄격 도메인. production 은 stylelucky4u.com, 로컬은 localhost.
 * - origin: https:// 포함 전체. production/localhost 분기.
 * WebAuthn rpID 는 완전 일치 (apex/sub/port까지). 환경별로 반드시 다름.
 */
function getRpConfig(): { rpName: string; rpID: string; origin: string } {
  const configuredId = process.env.WEBAUTHN_RP_ID;
  const configuredOrigin = process.env.WEBAUTHN_ORIGIN;
  if (configuredId && configuredOrigin) {
    return {
      rpName: process.env.WEBAUTHN_RP_NAME ?? "Yangpyeong Dashboard",
      rpID: configuredId,
      origin: configuredOrigin,
    };
  }
  if (process.env.NODE_ENV === "production") {
    return {
      rpName: "Yangpyeong Dashboard",
      rpID: "stylelucky4u.com",
      origin: "https://stylelucky4u.com",
    };
  }
  return {
    rpName: "Yangpyeong Dashboard (local)",
    rpID: "localhost",
    origin: "http://localhost:3000",
  };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5분

export interface RegistrationOptionsResult {
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
  challengeRecordId: string;
}

export async function createRegistrationOptions(
  userId: string,
  userEmail: string,
): Promise<RegistrationOptionsResult> {
  const { rpName, rpID } = getRpConfig();

  const existing = await prisma.webAuthnAuthenticator.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: userEmail,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
  });

  const record = await prisma.webAuthnChallenge.create({
    data: {
      userId,
      challenge: options.challenge,
      purpose: "registration",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });

  return { options, challengeRecordId: record.id };
}

export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<VerifiedRegistrationResponse> {
  const { rpID, origin } = getRpConfig();
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
}

export async function persistAuthenticator(
  userId: string,
  verified: VerifiedRegistrationResponse,
  responseTransports: AuthenticatorTransportFuture[],
  friendlyName: string | null,
): Promise<void> {
  const info = verified.registrationInfo;
  if (!info) throw new Error("registrationInfo 가 반환되지 않았습니다");

  await prisma.webAuthnAuthenticator.create({
    data: {
      userId,
      credentialId: info.credentialID,
      publicKey: Buffer.from(info.credentialPublicKey),
      counter: BigInt(info.counter),
      transports: responseTransports,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      friendlyName,
    },
  });
}

export async function createAuthenticationOptions(userId: string | null) {
  const { rpID } = getRpConfig();
  const allow = userId
    ? await prisma.webAuthnAuthenticator.findMany({
        where: { userId },
        select: { credentialId: true, transports: true },
      })
    : [];
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: allow.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
  });

  await prisma.webAuthnChallenge.create({
    data: {
      userId,
      challenge: options.challenge,
      purpose: "authentication",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
  return options;
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
): Promise<{ verified: VerifiedAuthenticationResponse; userId: string }> {
  const { rpID, origin } = getRpConfig();
  const auth = await prisma.webAuthnAuthenticator.findUnique({
    where: { credentialId: response.id },
  });
  if (!auth) throw new Error("등록되지 않은 credential 입니다");

  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: auth.credentialId,
      credentialPublicKey: new Uint8Array(auth.publicKey),
      counter: Number(auth.counter),
      transports: auth.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  });

  if (verified.verified) {
    await prisma.webAuthnAuthenticator.update({
      where: { id: auth.id },
      data: {
        counter: BigInt(verified.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
  }
  return { verified, userId: auth.userId };
}

/**
 * 챌린지 소비 — 검증 성공 시 즉시 삭제 (OTP-like single-use). 만료된 건 조회 단계에서 제거.
 */
export async function consumeChallenge(
  challenge: string,
  purpose: "registration" | "authentication",
): Promise<{ userId: string | null } | null> {
  const rec = await prisma.webAuthnChallenge.findUnique({ where: { challenge } });
  if (!rec) return null;
  if (rec.purpose !== purpose) return null;
  if (rec.expiresAt <= new Date()) {
    await prisma.webAuthnChallenge.delete({ where: { id: rec.id } });
    return null;
  }
  await prisma.webAuthnChallenge.delete({ where: { id: rec.id } });
  return { userId: rec.userId };
}

export async function cleanupExpiredChallenges(): Promise<{ removed: number }> {
  const res = await prisma.webAuthnChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return { removed: res.count };
}
