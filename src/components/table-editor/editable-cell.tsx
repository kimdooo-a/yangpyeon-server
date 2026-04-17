"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TypedInputControl,
  typeToInput,
  type InputKind,
} from "./editable-cell-inputs";

interface EditableCellProps {
  value: unknown;
  dataType: string;
  readOnly: boolean;
  onCommit: (next: string | boolean) => Promise<void> | void;
  /** Tab으로 다음/이전 편집 셀 이동 요청 */
  onTab?: (shift: boolean) => void;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function toEditValue(value: unknown, kind: InputKind): string {
  if (value === null || value === undefined) return "";
  if (kind === "checkbox") {
    return typeof value === "boolean" ? String(value) : String(!!value);
  }
  if (kind === "datetime-local" && typeof value === "string") {
    // PG timestamp ISO → HTML datetime-local 형식 (YYYY-MM-DDTHH:mm)
    const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[1]}T${m[2]}` : value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EditableCell({
  value,
  dataType,
  readOnly,
  onCommit,
  onTab,
}: EditableCellProps) {
  const kind = typeToInput(dataType);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(() => toEditValue(value, kind));
  const [pending, setPending] = useState(false);
  const committedRef = useRef(false);

  // 외부 value 변경 시 draft 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!editing) setDraft(toEditValue(value, kind));
  }, [value, kind, editing]);

  const commit = useCallback(async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const original = toEditValue(value, kind);
    if (draft === original) {
      setEditing(false);
      committedRef.current = false;
      return;
    }
    setPending(true);
    try {
      const payload: string | boolean =
        kind === "checkbox" ? draft === "true" : draft;
      await onCommit(payload);
      setEditing(false);
    } catch {
      // 에러 처리는 훅이 담당(토스트 + 롤백). 여기서는 편집 유지
    } finally {
      setPending(false);
      committedRef.current = false;
    }
  }, [draft, kind, value, onCommit]);

  const cancel = useCallback(() => {
    setDraft(toEditValue(value, kind));
    setEditing(false);
  }, [value, kind]);

  if (readOnly) {
    const text = formatCell(value);
    return (
      <span
        className={`font-mono text-xs ${value === null ? "text-zinc-500 italic" : "text-zinc-200"}`}
        title={text}
      >
        {text.length > 120 ? text.slice(0, 120) + "…" : text}
      </span>
    );
  }

  if (!editing) {
    const text = formatCell(value);
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`w-full cursor-text text-left font-mono text-xs hover:bg-zinc-800/60 ${
          value === null ? "text-zinc-500 italic" : "text-zinc-200"
        }`}
        title={`${text} — 클릭 편집`}
      >
        {text.length > 120 ? text.slice(0, 120) + "…" : text}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <TypedInputControl
        kind={kind}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={cancel}
        onTab={(shift) => {
          void commit();
          onTab?.(shift);
        }}
        autoFocus
        disabled={pending}
        className={`w-full ring-1 ring-amber-500 ${pending ? "opacity-60" : ""}`}
      />
    </div>
  );
}
