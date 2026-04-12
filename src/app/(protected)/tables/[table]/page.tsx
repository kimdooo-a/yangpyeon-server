"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Table2 } from "lucide-react";
import { TableDataGrid } from "@/components/table-editor/table-data-grid";

export default function TableDetailPage({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const { table } = use(params);

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
      </header>

      <div className="min-h-0 flex-1">
        <TableDataGrid table={table} />
      </div>
    </div>
  );
}
