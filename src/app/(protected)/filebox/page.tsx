"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconFilebox, IconNewFolder } from "@/components/ui/icons";
import { Breadcrumb } from "@/components/filebox/breadcrumb";
import { FolderList } from "@/components/filebox/folder-list";
import { FileList } from "@/components/filebox/file-list";
import { FileUploadZone } from "@/components/filebox/file-upload-zone";
import { NewFolderDialog } from "@/components/filebox/new-folder-dialog";

interface FolderItem {
  id: string;
  name: string;
  createdAt: string;
}

interface FileItem {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function FileboxPage() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState("");
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);

  // 폴더 내용 조회
  const fetchContents = useCallback(async (folderId?: string) => {
    setLoading(true);
    try {
      const query = folderId ? `?parentId=${folderId}` : "";
      const res = await fetch(`/api/v1/filebox/folders${query}`);
      if (res.ok) {
        const { data } = await res.json();
        setCurrentFolderId(data.currentFolder.id);
        setCurrentFolderName(data.currentFolder.name);
        setBreadcrumb(data.breadcrumb);
        setFolders(data.folders);
        setFiles(data.files);
      }
    } catch {
      // 네트워크 오류
    } finally {
      setLoading(false);
    }
  }, []);

  // 사용량 조회
  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/filebox/usage");
      if (res.ok) {
        const { data } = await res.json();
        setUsage(data);
      }
    } catch { /* 무시 */ }
  }, []);

  useEffect(() => {
    fetchContents();
    fetchUsage();
  }, [fetchContents, fetchUsage]);

  // 폴더 탐색
  const navigateTo = (folderId: string) => {
    fetchContents(folderId);
  };

  // 새 폴더 생성
  const handleCreateFolder = async (name: string) => {
    const res = await fetch("/api/v1/filebox/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: currentFolderId }),
    });
    if (res.ok) {
      setShowNewFolder(false);
      fetchContents(currentFolderId ?? undefined);
    } else {
      const { error } = await res.json();
      alert(error?.message || "폴더 생성 실패");
    }
  };

  // 폴더 이름 변경
  const handleRenameFolder = async (folderId: string, currentName: string) => {
    const newName = prompt("새 이름을 입력하세요", currentName);
    if (!newName || newName === currentName) return;

    const res = await fetch(`/api/v1/filebox/folders/${folderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      fetchContents(currentFolderId ?? undefined);
    } else {
      const { error } = await res.json();
      alert(error?.message || "이름 변경 실패");
    }
  };

  // 폴더 삭제
  const handleDeleteFolder = async (folderId: string, name: string) => {
    if (!confirm(`"${name}" 폴더와 내부 파일을 모두 삭제하시겠습니까?`)) return;

    const res = await fetch(`/api/v1/filebox/folders/${folderId}`, { method: "DELETE" });
    if (res.ok) {
      fetchContents(currentFolderId ?? undefined);
      fetchUsage();
    }
  };

  // 파일 삭제
  const handleDeleteFile = async (fileId: string) => {
    const res = await fetch(`/api/v1/filebox/files/${fileId}`, { method: "DELETE" });
    if (res.ok) {
      fetchContents(currentFolderId ?? undefined);
      fetchUsage();
    }
  };

  // 업로드 완료
  const handleUploadComplete = () => {
    fetchContents(currentFolderId ?? undefined);
    fetchUsage();
  };

  const isEmpty = !loading && folders.length === 0 && files.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader title="파일박스" description="파일 업로드 및 폴더 관리">
        {usage && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-300 border border-border rounded-md">
              <span className="text-gray-500">사용량</span>
              <span className="text-gray-700 font-medium">
                {formatBytes(usage.used)} / {formatBytes(usage.limit)}
              </span>
            </div>
            <div className="w-16 h-1.5 bg-surface-300 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.used / usage.limit > 0.8 ? "bg-red-500" : "bg-brand"
                }`}
                style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </PageHeader>

      {/* 브레드크럼 + 액션 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Breadcrumb items={breadcrumb} onNavigate={navigateTo} />
        <button
          onClick={() => setShowNewFolder(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-300 border border-border rounded-md text-gray-700 hover:text-brand hover:border-brand/30 transition-colors"
        >
          <IconNewFolder size={14} />
          <span>새 폴더</span>
        </button>
      </div>

      {/* 폴더 목록 */}
      <FolderList
        folders={folders}
        onNavigate={navigateTo}
        onRename={handleRenameFolder}
        onDelete={handleDeleteFolder}
      />

      {/* 폴더와 파일 사이 구분선 */}
      {folders.length > 0 && files.length > 0 && (
        <div className="border-t border-border/30" />
      )}

      {/* 파일 목록 */}
      <FileList files={files} onDelete={handleDeleteFile} />

      {/* 빈 상태 */}
      {isEmpty && (
        <EmptyState
          icon={<IconFilebox size={32} />}
          message="폴더가 비어있습니다"
          description="파일을 업로드하거나 새 폴더를 만들어보세요"
        />
      )}

      {/* 로딩 */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-surface-200 border border-border rounded-lg px-4 py-3"
            >
              <div className="h-5 w-5 bg-surface-300 rounded animate-pulse shrink-0" />
              <div className="h-4 bg-surface-300 rounded animate-pulse flex-1 max-w-xs" />
              <div className="h-3 w-20 bg-surface-300 rounded animate-pulse" />
              <div className="h-3 w-14 bg-surface-300 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* 업로드 영역 */}
      {currentFolderId && !loading && (
        <FileUploadZone folderId={currentFolderId} onUploadComplete={handleUploadComplete} />
      )}

      {/* 새 폴더 다이얼로그 */}
      <NewFolderDialog
        open={showNewFolder}
        onClose={() => setShowNewFolder(false)}
        onConfirm={handleCreateFolder}
      />
    </div>
  );
}
