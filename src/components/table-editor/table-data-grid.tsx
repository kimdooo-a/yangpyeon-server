"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { ColumnTypeBadge } from "./column-type-badge";

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
}

const DEFAULT_LIMIT = 50;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function TableDataGrid({ table }: TableDataGridProps) {
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
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

  const tanstackColumns = useMemo<
    ColumnDef<Record<string, unknown>>[]
  >(() => {
    if (columns.length === 0) return [];
    return columns.map((col) => ({
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
      cell: ({ getValue }) => {
        const v = getValue();
        const text = formatCell(v);
        return (
          <span
            className={`font-mono text-xs ${v === null ? "text-zinc-500 italic" : "text-zinc-200"}`}
            title={text}
          >
            {text.length > 120 ? text.slice(0, 120) + "…" : text}
          </span>
        );
      },
    }));
  }, [columns, orderBy, orderDir]);

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
