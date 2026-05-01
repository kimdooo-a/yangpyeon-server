// Object Storage 클라이언트 — S3 호환 API
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
// - src/app/api/v1/filebox/files/upload-multipart/{init,part,complete,abort}/route.ts
//   (X1 server proxy multipart, S78-A — 50MB 초과 파일 전체 담당)
// - src/app/api/v1/filebox/files/[id]/route.ts (다운로드 stream — SeaweedFS localhost only 라 ypserver 경유)
//
// 아키텍처 (X1 server proxy):
//   browser → cloudflare tunnel → ypserver → SeaweedFS S3 (localhost:8333)
//   각 part PUT 이 cloudflare tunnel 100MB 한계를 통과 (50MB part 안전 마진).
//   browser-direct PUT 은 SeaweedFS endpoint 가 localhost-only 라 도달 불가 (s78 발견).
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// ── 환경변수 ───────────────────────────────────────────────────
const OBJECT_STORAGE_ENDPOINT = process.env.OBJECT_STORAGE_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// ── 한도 ──────────────────────────────────────────────────────
export const MAX_R2_FILE_SIZE = Number(process.env.MAX_R2_FILE_SIZE) || 5 * 1024 * 1024 * 1024; // 5GB
export const R2_USER_QUOTA = Number(process.env.R2_USER_QUOTA) || 10 * 1024 * 1024 * 1024; // 10GB
export const R2_ADMIN_QUOTA = Number(process.env.R2_ADMIN_QUOTA) || 100 * 1024 * 1024 * 1024; // 100GB

// multipart upload part 크기 (cloudflare tunnel 100MB 한계 안전 마진).
// S3 multipart 표준은 part >= 5MB (마지막 제외) — 50MB 가 표준 권장.
export const MULTIPART_PART_SIZE = 50 * 1024 * 1024;

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

// ── HEAD 검증 (객체 실제 존재 확인) ──────────────────────────────
// multipart complete 직후 size 검증용. SeaweedFS 는 동기 commit 이라
// eventual consistency 우려 없음.
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

// ── multipart upload (S78-A X1 server proxy) ───────────────────
// 50MB 초과 파일 전체 담당. 파트 크기/동시성은 호출자가 정의:
//   - PART_SIZE: 50MB (cloudflare tunnel 100MB 안전 마진)
//   - 동시 파트: 3개 (frontend Promise.race sliding window)
//
// 흐름: createMultipartUpload → uploadPart × N → completeMultipartUpload
// 실패/취소 시: abortMultipartUpload (S78-B cleanup cron 도 24h 후 회수)

export async function createMultipartUpload(opts: {
  key: string;
  contentType: string;
}): Promise<{ uploadId: string }> {
  const client = getR2Client();
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET!,
      Key: opts.key,
      ContentType: opts.contentType,
    }),
  );
  if (!result.UploadId) throw new Error("UploadId 없음 (CreateMultipartUpload 응답 비정상)");
  return { uploadId: result.UploadId };
}

export async function uploadPart(opts: {
  key: string;
  uploadId: string;
  partNumber: number;
  body: Buffer;
  contentLength: number;
}): Promise<{ etag: string }> {
  const client = getR2Client();
  const result = await client.send(
    new UploadPartCommand({
      Bucket: R2_BUCKET!,
      Key: opts.key,
      UploadId: opts.uploadId,
      PartNumber: opts.partNumber,
      Body: opts.body,
      ContentLength: opts.contentLength,
    }),
  );
  if (!result.ETag) throw new Error(`UploadPart ETag 없음 (partNumber=${opts.partNumber})`);
  // S3 가 ETag 를 "..." 따옴표로 감싸 반환 — 보존 (complete 시 그대로 전달)
  return { etag: result.ETag.replace(/"/g, "") };
}

export async function completeMultipartUpload(opts: {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}): Promise<{ etag?: string; location?: string }> {
  const client = getR2Client();
  const completedParts: CompletedPart[] = [...opts.parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => ({ PartNumber: p.partNumber, ETag: `"${p.etag}"` }));
  const result = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET!,
      Key: opts.key,
      UploadId: opts.uploadId,
      MultipartUpload: { Parts: completedParts },
    }),
  );
  return {
    etag: result.ETag?.replace(/"/g, ""),
    location: result.Location,
  };
}

export async function abortMultipartUpload(opts: {
  key: string;
  uploadId: string;
}): Promise<void> {
  const client = getR2Client();
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: R2_BUCKET!,
        Key: opts.key,
        UploadId: opts.uploadId,
      }),
    );
  } catch (err) {
    // 이미 abort/complete 된 uploadId 는 NoSuchUpload — 멱등성 보장
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name: string }).name === "NoSuchUpload"
    ) {
      return;
    }
    throw err;
  }
}

// ── 객체 즉시 삭제 ─────────────────────────────────────────────
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

