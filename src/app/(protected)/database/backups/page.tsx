"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconRefresh } from "@/components/ui/icons";
import { toast } from "sonner";

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function BackupsPage() {
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/backups");
      const json = await res.json();
      if (json.success) {
        setFiles(json.data.files);
        setEnabled(json.data.enabled);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/v1/backups", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        toast.success(`백업 완료: ${json.data.filename}`);
        fetchAll();
      } else {
        toast.error(json.error?.message ?? "백업 실패");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="DB 백업"
        description="pg_dump 기반 SQL 백업 파일을 관리합니다 (ADMIN 전용)"
      >
        <button
          disabled={!enabled || creating}
          onClick={create}
          className="px-3 py-2 bg-brand text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "생성 중…" : "새 백업 생성"}
        </button>
        <button onClick={fetchAll} className="p-2 hover:bg-surface-300 rounded-lg text-gray-500">
          <IconRefresh size={16} />
        </button>
      </PageHeader>

      {!enabled && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          프로덕션 환경에서는 DB 백업이 비활성화되어 있습니다. 로컬/개발 환경에서만 사용하세요.
          (환경변수 <code>ENABLE_DB_BACKUPS=true</code> 필요)
        </div>
      )}

      <div className="mt-4 bg-surface-200 border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-gray-500">
              <th className="px-4 py-3 font-medium">파일명</th>
              <th className="px-4 py-3 font-medium">크기</th>
              <th className="px-4 py-3 font-medium">생성일</th>
              <th className="px-4 py-3 font-medium text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-gray-400">로딩…</td></tr>
            ) : files.length === 0 ? (
              <tr><td colSpan={4} className="p-0">
                <EmptyState message="백업 파일이 없습니다" description="상단에서 백업을 생성하세요" />
              </td></tr>
            ) : files.map((f) => (
              <tr key={f.filename} className="border-b border-border hover:bg-surface-300">
                <td className="px-4 py-3 font-mono text-xs">{f.filename}</td>
                <td className="px-4 py-3 text-gray-600">{formatBytes(f.sizeBytes)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(f.createdAt).toLocaleString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`/api/v1/backups/${encodeURIComponent(f.filename)}/download`}
                    className="text-xs px-2 py-1 bg-surface-100 border border-border rounded hover:bg-surface-300 inline-block"
                  >
                    다운로드
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
