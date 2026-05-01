// Object Storage 클라이언트 — S3 호환 API + presigned URL 발급
// 구현체: SeaweedFS 자가호스팅 (ADR-033, 2026-05-01 세션 77 옵션 C).
// 이전 구현: Cloudflare R2 (ADR-032 V1 옵션 A — SUPERSEDED 2026-05-01).
//
// 함수명/파일명 R2_/r2.ts 는 옵션 A 의미 재정의 — S3 호환 클라이언트의
// 일반화된 이름. 외부 컨슈머 추가 시 향후 PR 에서 object-storage.ts 로 rename.
//
// Endpoint: WSL2 Ubuntu localhost (PM2 seaweedfs process port 8333)
// 인증: aws-sdk v3 + S3-compatible signature v4 (SeaweedFS access key)
// forcePathStyle: true (SeaweedFS S3 가 virtual-host style 미지원)
//
// 사용처:
// - src/app/api/v1/filebox/files/r2-presigned/route.ts (PUT URL 발급, 50MB ~ 90MB)
// - src/app/api/v1/filebox/files/r2-confirm/route.ts (HEAD 검증)
// - src/app/api/v1/filebox/files/[id]/route.ts (다운로드 stream — SeaweedFS localhost only 라 ypserver 경유)
// - 후속 PR S78-?: multipart upload (90MB+ cloudflare tunnel 100MB 우회)
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// ── 환경변수 ───────────────────────────────────────────────────
const OBJECT_STORAGE_ENDPOINT = process.env.OBJECT_STORAGE_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL; // optional (외부 endpoint, SeaweedFS localhost 환경 미사용)

// ── 한도 ──────────────────────────────────────────────────────
export const MAX_R2_FILE_SIZE = Number(process.env.MAX_R2_FILE_SIZE) || 5 * 1024 * 1024 * 1024; // 5GB
export const PRESIGNED_URL_EXPIRES_SEC = 300; // 5분
export const R2_USER_QUOTA = Number(process.env.R2_USER_QUOTA) || 10 * 1024 * 1024 * 1024; // 10GB
export const R2_ADMIN_QUOTA = Number(process.env.R2_ADMIN_QUOTA) || 100 * 1024 * 1024 * 1024; // 100GB

// ── 클라이언트 (lazy init, env 미설정 시 throw) ────────────────
let _client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (_client) return _client;
  if (!OBJECT_STORAGE_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "Object Storage 환경변수 누락: OBJECT_STORAGE_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY",
    );
  }
  _client = new S3Client({
    region: "us-east-1", // SeaweedFS S3 표준 default
    endpoint: OBJECT_STORAGE_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // SeaweedFS — virtual-host style 미지원
  });
  return _client;
}

// ── R2 object key 생성 ────────────────────────────────────────
// 스킴: tenants/{tenantId}/users/{userId}/{uuid}-{originalName(sanitized)}
// tenant_id 첫 단계 — 향후 RLS 도입 시 prefix 검증 가능
export function buildR2Key(opts: {
  tenantId: string;
  userId: string;
  originalName: string;
}): string {
  const sanitized = opts.originalName
    .replace(/[<>"'`&\\\/]/g, "")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, 200);
  return `tenants/${opts.tenantId}/users/${opts.userId}/${randomUUID()}-${sanitized}`;
}

// ── presigned PUT URL 발급 ─────────────────────────────────────
export async function presignR2PutUrl(opts: {
  key: string;
  contentLength: number;
  contentType: string;
}): Promise<{ url: string; expiresAt: number }> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET!,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
    // R2 비공개 버킷 — public read 차단
  });
  const url = await getSignedUrl(client, command, { expiresIn: PRESIGNED_URL_EXPIRES_SEC });
  return { url, expiresAt: Date.now() + PRESIGNED_URL_EXPIRES_SEC * 1000 };
}

// ── R2 HEAD 검증 (객체 실제 존재 확인) ───────────────────────────
// confirm 단계에서 사용 — PUT 직후 5초 내 호출 권장 (eventual consistency 회피)
export async function headR2Object(key: string): Promise<{
  exists: boolean;
  contentLength?: number;
  etag?: string;
  contentType?: string;
}> {
  const client = getR2Client();
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET!, Key: key }),
    );
    return {
      exists: true,
      contentLength: result.ContentLength,
      etag: result.ETag?.replace(/"/g, ""),
      contentType: result.ContentType,
    };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name: string }).name === "NotFound"
    ) {
      return { exists: false };
    }
    throw err;
  }
}

// ── 다운로드용 GET URL ─
// responseContentDisposition: 한국어 파일명 보존용 RFC 5987 attachment 헤더
//   (R2/S3 가 응답 시 Content-Disposition 으로 그대로 set 함)
export async function presignR2GetUrl(
  key: string,
  expiresInSec = 600,
  opts?: { responseContentDisposition?: string },
): Promise<string> {
  const client = getR2Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET!,
    Key: key,
    ...(opts?.responseContentDisposition
      ? { ResponseContentDisposition: opts.responseContentDisposition }
      : {}),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSec });
}

// ── R2 객체 즉시 삭제 ─────────────────────────────────────────
// best-effort: NotFound (이미 없음) 은 성공으로 간주 — 호출자가 DB row 를
// 이미 삭제한 후 호출하므로 R2 객체만 잔존하는 상황이 정상 케이스.
// 그 외 네트워크/권한 에러는 throw — 호출자가 console.warn 후 swallow.
export async function deleteR2Object(key: string): Promise<void> {
  const client = getR2Client();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET!, Key: key }));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name: string }).name === "NotFound"
    ) {
      return;
    }
    throw err;
  }
}

// ── public URL (custom domain 설정 시) ─────────────────────────
export function buildR2PublicUrl(key: string): string | null {
  if (!R2_PUBLIC_BASE_URL) return null;
  return `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}
