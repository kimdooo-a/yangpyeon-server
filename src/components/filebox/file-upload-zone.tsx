"use client";

import { useState, useRef, useCallback } from "react";

export interface FileUploadZoneProps {
  folderId?: string;
  onUploadComplete: () => void;
}

// 임계점: 50MB 이하 = 로컬 multipart POST (FILEBOX_DIR 디스크), 초과 = SeaweedFS multipart upload.
// 서버 validateFile() 의 MAX_FILE_SIZE (50MB) 와 동일 — 일치 유지 필수.
const LOCAL_THRESHOLD = 50 * 1024 * 1024;
// SeaweedFS 최대 5GB (서버 MAX_R2_FILE_SIZE 와 일치)
const SEAWEED_MAX_SIZE = 5 * 1024 * 1024 * 1024;
// multipart 동시 업로드 슬롯 (cloudflare tunnel 100MB 한계 → 50MB part 3개 동시)
const MULTIPART_CONCURRENCY = 3;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// 로컬 multipart 업로드 (XHR — 진행률 추적용)
function uploadLocal(
  file: File,
  folderId: string | undefined,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/filebox/files");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let msg = `상태 ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error?.message) msg = body.error.message;
        } catch { /* JSON 아님 */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    const fd = new FormData();
    fd.append("file", file);
    if (folderId) fd.append("folderId", folderId);
    xhr.send(fd);
  });
}

// SeaweedFS multipart 업로드 (X1 server proxy, ADR-033 후속 S78-A)
//
// 흐름:
//   1. POST upload-multipart/init  → uploadId, key, partSize, partCount
//   2. POST upload-multipart/part  × partCount (slot CONCURRENCY 동시) → etag
//   3. POST upload-multipart/complete → DB row 생성
//   실패 시: POST upload-multipart/abort (best-effort)
//
// 각 part 는 cloudflare tunnel 100MB 한계 안에 들어가는 50MB raw bytes (Content-Length 명시).
// 진행률은 part 별 weighted sum 으로 합산.
async function uploadMultipart(
  file: File,
  folderId: string | undefined,
  onProgress: (pct: number) => void,
): Promise<void> {
  const mimeType = file.type || "application/octet-stream";

  // 1. init
  const initRes = await fetch("/api/v1/filebox/files/upload-multipart/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      ...(folderId ? { folderId } : {}),
    }),
  });
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => ({}));
    throw new Error(body?.error?.message || "multipart 초기화 실패");
  }
  const { data: initData } = await initRes.json();
  const { uploadId, key, partSize, partCount, folderId: resolvedFolderId } = initData as {
    uploadId: string;
    key: string;
    partSize: number;
    partCount: number;
    folderId: string;
  };

  // 진행률 추적 — 각 파트의 0..100 % 를 partSize 로 가중 평균
  const partProgress: number[] = new Array(partCount).fill(0);
  const totalSize = file.size;
  const updateProgress = () => {
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
    } catch { /* best-effort — 24h cleanup cron 이 결국 회수 */ }
  };

  // 단일 파트 업로드 (XHR — upload.onprogress 로 byte-level 진행률)
  const uploadOnePart = (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, totalSize);
    const blob = file.slice(start, end);
    const url = `/api/v1/filebox/files/upload-multipart/part?uploadId=${encodeURIComponent(uploadId)}&key=${encodeURIComponent(key)}&partNumber=${partNumber}`;

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
        } else {
          let msg = `part ${partNumber} 실패 (HTTP ${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.error?.message) msg = `part ${partNumber}: ${body.error.message}`;
          } catch { /* JSON 아님 */ }
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error(`part ${partNumber} 네트워크 오류`));
      xhr.send(blob);
    });
  };

  // 2. 워커 풀 — 첫 에러 발생 시 다음 파트 진입 중단 (이미 진행 중인 파트는 자연 종료)
  let nextPart = 1;
  const errors: Error[] = [];
  const workers: Promise<void>[] = [];
  for (let w = 0; w < MULTIPART_CONCURRENCY; w++) {
    workers.push((async () => {
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
    })());
  }
  await Promise.all(workers);
  if (errors.length > 0) {
    await callAbort();
    throw errors[0];
  }

  // 3. complete (DB row 생성)
  try {
    const completeRes = await fetch("/api/v1/filebox/files/upload-multipart/complete", {
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
    });
    if (!completeRes.ok) {
      const body = await completeRes.json().catch(() => ({}));
      throw new Error(body?.error?.message || "multipart 완료 실패");
    }
  } catch (err) {
    await callAbort();
    throw err;
  }
}

export function FileUploadZone({ folderId, onUploadComplete }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);

    let successCount = 0;
    let lastError = "";

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const route = file.size > LOCAL_THRESHOLD ? "S3" : "로컬";
      setProgress(`${file.name} 업로드 중 (${i + 1}/${files.length}) · ${route} · ${formatBytes(file.size)}`);
      setProgressPct(0);

      try {
        if (file.size > SEAWEED_MAX_SIZE) {
          throw new Error(`파일 크기 초과 — 최대 5GB`);
        }
        if (file.size > LOCAL_THRESHOLD) {
          await uploadMultipart(file, folderId, (p) => setProgressPct(p));
        } else {
          await uploadLocal(file, folderId, (p) => setProgressPct(p));
        }
        successCount++;
      } catch (err) {
        lastError = err instanceof Error
          ? `${file.name}: ${err.message}`
          : `${file.name} 업로드 실패`;
      }
    }

    setUploading(false);
    setProgress("");
    setProgressPct(0);

    if (successCount > 0) onUploadComplete();
    if (lastError) setError(lastError);

    if (inputRef.current) inputRef.current.value = "";
  }, [folderId, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    upload(e.dataTransfer.files);
  }, [upload]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`
        relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
        ${isDragOver
          ? "border-brand bg-brand/5 scale-[1.01]"
          : "border-border hover:border-gray-500 hover:bg-surface-300"
        }
        ${uploading ? "pointer-events-none opacity-60" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />

      {uploading ? (
        <div>
          <p className="text-gray-700 text-sm font-medium">{progress}</p>
          <div className="mt-2 h-1.5 w-64 mx-auto bg-surface-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-gray-500 text-xs mt-1">{progressPct}%</p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={isDragOver ? "text-brand" : "text-gray-500"}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="text-left">
            <p className="text-gray-700 text-sm">
              {isDragOver ? "여기에 놓으세요" : "파일을 드래그하거나 클릭하여 업로드"}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              50MB 이하 로컬 · 50MB~5GB S3 multipart 자동 분기 · 실행 파일 차단
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm mt-2 break-all">{error}</p>}
    </div>
  );
}
