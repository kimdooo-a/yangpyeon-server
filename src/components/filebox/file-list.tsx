"use client";

import { useState } from "react";
import { FileTypeIcon } from "./file-type-icon";

interface FileItem {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

interface FileListProps {
  files: FileItem[];
  onDelete: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function FileList({ files, onDelete }: FileListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (files.length === 0) return null;

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 파일을 삭제하시겠습니까?`)) return;
    setDeletingId(id);
    onDelete(id);
    setDeletingId(null);
  };

  return (
    <div className="space-y-0.5">
      {files.map((file) => (
        <div
          key={file.id}
          className={`group flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-surface-300 transition-colors ${
            deletingId === file.id ? "opacity-50" : ""
          }`}
        >
          <FileTypeIcon mimeType={file.mimeType} size={28} />
          <span className="text-sm text-gray-800 flex-1 truncate">{file.originalName}</span>
          <span className="text-xs text-gray-400 hidden sm:block w-16 text-right">{formatBytes(file.size)}</span>
          <span className="text-xs text-gray-400 hidden sm:block w-20 text-right">
            {new Date(file.createdAt).toLocaleDateString("ko")}
          </span>

          {/* 다운로드 + 삭제 */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
            <a
              href={`/api/v1/filebox/files/${file.id}`}
              download
              className="p-1.5 rounded text-gray-500 hover:text-brand hover:bg-brand/10 transition-colors"
              title="다운로드"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
            <button
              onClick={() => handleDelete(file.id, file.originalName)}
              disabled={deletingId === file.id}
              className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
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
