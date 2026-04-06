"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconFilebox, IconSearch } from "@/components/ui/icons";
import { FileUploadZone } from "@/components/filebox/file-upload-zone";
import { FileList } from "@/components/filebox/file-list";

interface FileMetadata {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

interface StorageUsage {
  used: number;
  limit: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function FileboxPage() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"date" | "name" | "size">("date");

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/filebox?sort=${sort}&order=desc`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files);
        setUsage(data.usage);
      }
    } catch {
      // 네트워크 오류 무시
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/filebox/${id}`, { method: "DELETE" });
    if (res.ok) fetchFiles();
  };

  // 검색 필터
  const filtered = search
    ? files.filter((f) => f.originalName.toLowerCase().includes(search.toLowerCase()))
    : files;

  return (
    <div className="space-y-6">
      <PageHeader title="파일박스" description="파일 업로드 및 관리">
        {usage && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-300 border border-border rounded-md">
              <span className="text-gray-500">사용량</span>
              <span className="text-gray-300 font-medium">
                {formatBytes(usage.used)} / {formatBytes(usage.limit)}
              </span>
            </div>
            {/* 사용량 바 */}
            <div className="w-16 h-1.5 bg-surface-300 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.used / usage.limit > 0.8 ? "bg-red-400" : "bg-brand"
                }`}
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </PageHeader>

      {/* 업로드 영역 */}
      <FileUploadZone onUploadComplete={fetchFiles} />

      {/* 검색 + 정렬 툴바 */}
      {files.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* 검색 */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              type="text"
              placeholder="파일명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-surface-300 border border-border rounded-md text-sm text-gray-200 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
            />
          </div>

          {/* 정렬 */}
          <div className="flex items-center gap-1 text-xs">
            {(["date", "name", "size"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${
                  sort === s
                    ? "bg-brand/10 text-brand"
                    : "text-gray-500 hover:text-gray-300 hover:bg-surface-300"
                }`}
              >
                {{ date: "날짜", name: "이름", size: "크기" }[s]}
              </button>
            ))}
          </div>

          {/* 파일 수 */}
          <span className="text-xs text-gray-600">
            {filtered.length}개 파일
          </span>
        </div>
      )}

      {/* 파일 목록 또는 빈 상태 */}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<IconFilebox size={32} />}
          message={search ? "검색 결과가 없습니다" : "업로드된 파일이 없습니다"}
          description={search ? "다른 검색어를 입력해보세요" : "위 영역에 파일을 드래그하여 업로드하세요"}
        />
      ) : (
        <FileList files={filtered} onDelete={handleDelete} loading={loading} />
      )}
    </div>
  );
}
