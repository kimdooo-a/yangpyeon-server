import { describe, it, expect } from "vitest";
import { SignJWT, jwtVerify, importJWK, decodeProtectedHeader } from "jose";
import { generateJwksKey, JWKS_ALG } from "./generate";

// Phase 15 Auth Advanced Step 3 — JWKS endpoint / SP-014 조건부 Go 반영
// 참조: docs/research/spikes/spike-014-jwks-cache-result.md

describe("generateJwksKey", () => {
  it("ES256 공개/비공개 JWK 쌍을 생성한다", async () => {
    const { kid, alg, publicJwk, privateJwk } = await generateJwksKey();
    expect(alg).toBe("ES256");
    expect(kid).toMatch(/^[0-9a-f]{32}$/);
    expect(publicJwk.kid).toBe(kid);
    expect(privateJwk.kid).toBe(kid);
    expect(publicJwk.kty).toBe("EC");
    expect(publicJwk.crv).toBe("P-256");
    expect(publicJwk.use).toBe("sig");
    expect(publicJwk.alg).toBe("ES256");
    // 공개 JWK는 d (private component)가 없어야 함
    expect((publicJwk as { d?: string }).d).toBeUndefined();
    expect((privateJwk as { d?: string }).d).toBeDefined();
  });

  it("호출마다 서로 다른 kid 를 생성한다", async () => {
    const a = await generateJwksKey();
    const b = await generateJwksKey();
    expect(a.kid).not.toBe(b.kid);
  });
});

describe("JWKS round-trip (sign with private, verify with public)", () => {
  it("ES256 서명 → 공개키 검증이 성공한다 + kid 헤더가 주입된다", async () => {
    const { kid, publicJwk, privateJwk } = await generateJwksKey();

    const privateKey = await importJWK(privateJwk, JWKS_ALG);
    const publicKey = await importJWK(publicJwk, JWKS_ALG);

    const token = await new SignJWT({ sub: "u1", role: "ADMIN" })
      .setProtectedHeader({ alg: JWKS_ALG, kid })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    // 헤더에 kid 가 포함됨 (JWKS fallback 분기에 필수)
    const header = decodeProtectedHeader(token);
    expect(header.kid).toBe(kid);
    expect(header.alg).toBe("ES256");

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: [JWKS_ALG],
    });
    expect(payload.sub).toBe("u1");
    expect(payload.role).toBe("ADMIN");
  });

  it("다른 키쌍의 공개키로 검증하면 실패한다", async () => {
    const signer = await generateJwksKey();
    const other = await generateJwksKey();

    const signerPriv = await importJWK(signer.privateJwk, JWKS_ALG);
    const otherPub = await importJWK(other.publicJwk, JWKS_ALG);

    const token = await new SignJWT({ sub: "u1" })
      .setProtectedHeader({ alg: JWKS_ALG, kid: signer.kid })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(signerPriv);

    await expect(
      jwtVerify(token, otherPub, { algorithms: [JWKS_ALG] }),
    ).rejects.toThrow();
  });
});
