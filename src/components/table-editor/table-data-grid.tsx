"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { ColumnTypeBadge } from "./column-type-badge";
import { EditableCell } from "./editable-cell";
import { useInlineEditMutation } from "./use-inline-edit-mutation";

interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

interface DataResponse {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  pagination: { limit: number; offset: number; total: number };
}

interface TableDataGridProps {
  table: string;
  userRole?: "ADMIN" | "MANAGER" | "USER";
  policy?: { canUpdate: boolean; canDelete: boolean };
  onEditRow?: (row: Record<string, unknown>) => void;
  onDeleteRow?: (row: Record<string, unknown>) => void;
  /** 부모에서 증가 시 강제 재fetch (행 추가/편집/삭제 후 새로고침용) */
  refreshToken?: number;
  /** 읽기 전용 시스템 컬럼 (기본: ["created_at", "updated_at"]) */
  systemColumns?: string[];
  /** 편집 성공 후 로컬 행 병합(옵션). 없으면 refreshToken 증가 방식 유지 */
  onRowPatched?: () => void;
}

const DEFAULT_LIMIT = 50;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function TableDataGrid({
  table,
  policy,
  onEditRow,
  onDeleteRow,
  refreshToken,
  systemColumns = ["created_at", "updated_at"],
  onRowPatched,
}: TableDataGridProps) {
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [primaryKeyName, setPrimaryKeyName] = useState<string | null>(null);
  const [compositePkColumns, setCompositePkColumns] = useState<string[]>([]);
  const [data, setData] = useState<DataResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = DEFAULT_LIMIT;

  const fetchSchema = useCallback(async () => {
    const res = await fetch(`/api/v1/tables/${table}/schema`);
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(body.error?.message ?? "스키마 조회 실패");
    }
    setColumns(body.data.columns);
    setPrimaryKeyName(body.data.primaryKey?.column ?? null);
    setCompositePkColumns(body.data.compositePkColumns ?? []);
  }, [table]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (orderBy) {
        params.set("order", orderBy);
        params.set("dir", orderDir);
      }
      const res = await fetch(`/api/v1/tables/${table}?${params}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message ?? "데이터 조회 실패");
      }
      setData(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [table, limit, offset, orderBy, orderDir]);

  const { submit: submitInlineEdit } = useInlineEditMutation({
    table,
    compositePkColumns,
    onRowUpdated: () => {
      if (onRowPatched) onRowPatched();
      else fetchRows();
    },
    onRowReplaced: () => fetchRows(),
    onRowMissing: () => fetchRows(),
  });

  useEffect(() => {
    setOffset(0);
    setOrderBy(null);
    fetchSchema().catch((err) =>
      setError(err instanceof Error ? err.message : "스키마 오류"),
    );
  }, [table, fetchSchema]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // 부모가 refreshToken을 증가시키면 재fetch (행 추가/편집/삭제 후)
  useEffect(() => {
    if (refreshToken !== undefined && refreshToken > 0) {
      fetchRows();
    }
  }, [refreshToken, fetchRows]);

  const actionColumn = useMemo<ColumnDef<Record<string, unknown>> | null>(() => {
    if (!policy?.canUpdate && !policy?.canDelete) return null;
    return {
      id: "_actions",
      header: () => <span className="text-zinc-500">액션</span>,
      cell: ({ row }) => (
        <div className="flex gap-1">
          {policy?.canUpdate && (
            <button
              type="button"
              onClick={() => onEditRow?.(row.original)}
              className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
            >
              편집
            </button>
          )}
          {policy?.canDelete && (
            <button
              type="button"
              onClick={() => onDeleteRow?.(row.original)}
              className="rounded border border-red-900 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-950"
            >
              삭제
            </button>
          )}
        </div>
      ),
    };
  }, [policy, onEditRow, onDeleteRow]);

  const tanstackColumns = useMemo<
    ColumnDef<Record<string, unknown>>[]
  >(() => {
    if (columns.length === 0) return [];
    const base: ColumnDef<Record<string, unknown>>[] = columns.map((col) => ({
      accessorKey: col.name,
      header: () => (
        <button
          type="button"
          className="group flex w-full items-center gap-1 text-left"
          onClick={() => {
            if (orderBy === col.name) {
              setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
            } else {
              setOrderBy(col.name);
              setOrderDir("asc");
            }
          }}
        >
          <span className="flex items-center gap-1">
            <span className="text-zinc-100">{col.name}</span>
            {col.isPrimaryKey && (
              <span
                className="text-[10px] text-amber-400"
                title="Primary Key"
              >
                PK
              </span>
            )}
          </span>
          <ColumnTypeBadge dataType={col.dataType} />
          {orderBy === col.name && (
            <span className="text-zinc-400">
              {orderDir === "asc" ? "↑" : "↓"}
            </span>
          )}
        </button>
      ),
      cell: ({ getValue, row }) => {
        const v = getValue();
        const isSystem = systemColumns.includes(col.name);
        const isComposite = compositePkColumns.length > 1;
        const isPkCol = isComposite
          ? compositePkColumns.includes(col.name)
          : col.isPrimaryKey;
        const readOnly =
          isPkCol ||
          isSystem ||
          !policy?.canUpdate ||
          (primaryKeyName === null && !isComposite);
        if (readOnly) {
          const text =
            v === null || v === undefined
              ? "NULL"
              : typeof v === "object"
                ? JSON.stringify(v)
                : typeof v === "boolean"
                  ? String(v)
                  : String(v);
          return (
            <span
              className={`font-mono text-xs ${v === null ? "text-zinc-500 italic" : "text-zinc-200"}`}
              title={text}
            >
              {text.length > 120 ? text.slice(0, 120) + "…" : text}
            </span>
          );
        }
        const expectedUpdatedAt = row.original["updated_at"];
        const pkValue =
          !isComposite && primaryKeyName
            ? row.original[primaryKeyName]
            : undefined;
        const pkValuesMap = isComposite
          ? compositePkColumns.reduce<Record<string, unknown>>((acc, c) => {
              acc[c] = row.original[c];
              return acc;
            }, {})
          : undefined;
        return (
          <EditableCell
            value={v}
            dataType={col.dataType}
            readOnly={false}
            onCommit={async (next) => {
              await submitInlineEdit({
                pkValue: pkValue !== undefined ? String(pkValue) : undefined,
                pkValuesMap,
                column: col.name,
                value: next,
                expectedUpdatedAt:
                  typeof expectedUpdatedAt === "string"
                    ? expectedUpdatedAt
                    : expectedUpdatedAt instanceof Date
                      ? expectedUpdatedAt.toISOString()
                      : null,
              });
            }}
          />
        );
      },
    }));
    return actionColumn ? [actionColumn, ...base] : base;
  }, [columns, orderBy, orderDir, actionColumn, policy, primaryKeyName, compositePkColumns, systemColumns, submitInlineEdit]);

  const tableInstance = useReactTable({
    data: data?.rows ?? [],
    columns: tanstackColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const total = data?.pagination.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <div className="text-zinc-300">
          <span className="font-mono text-zinc-100">{table}</span>
          <span className="ml-2 text-zinc-500">
            총 {total.toLocaleString()}행
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            이전
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset(offset + limit)}
            className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded border border-zinc-800">
        {error && (
          <div className="p-4 text-sm text-red-400">오류: {error}</div>
        )}
        {!error && (
          <table className="w-full min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-900">
              {tableInstance.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300"
                    >
                      {flexRender(
                        h.column.columnDef.header,
                        h.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading && !data && (
                <tr>
                  <td
                    colSpan={tanstackColumns.length || 1}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    로딩 중…
                  </td>
                </tr>
              )}
              {!loading && data && data.rows.length === 0 && (
                <tr>
                  <td
                    colSpan={tanstackColumns.length || 1}
                    className="px-3 py-8 text-center text-zinc-500"
                  >
                    데이터 없음
                  </td>
                </tr>
              )}
              {tableInstance.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-900/50">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="border-b border-zinc-900 px-3 py-1.5 align-top"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
