"use client";

import { useState, useMemo, useEffect } from "react";
import { typeToInput, TypedInputControl } from "./editable-cell-inputs";

interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

type Action = "set" | "null" | "keep";
interface CellState {
  action: Action;
  value: string;
}

interface RowFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  table: string;
  columns: ColumnMeta[];
  initialRow?: Record<string, unknown>;
  primaryKey: { column: string; dataType: string } | null;
  onClose: () => void;
  onSubmitted: () => void;
}

function defaultCellState(
  _col: ColumnMeta,
  initial: unknown,
  mode: "create" | "edit",
): CellState {
  if (mode === "create") {
    return { action: "keep", value: "" };
  }
  // edit 모드: 현재 값 기준 "keep" (변경 없음)
  if (initial === null || initial === undefined) {
    return { action: "keep", value: "" };
  }
  const str =
    typeof initial === "object"
      ? JSON.stringify(initial)
      : typeof initial === "boolean"
        ? String(initial)
        : String(initial);
  return { action: "keep", value: str };
}

export function RowFormModal({
  open,
  mode,
  table,
  columns,
  initialRow,
  primaryKey,
  onClose,
  onSubmitted,
}: RowFormModalProps) {
  const [state, setState] = useState<Record<string, CellState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s: Record<string, CellState> = {};
    for (const col of columns) {
      s[col.name] = defaultCellState(col, initialRow?.[col.name], mode);
    }
    setState(s);
    setError(null);
  }, [open, columns, initialRow, mode]);

  const editable = useMemo(
    () =>
      columns.filter((c) => {
        // 편집 모드에서 PK는 비편집 (UPDATE 대상 제외)
        if (mode === "edit" && c.isPrimaryKey) return false;
        return true;
      }),
    [columns, mode],
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const values: Record<string, { action: "set" | "null"; value?: unknown }> = {};
      for (const [col, st] of Object.entries(state)) {
        if (st.action === "keep") continue;
        if (st.action === "null") {
          values[col] = { action: "null" };
          continue;
        }
        const colMeta = columns.find((c) => c.name === col);
        const input = typeToInput(colMeta?.dataType ?? "text");
        if (input === "checkbox") {
          values[col] = { action: "set", value: st.value === "true" };
        } else {
          values[col] = { action: "set", value: st.value };
        }
      }

      const url =
        mode === "create"
          ? `/api/v1/tables/${table}`
          : `/api/v1/tables/${table}/${encodeURIComponent(String(initialRow?.[primaryKey!.column]))}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message ?? "요청 실패");
      }
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "실패");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[min(720px,95vw)] max-h-[85vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {mode === "create" ? "행 추가" : "행 편집"} — <span className="font-mono">{table}</span>
        </h2>

        <div className="space-y-3">
          {editable.map((col) => {
            const st = state[col.name];
            if (!st) return null;
            const input = typeToInput(col.dataType);
            return (
              <div key={col.name} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-mono text-zinc-200">{col.name}</span>
                  <span className="text-zinc-500">{col.dataType}</span>
                  {col.isPrimaryKey && <span className="text-amber-400">PK</span>}
                  {!col.nullable && <span className="text-red-400">required</span>}
                  {col.defaultValue && (
                    <span className="text-zinc-600">default: {col.defaultValue}</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={st.action}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        [col.name]: { ...st, action: e.target.value as Action },
                      }))
                    }
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="keep">유지</option>
                    <option value="set">값 입력</option>
                    {col.nullable && <option value="null">NULL</option>}
                  </select>
                  {st.action === "set" && (
                    <TypedInputControl
                      kind={input}
                      value={st.value}
                      onChange={(next) =>
                        setState((p) => ({
                          ...p,
                          [col.name]: { ...st, value: next },
                        }))
                      }
                      className={input === "checkbox" ? "" : "flex-1"}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="mt-3 text-sm text-red-400">오류: {error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {submitting ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
