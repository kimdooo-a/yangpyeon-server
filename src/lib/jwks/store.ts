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
 *
 * 세션 41: Prisma 7 adapter-pg binding-side TZ 시프트 회피 — retire_at 비교를 PG 측 NOW() 로 위임.
 */
export async function getActivePublicJwks(): Promise<JWK[]> {
  const rows = await prisma.$queryRaw<Array<{ publicJwk: unknown }>>`
    SELECT public_jwk AS "publicJwk"
    FROM jwks_keys
    WHERE status = 'CURRENT'
       OR (status = 'RETIRED' AND retire_at IS NOT NULL AND retire_at > NOW())
    ORDER BY created_at DESC
  `;
  return rows.map((r) => r.publicJwk as JWK);
}

/**
 * 공개 JWK를 kid로 조회 (JWKS endpoint 응답 범위 내에서).
 * verifySession fallback에서 사용.
 *
 * 세션 41: retire_at 만료 판정을 PG 서버측으로 위임 (parsing-side TZ 시프트 회피).
 */
export async function getPublicKeyByKid(kid: string): Promise<JwksCryptoKey | null> {
  const rows = await prisma.$queryRaw<
    Array<{ publicJwk: unknown; alg: string }>
  >`
    SELECT public_jwk AS "publicJwk", alg
    FROM jwks_keys
    WHERE kid = ${kid}
      AND (
        status = 'CURRENT'
        OR (status = 'RETIRED' AND retire_at IS NOT NULL AND retire_at > NOW())
      )
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const publicJwk = rows[0].publicJwk as JWK;
  return (await importJWK(publicJwk, rows[0].alg)) as JwksCryptoKey;
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
 *
 * 세션 41: cleanupExpiredSessions 와 동일 패턴 — raw SELECT + ORM deleteMany(id).
 * Prisma 7 adapter-pg binding-side TZ 시프트 회피.
 */
export async function cleanupRetiredKeys(): Promise<{ removed: number }> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM jwks_keys
    WHERE status = 'RETIRED' AND retire_at IS NOT NULL AND retire_at < NOW()
  `;
  if (rows.length === 0) return { removed: 0 };
  const ids = rows.map((r) => r.id);
  const result = await prisma.jwksKey.deleteMany({
    where: { id: { in: ids } },
  });
  return { removed: result.count };
}

export { JWKS_ALG };
