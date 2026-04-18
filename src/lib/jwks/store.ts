import { importJWK, type JWK } from "jose";
import { prisma } from "@/lib/prisma";
import { generateJwksKey, JWKS_ALG } from "./generate";

/**
 * jose v6은 KeyLike 대신 CryptoKey(+Uint8Array for HMAC)를 반환.
 * ES256 경로는 항상 CryptoKey지만, importJWK 시그니처는 union이라 최소 제약으로 수용.
 */
type JwksCryptoKey = CryptoKey;

/**
 * 현재 서명용 키 (status=CURRENT 중 가장 최근 생성). 없으면 자동 시드.
 * SP-014 §4: 서명은 항상 CURRENT 1개 사용, RETIRED는 검증(JWKS 노출)에만.
 */
export interface SigningKey {
  kid: string;
  alg: string;
  key: JwksCryptoKey;
}

export async function getSigningKey(): Promise<SigningKey> {
  let record = await prisma.jwksKey.findFirst({
    where: { status: "CURRENT" },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    const generated = await generateJwksKey();
    record = await prisma.jwksKey.create({
      data: {
        kid: generated.kid,
        alg: generated.alg,
        publicJwk: generated.publicJwk as unknown as object,
        privateJwk: generated.privateJwk as unknown as object,
        status: "CURRENT",
      },
    });
  }

  const privateJwk = record.privateJwk as unknown as JWK;
  const key = (await importJWK(privateJwk, record.alg)) as JwksCryptoKey;
  return { kid: record.kid, alg: record.alg, key };
}

/**
 * JWKS endpoint에서 반환할 공개 키 집합.
 * CURRENT 전부 + RETIRED 중 retireAt > NOW() 만 — grace 기간 동안 구 키 공존.
 */
export async function getActivePublicJwks(): Promise<JWK[]> {
  const now = new Date();
  const keys = await prisma.jwksKey.findMany({
    where: {
      OR: [
        { status: "CURRENT" },
        { status: "RETIRED", retireAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return keys.map((k) => k.publicJwk as unknown as JWK);
}

/**
 * 공개 JWK를 kid로 조회 (JWKS endpoint 응답 범위 내에서).
 * verifySession fallback에서 사용.
 */
export async function getPublicKeyByKid(kid: string): Promise<JwksCryptoKey | null> {
  const now = new Date();
  const record = await prisma.jwksKey.findUnique({ where: { kid } });
  if (!record) return null;
  if (record.status === "RETIRED" && (!record.retireAt || record.retireAt <= now)) {
    return null;
  }
  const publicJwk = record.publicJwk as unknown as JWK;
  return (await importJWK(publicJwk, record.alg)) as JwksCryptoKey;
}

/**
 * 키 회전. 현 CURRENT → RETIRED (retireAt = now + graceSec), 신 키 CURRENT 등록.
 * graceSec 기본값: 대시보드 세션 TTL 24h + jose cacheMaxAge 3m + 여유 60s = 24h 4m.
 */
export async function rotateKey(
  graceSec: number = 60 * 60 * 24 + 180 + 60,
): Promise<{ newKid: string; retiredKid: string | null }> {
  const now = new Date();
  const retireAt = new Date(now.getTime() + graceSec * 1000);

  const current = await prisma.jwksKey.findFirst({
    where: { status: "CURRENT" },
    orderBy: { createdAt: "desc" },
  });

  const generated = await generateJwksKey();

  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.jwksKey.update({
        where: { id: current.id },
        data: { status: "RETIRED", rotatedAt: now, retireAt },
      });
    }
    await tx.jwksKey.create({
      data: {
        kid: generated.kid,
        alg: generated.alg,
        publicJwk: generated.publicJwk as unknown as object,
        privateJwk: generated.privateJwk as unknown as object,
        status: "CURRENT",
      },
    });
  });

  return { newKid: generated.kid, retiredKid: current?.kid ?? null };
}

/**
 * retireAt 만료 키 제거 (cron 1시간 호출 예정).
 * privateJwk 포함하므로 영구 삭제가 안전.
 */
export async function cleanupRetiredKeys(): Promise<{ removed: number }> {
  const now = new Date();
  const result = await prisma.jwksKey.deleteMany({
    where: {
      status: "RETIRED",
      retireAt: { lt: now },
    },
  });
  return { removed: result.count };
}

export { JWKS_ALG };
