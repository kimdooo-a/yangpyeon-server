"use client";

import { forwardRef } from "react";

export type InputKind =
  | "text"
  | "number"
  | "checkbox"
  | "datetime-local"
  | "textarea";

export function typeToInput(dataType: string): InputKind {
  const dt = dataType.toLowerCase();
  if (dt === "boolean") return "checkbox";
  if (
    dt === "integer" ||
    dt === "bigint" ||
    dt === "smallint" ||
    dt === "numeric" ||
    dt === "real" ||
    dt === "double precision" ||
    dt.startsWith("decimal")
  ) {
    return "number";
  }
  if (dt.startsWith("timestamp") || dt === "date") return "datetime-local";
  if (dt === "json" || dt === "jsonb" || dt === "text") return "textarea";
  return "text";
}

export interface TypedInputControlProps {
  kind: InputKind;
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  onTab?: (shift: boolean) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  rows?: number;
}

/**
 * 데이터 타입에 맞는 단일 입력 컨트롤.
 * 모달·인라인 셀 공용. 값은 항상 문자열로 다루고 boolean 체크박스만
 * "true"/"false"를 문자열로 유지한다(서버 coerce가 타입 변환 수행).
 */
export const TypedInputControl = forwardRef<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  TypedInputControlProps
>(function TypedInputControl(
  {
    kind,
    value,
    onChange,
    onCommit,
    onCancel,
    onTab,
    autoFocus,
    disabled,
    className,
    rows,
  },
  ref,
) {
  const base =
    "rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none";
  const merged = className ? `${base} ${className}` : base;

  function handleKey(
    e:
      | React.KeyboardEvent<HTMLInputElement>
      | React.KeyboardEvent<HTMLTextAreaElement>
      | React.KeyboardEvent<HTMLSelectElement>,
  ) {
    if (e.key === "Enter" && kind !== "textarea") {
      e.preventDefault();
      onCommit?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    } else if (e.key === "Tab") {
      // 기본 포커스 이동 막지 않고 상위에서 커밋 유도
      onTab?.(e.shiftKey);
    }
  }

  if (kind === "checkbox") {
    return (
      <select
        ref={ref as React.Ref<HTMLSelectElement>}
        value={value || "false"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        disabled={disabled}
        className={merged}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (kind === "textarea") {
    return (
      <textarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={rows ?? 3}
        className={`${merged} font-mono`}
      />
    );
  }
  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      type={kind}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKey}
      autoFocus={autoFocus}
      disabled={disabled}
      className={merged}
    />
  );
});
