"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { PageHeader } from "@/components/ui/page-header";
import { IconAudit, IconDownload } from "@/components/ui/icons";

// ── 타입 ──────────────────────────────────────────────
interface AuditLog {
  timestamp: string;
  action: string;
  method: string;
  path: string;
  ip: string;
  status?: number;
  userAgent?: string;
  detail?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ── 액션 필터 목록 ───────────────────────────────────
const ACTION_OPTIONS = [
  "RATE_LIMITED",
  "CORS_BLOCKED",
  "CSRF_BLOCKED",
  "PM2_CONTROL",
  "IP_BLOCKED",
  "FILEBOX_UPLOAD",
  "FILEBOX_DELETE",
] as const;

// ── 상태코드 배지 색상 ───────────────────────────────
function statusBadge(code?: number) {
  if (!code) return null;
  let color = "bg-gray-100 text-gray-700";
  if (code >= 200 && code < 300) color = "bg-emerald-50 text-emerald-700";
  else if (code >= 400 && code < 500) color = "bg-yellow-50 text-yellow-700";
  else if (code >= 500) color = "bg-red-50 text-red-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${color}`}>
      {code}
    </span>
  );
}

// ── 날짜 포맷 ─────────────────────────────────────────
function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

// ── 컬럼 정의 ─────────────────────────────────────────
const columns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "timestamp",
    header: "시간",
    cell: ({ getValue }) => (
      <span className="text-xs font-mono text-gray-500 whitespace-nowrap">
        {formatTime(getValue<string>())}
      </span>
    ),
  },
  {
    accessorKey: "action",
    header: "액션",
    cell: ({ getValue }) => (
      <span className="text-xs font-medium text-gray-800">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: "method",
    header: "메서드",
    cell: ({ getValue }) => {
      const m = getValue<string>();
      const color =
        m === "GET"
          ? "text-blue-600"
          : m === "POST"
          ? "text-emerald-600"
          : m === "DELETE"
          ? "text-red-600"
          : "text-gray-500";
      return <span className={`text-xs font-mono font-bold ${color}`}>{m}</span>;
    },
  },
  {
    accessorKey: "path",
    header: "경로",
    cell: ({ getValue }) => (
      <span className="text-xs font-mono text-gray-500 truncate max-w-[200px] block">
        {getValue<string>()}
      </span>
    ),
  },
  {
    accessorKey: "ip",
    header: "IP",
    cell: ({ getValue }) => (
      <span className="text-xs font-mono text-gray-500">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "상태",
    cell: ({ getValue }) => statusBadge(getValue<number | undefined>()),
  },
];

// ── 내보내기 함수 ─────────────────────────────────────
function exportCsv(logs: AuditLog[]) {
  const header = "시간,액션,메서드,경로,IP,상태코드\n";
  const rows = logs
    .map(
      (l) =>
        `"${l.timestamp}","${l.action}","${l.method}","${l.path}","${l.ip}","${l.status ?? ""}"`
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `audit-logs-${todayStr()}.csv`);
}

function exportJson(logs: AuditLog[]) {
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  downloadBlob(blob, `audit-logs-${todayStr()}.json`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── 메인 페이지 ───────────────────────────────────────
export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // 필터 상태
  const [filterAction, setFilterAction] = useState("");
  const [filterIp, setFilterIp] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // 데이터 조회
  const fetchData = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "50");
        if (filterAction) params.set("action", filterAction);
        if (filterIp) params.set("ip", filterIp);
        if (filterFrom) params.set("from", filterFrom);
        if (filterTo) params.set("to", filterTo);

        const res = await fetch(`/api/audit?${params.toString()}`);
        const json = await res.json();
        setLogs(json.logs ?? []);
        setPagination(
          json.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 0 }
        );
      } catch {
        // 다음 갱신에서 재시도
      } finally {
        setLoading(false);
      }
    },
    [filterAction, filterIp, filterFrom, filterTo]
  );

  // 초기 로드 + 필터 변경 시 다시 조회
  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  // 내보내기용 전체 데이터 조회
  const fetchAllForExport = async (): Promise<AuditLog[]> => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", "500");
    if (filterAction) params.set("action", filterAction);
    if (filterIp) params.set("ip", filterIp);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);

    const res = await fetch(`/api/audit?${params.toString()}`);
    const json = await res.json();
    return json.logs ?? [];
  };

  // TanStack Table 인스턴스
  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination.totalPages,
  });

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <PageHeader title="감사 로그" description="시스템 접근 · 보안 이벤트 기록">
        <div className="flex items-center gap-2">
          <button
            onClick={async () => exportCsv(await fetchAllForExport())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-300 text-gray-700 border border-border rounded-md hover:bg-surface-200 hover:text-gray-900 transition-colors"
          >
            <IconDownload size={14} />
            CSV
          </button>
          <button
            onClick={async () => exportJson(await fetchAllForExport())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-surface-300 text-gray-700 border border-border rounded-md hover:bg-surface-200 hover:text-gray-900 transition-colors"
          >
            <IconDownload size={14} />
            JSON
          </button>
        </div>
      </PageHeader>

      {/* 필터 행 */}
      <div className="flex flex-wrap items-end gap-3">
        {/* 액션 필터 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">액션</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-surface-300 border border-border rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-brand"
          >
            <option value="">전체</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* IP 검색 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">IP</label>
          <input
            type="text"
            placeholder="IP 검색..."
            value={filterIp}
            onChange={(e) => setFilterIp(e.target.value)}
            className="bg-surface-300 border border-border rounded-md px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-brand w-40"
          />
        </div>

        {/* 기간 필터 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">시작일</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="bg-surface-300 border border-border rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-brand"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">종료일</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="bg-surface-300 border border-border rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:border-brand"
          />
        </div>

        {/* 필터 초기화 */}
        <button
          onClick={() => {
            setFilterAction("");
            setFilterIp("");
            setFilterFrom("");
            setFilterTo("");
          }}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          초기화
        </button>

        {/* 총 건수 */}
        <div className="ml-auto flex items-center gap-2">
          <IconAudit size={14} className="text-gray-500" />
          <span className="text-xs text-gray-500">
            총 {pagination.total.toLocaleString()}건
          </span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-surface-200 border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                // 로딩 스켈레톤
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {columns.map((_, ci) => (
                      <td key={ci} className="px-4 py-3">
                        <div className="h-4 bg-surface-300 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-gray-500 text-sm"
                  >
                    감사 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border hover:bg-surface-300 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {pagination.page} / {pagination.totalPages} 페이지
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchData(pagination.page - 1)}
              className="px-3 py-1.5 text-sm bg-surface-300 text-gray-700 border border-border rounded-md hover:bg-surface-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              이전
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchData(pagination.page + 1)}
              className="px-3 py-1.5 text-sm bg-surface-300 text-gray-700 border border-border rounded-md hover:bg-surface-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
