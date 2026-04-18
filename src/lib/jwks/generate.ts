import { generateKeyPair, exportJWK, type JWK } from "jose";
import { randomBytes } from "node:crypto";

export const JWKS_ALG = "ES256" as const;

export interface GeneratedJwks {
  kid: string;
  alg: typeof JWKS_ALG;
  publicJwk: JWK;
  privateJwk: JWK;
}

/**
 * ES256 (EC P-256) 키쌍을 생성하고 JWK 형식으로 export.
 * kid: 16 byte hex random — 충돌 확률 사실상 0, 로그 가독성 확보.
 */
export async function generateJwksKey(): Promise<GeneratedJwks> {
  const { publicKey, privateKey } = await generateKeyPair(JWKS_ALG, {
    extractable: true,
  });
  const kid = randomBytes(16).toString("hex");
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  publicJwk.kid = kid;
  publicJwk.alg = JWKS_ALG;
  publicJwk.use = "sig";
  privateJwk.kid = kid;
  privateJwk.alg = JWKS_ALG;
  privateJwk.use = "sig";
  return { kid, alg: JWKS_ALG, publicJwk, privateJwk };
}
