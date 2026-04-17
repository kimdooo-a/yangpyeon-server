"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Table2 } from "lucide-react";
import { TableDataGrid } from "@/components/table-editor/table-data-grid";
import { RowFormModal } from "@/components/table-editor/row-form-modal";

interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

export default function TableDetailPage({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const { table } = use(params);

  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [primaryKey, setPrimaryKey] = useState<{
    column: string;
    dataType: string;
  } | null>(null);
  const [compositePk, setCompositePk] = useState(false);
  const [userRole, setUserRole] = useState<"ADMIN" | "MANAGER" | "USER">(
    "USER",
  );
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    fetch(`/api/v1/tables/${table}/schema`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) {
          setColumns(body.data.columns);
          setPrimaryKey(body.data.primaryKey);
          setCompositePk(body.data.compositePk);
        }
      });
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((body) => {
        if (body.success && body.user?.role) setUserRole(body.user.role);
      });
  }, [table]);

  // policy: 클라이언트 힌트 (UX용). 서버 table-policy가 최종 권한.
  const FULL_BLOCK = ["users", "api_keys", "_prisma_migrations"];
  const DELETE_ONLY = ["edge_function_runs"];
  const blocked = FULL_BLOCK.includes(table);
  const deleteOnly = DELETE_ONLY.includes(table);
  const hasPk = primaryKey !== null && !compositePk;

  const canInsert =
    !blocked && !deleteOnly && hasPk &&
    (userRole === "ADMIN" || userRole === "MANAGER");
  const canUpdate =
    !blocked && !deleteOnly && hasPk &&
    (userRole === "ADMIN" || userRole === "MANAGER");
  const canDelete = !blocked && hasPk && userRole === "ADMIN";

  const handleDelete = useCallback(
    async (row: Record<string, unknown>) => {
      if (!primaryKey) return;
      const pkVal = row[primaryKey.column];
      if (!confirm(`${table}(pk=${pkVal}) 행을 삭제합니다. 계속하시겠습니까?`))
        return;
      const res = await fetch(
        `/api/v1/tables/${table}/${encodeURIComponent(String(pkVal))}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        alert(`삭제 실패: ${body.error?.message ?? "오류"}`);
        return;
      }
      setRefreshToken((t) => t + 1);
    },
    [table, primaryKey],
  );

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/tables"
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft size={14} /> 목록
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <Table2 size={18} />
          <span className="font-mono">{table}</span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {blocked && (
            <span className="text-xs text-zinc-500">
              Table Editor에서 편집 불가 (전용 페이지 사용)
            </span>
          )}
          {!blocked && !hasPk && (
            <span className="text-xs text-amber-400">
              {compositePk
                ? "복합 PK 테이블 — Phase 14b 미지원"
                : "PK 없는 테이블 — 편집 불가"}
            </span>
          )}
          {canInsert && (
            <button
              type="button"
              onClick={() => {
                setEditingRow(null);
                setModalMode("create");
              }}
              className="flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              <Plus size={14} /> 행 추가
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <TableDataGrid
          table={table}
          userRole={userRole}
          policy={{ canUpdate, canDelete }}
          refreshToken={refreshToken}
          onEditRow={(row) => {
            setEditingRow(row);
            setModalMode("edit");
          }}
          onDeleteRow={handleDelete}
        />
      </div>

      <RowFormModal
        open={modalMode !== null}
        mode={modalMode ?? "create"}
        table={table}
        columns={columns}
        initialRow={editingRow ?? undefined}
        primaryKey={primaryKey}
        onClose={() => {
          setModalMode(null);
          setEditingRow(null);
        }}
        onSubmitted={() => setRefreshToken((t) => t + 1)}
      />
    </div>
  );
}
