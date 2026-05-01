"use client";

import { useState, useRef, useCallback } from "react";

export interface FileUploadZoneProps {
  folderId?: string;
  onUploadComplete: () => void;
}

// 임계점: 50MB 이하 = 로컬 multipart POST, 초과 = R2 presigned PUT (ADR-032 V1).
// 서버 validateFile() 의 MAX_FILE_SIZE (50MB) 와 동일 — 일치 유지 필수.
const LOCAL_THRESHOLD = 50 * 1024 * 1024;
// R2 최대 5GB (서버 MAX_R2_FILE_SIZE 와 일치)
const R2_MAX_SIZE = 5 * 1024 * 1024 * 1024;

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

// R2 직업로드 (presigned URL 발급 → R2 PUT → confirm)
async function uploadR2(
  file: File,
  folderId: string | undefined,
  onProgress: (pct: number) => void,
): Promise<void> {
  // mime 빈 문자열 fallback — presigned 발급/PUT 모두 동일하게 사용해야 서명 일치
  const mimeType = file.type || "application/octet-stream";

  // 1. presigned URL 발급
  const presignRes = await fetch("/api/v1/filebox/files/r2-presigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      ...(folderId ? { folderId } : {}),
    }),
  });
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    throw new Error(body?.error?.message || "presigned URL 발급 실패");
  }
  const { data: presignData } = await presignRes.json();
  const { key, uploadUrl, folderId: resolvedFolderId } = presignData;

  // 2. R2 PUT (브라우저가 R2 endpoint 로 직접 전송 — Cloudflare Tunnel 우회)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 PUT 실패 (HTTP ${xhr.status}). CORS 설정을 확인하세요.`));
      }
    };
    xhr.onerror = () => reject(new Error("R2 네트워크 오류 (CORS 또는 네트워크 차단)"));
    xhr.send(file);
  });

  // 3. confirm — DB row 생성
  const confirmRes = await fetch("/api/v1/filebox/files/r2-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      originalName: file.name,
      size: file.size,
      mimeType,
      folderId: resolvedFolderId,
    }),
  });
  if (!confirmRes.ok) {
    const body = await confirmRes.json().catch(() => ({}));
    throw new Error(body?.error?.message || "R2 등록 확인 실패");
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
      const route = file.size > LOCAL_THRESHOLD ? "R2" : "로컬";
      setProgress(`${file.name} 업로드 중 (${i + 1}/${files.length}) · ${route} · ${formatBytes(file.size)}`);
      setProgressPct(0);

      try {
        if (file.size > R2_MAX_SIZE) {
          throw new Error(`파일 크기 초과 — 최대 5GB`);
        }
        if (file.size > LOCAL_THRESHOLD) {
          await uploadR2(file, folderId, (p) => setProgressPct(p));
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
              50MB 이하 로컬 · 50MB~5GB R2 자동 분기 · 실행 파일 차단
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm mt-2 break-all">{error}</p>}
    </div>
  );
}
