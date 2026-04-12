import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import type { ApiKey, ApiKeyType } from "@/generated/prisma/client";
import type { ApiKeyIssuedPayload } from "@/lib/types/supabase-clone";

const BCRYPT_ROUNDS = 10;
const RANDOM_BYTES = 24; // base64url 32자

function prefixFor(type: ApiKeyType): string {
  return type === "PUBLISHABLE" ? "sb_publishable" : "sb_secret";
}

function randomToken(): string {
  return randomBytes(RANDOM_BYTES).toString("base64url");
}

export interface IssueApiKeyInput {
  name: string;
  type: ApiKeyType;
  scopes: string[];
  ownerId: string;
}

export interface IssueApiKeyResult {
  apiKey: Pick<ApiKey, "id" | "name" | "prefix" | "type" | "scopes" | "createdAt" | "ownerId">;
  issued: ApiKeyIssuedPayload;
}

/**
 * 새로운 API 키 발급. 평문은 반환값에 1회만 포함되며 DB에는 bcrypt 해시만 저장된다.
 */
export async function issueApiKey(input: IssueApiKeyInput): Promise<IssueApiKeyResult> {
  const prefixBase = prefixFor(input.type);
  // prefix 충돌을 피하기 위해 prefix에 랜덤 일부를 포함
  const prefixSuffix = randomBytes(6).toString("base64url");
  const prefix = `${prefixBase}_${prefixSuffix}`;

  const tokenBody = randomToken();
  const plaintext = `${prefix}_${tokenBody}`;
  const keyHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);

  const created = await prisma.apiKey.create({
    data: {
      name: input.name,
      prefix,
      keyHash,
      type: input.type,
      scopes: input.scopes,
      ownerId: input.ownerId,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      type: true,
      scopes: true,
      createdAt: true,
      ownerId: true,
    },
  });

  return {
    apiKey: created,
    issued: { plaintext, prefix, keyHash },
  };
}

/**
 * 평문 키를 검증 (bcrypt.compare + prefix lookup + revoked 체크)
 */
export async function verifyApiKey(plaintext: string): Promise<ApiKey | null> {
  // plaintext 형식: <prefix>_<tokenBody>
  const lastUnderscore = plaintext.lastIndexOf("_");
  if (lastUnderscore < 0) return null;
  const prefix = plaintext.slice(0, lastUnderscore);
  if (!prefix.startsWith("sb_publishable") && !prefix.startsWith("sb_secret")) {
    return null;
  }

  const key = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!key) return null;
  if (key.revokedAt) return null;

  const ok = await bcrypt.compare(plaintext, key.keyHash);
  if (!ok) return null;

  // lastUsedAt 갱신 (best-effort, 실패 무시)
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return key;
}
