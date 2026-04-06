"use client";

import { useState } from "react";
import { FileTypeIcon } from "./file-type-icon";

interface FileMetadata {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

interface FileListProps {
  files: FileMetadata[];
  onDelete: (id: string) => void;
  loading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function FileList({ files, onDelete, loading }: FileListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 파일을 삭제하시겠습니까?`)) return;
    setDeletingId(id);
    onDelete(id);
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="bg-surface-200 border border-border rounded-lg p-8">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">파일 목록 로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
      {/* 테이블 헤더 */}
      <div className="grid grid-cols-[1fr_80px_100px_80px] md:grid-cols-[1fr_100px_120px_100px] gap-2 px-4 py-2.5 text-xs text-gray-500 font-medium border-b border-border bg-surface-100">
        <span>파일명</span>
        <span className="text-right">크기</span>
        <span className="text-right">업로드일</span>
        <span className="text-right">액션</span>
      </div>

      {/* 파일 행 */}
      {files.map((file) => (
        <div
          key={file.id}
          className={`grid grid-cols-[1fr_80px_100px_80px] md:grid-cols-[1fr_100px_120px_100px] gap-2 px-4 py-3 items-center border-b border-border/50 hover:bg-surface-300/50 transition-colors ${
            deletingId === file.id ? "opacity-50" : ""
          }`}
        >
          {/* 파일명 + 타입 아이콘 */}
          <div className="flex items-center gap-3 min-w-0">
            <FileTypeIcon mimeType={file.mimeType} size={28} />
            <span className="text-sm text-gray-200 truncate">{file.originalName}</span>
          </div>

          {/* 크기 */}
          <span className="text-xs text-gray-500 text-right">{formatBytes(file.size)}</span>

          {/* 업로드일 */}
          <span className="text-xs text-gray-500 text-right">{formatDate(file.uploadedAt)}</span>

          {/* 액션 버튼 */}
          <div className="flex items-center justify-end gap-1">
            {/* 다운로드 */}
            <a
              href={`/api/filebox/${file.id}`}
              download
              className="p-1.5 rounded-md text-gray-500 hover:text-brand hover:bg-brand/10 transition-colors"
              title="다운로드"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>

            {/* 삭제 */}
            <button
              onClick={() => handleDelete(file.id, file.originalName)}
              disabled={deletingId === file.id}
              className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="삭제"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
