"use client";

import { useState, useRef, useCallback } from "react";

export interface FileUploadZoneProps {
  folderId?: string;
  onUploadComplete: () => void;
}

export function FileUploadZone({ folderId, onUploadComplete }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");
    setUploading(true);

    let successCount = 0;
    let lastError = "";

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`${file.name} 업로드 중... (${i + 1}/${files.length})`);

      const formData = new FormData();
      formData.append("file", file);
      if (folderId) formData.append("folderId", folderId);

      try {
        const res = await fetch("/api/v1/filebox/files", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json();
          lastError = data.error?.message || `${file.name} 업로드 실패`;
        } else {
          successCount++;
        }
      } catch {
        lastError = `${file.name} 업로드 중 오류 발생`;
      }
    }

    setUploading(false);
    setProgress("");

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
          <div className="mt-2 h-1 w-48 mx-auto bg-surface-300 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
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
            <p className="text-gray-400 text-xs mt-0.5">PDF, 이미지, 문서, ZIP 등 · 최대 50MB</p>
          </div>
        </div>
      )}

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}
