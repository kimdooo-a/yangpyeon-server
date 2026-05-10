/**
 * Messenger 첨부 업로드 utility — M5-ATTACH-3 (S96).
 *
 * filebox 의 `file-upload-zone.tsx` (S78-A) 패턴을 함수형으로 추출.
 * ADR-033 §2.5 X1 server proxy 일관 — frontend 가 ypserver multipart 라우트만 호출.
 * ADR-030 §"첨부 = filebox File FK 재사용" — 별도 storage/IAM 신설 X.
 *
 * 임계점:
 *   - file.size ≤ 50MB: 로컬 multipart POST (`/api/v1/filebox/files`)
 *   - 50MB ~ 5GB:  SeaweedFS multipart upload (`/api/v1/filebox/files/upload-multipart/*`)
 *   - 5GB+: 차단 (서버 MAX_R2_FILE_SIZE 와 동일)
 *
 * messenger 측 호출자는 단일 `uploadAttachment(file, onProgress)` API 만 사용 →
 * size 분기 + multipart 워커풀 + abort fallback 모두 내부화.
 *
 * 참고: 본 utility 는 XHR + fetch 직접 호출이라 단위 테스트 대상 아님 (filebox 측도
 * file-upload-zone.tsx 가 jsdom 미도입으로 테스트 부재). 라이브 검증 = 다음 chunk
 * (3b UI 통합) 의 수동 영역.
 */

const LOCAL_THRESHOLD = 50 * 1024 * 1024; // 50MB — 서버 validateFile MAX_FILE_SIZE 와 동일
const SEAWEED_MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5GB — 서버 MAX_R2_FILE_SIZE 와 동일
const MULTIPART_CONCURRENCY = 3; // cloudflare tunnel 100MB 한계 → 50MB part 3개 동시 안전

export type AttachmentKind = "IMAGE" | "FILE" | "VOICE";

export interface UploadAttachmentResult {
  /** filebox File.id — messenger.sendMessage 의 attachments[].fileId 로 사용. */
  fileId: string;
  /** 자동 분류 — image/* → IMAGE, audio/* → VOICE, 그 외 → FILE. */
  kind: AttachmentKind;
}

/** mimeType 기반 messenger AttachmentKind 분류. backend AttachmentKind enum 정합. */
export function classifyAttachmentKind(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "VOICE";
  return "FILE";
}

/**
 * 메인 진입점 — size 분기 + 자동 multipart + AttachmentKind 분류.
 *
 * @param file 사용자가 선택한 파일 (드래그 또는 input change 이벤트)
 * @param onProgress 0~100 진행률 콜백 (옵션). 호출 빈도 = part 별 byte 진행
 * @throws Error — 5GB 초과, 네트워크 오류, server validation 실패 등.
 *   호출자 (MessageComposer) 가 catch 후 toast 표시 + 첨부 칩 제거 처리.
 */
export async function uploadAttachment(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadAttachmentResult> {
  if (file.size > SEAWEED_MAX_SIZE) {
    throw new Error("파일 크기 초과 — 최대 5GB");
  }
  const mimeType = file.type || "application/octet-stream";
  const kind = classifyAttachmentKind(mimeType);

  const fileId =
    file.size > LOCAL_THRESHOLD
      ? await uploadMultipart(file, onProgress)
      : await uploadLocal(file, onProgress);

  return { fileId, kind };
}

/** 50MB 이하 — XHR FormData POST. 진행률 추적용으로 fetch 대신 XHR. */
function uploadLocal(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/filebox/files");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          const id = body?.data?.id;
          if (typeof id === "string" && id.length > 0) {
            resolve(id);
          } else {
            reject(new Error("응답에 file.id 없음"));
          }
        } catch {
          reject(new Error("응답 파싱 실패"));
        }
        return;
      }
      let msg = `상태 ${xhr.status}`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (body?.error?.message) msg = body.error.message;
      } catch {
        /* JSON 아님 — 기본 메시지 유지 */
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

/**
 * SeaweedFS multipart 업로드 (S78-A 패턴).
 *
 * 흐름:
 *   1. POST upload-multipart/init  → uploadId, key, partSize, partCount
 *   2. POST upload-multipart/part × partCount (slot CONCURRENCY 동시) → etag
 *   3. POST upload-multipart/complete → DB row 생성, 응답 data.id
 *   실패: POST upload-multipart/abort (best-effort, 24h cleanup cron 회수)
 */
async function uploadMultipart(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const mimeType = file.type || "application/octet-stream";

  // 1. init
  const initRes = await fetch("/api/v1/filebox/files/upload-multipart/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType,
    }),
  });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? "multipart 초기화 실패");
  }
  const { data: initData } = await initRes.json();
  const { uploadId, key, partSize, partCount, folderId: resolvedFolderId } =
    initData as {
      uploadId: string;
      key: string;
      partSize: number;
      partCount: number;
      folderId: string;
    };

  // 진행률 추적 — 각 파트의 0~100% 를 partSize 가중 평균
  const partProgress: number[] = new Array(partCount).fill(0);
  const totalSize = file.size;
  const updateProgress = () => {
    if (!onProgress) return;
    let uploaded = 0;
    for (let i = 0; i < partCount; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, totalSize);
      uploaded += (end - start) * (partProgress[i] / 100);
    }
    onProgress(Math.round((uploaded / totalSize) * 100));
  };

  const completedParts: { partNumber: number; etag: string }[] = [];

  const callAbort = async () => {
    try {
      await fetch("/api/v1/filebox/files/upload-multipart/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, key }),
      });
    } catch {
      /* best-effort — 24h cleanup cron 이 결국 회수 */
    }
  };

  const uploadOnePart = (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, totalSize);
    const blob = file.slice(start, end);
    const url = `/api/v1/filebox/files/upload-multipart/part?uploadId=${encodeURIComponent(
      uploadId,
    )}&key=${encodeURIComponent(key)}&partNumber=${partNumber}`;

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          partProgress[partNumber - 1] = (e.loaded / e.total) * 100;
          updateProgress();
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const body = JSON.parse(xhr.responseText);
            const etag = body?.data?.etag;
            if (!etag) {
              reject(new Error(`part ${partNumber} 응답 etag 없음`));
              return;
            }
            partProgress[partNumber - 1] = 100;
            updateProgress();
            completedParts.push({ partNumber, etag });
            resolve();
          } catch {
            reject(new Error(`part ${partNumber} 응답 파싱 실패`));
          }
          return;
        }
        let msg = `part ${partNumber} 실패 (HTTP ${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error?.message) msg = `part ${partNumber}: ${body.error.message}`;
        } catch {
          /* JSON 아님 */
        }
        reject(new Error(msg));
      };
      xhr.onerror = () => reject(new Error(`part ${partNumber} 네트워크 오류`));
      xhr.send(blob);
    });
  };

  // 2. 워커 풀 — 첫 에러 시 다음 파트 진입 중단 (진행 중 파트는 자연 종료)
  let nextPart = 1;
  const errors: Error[] = [];
  const workers: Promise<void>[] = [];
  for (let w = 0; w < MULTIPART_CONCURRENCY; w++) {
    workers.push(
      (async () => {
        while (errors.length === 0) {
          const partNumber = nextPart++;
          if (partNumber > partCount) return;
          try {
            await uploadOnePart(partNumber);
          } catch (e) {
            errors.push(e instanceof Error ? e : new Error(String(e)));
            return;
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  if (errors.length > 0) {
    await callAbort();
    throw errors[0];
  }

  // 3. complete
  try {
    const completeRes = await fetch(
      "/api/v1/filebox/files/upload-multipart/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          key,
          parts: completedParts.sort((a, b) => a.partNumber - b.partNumber),
          originalName: file.name,
          size: file.size,
          mimeType,
          folderId: resolvedFolderId,
        }),
      },
    );
    if (!completeRes.ok) {
      const body = await completeRes.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? "multipart 완료 실패");
    }
    const body = await completeRes.json();
    const id = body?.data?.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("complete 응답에 file.id 없음");
    }
    return id;
  } catch (err) {
    await callAbort();
    throw err;
  }
}
