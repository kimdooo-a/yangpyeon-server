/**
 * Phase 14b: 클라이언트 폼 문자열 → PG 타입별 값 변환.
 * `information_schema.columns.data_type` 문자열을 기반으로 분기한다.
 */

export class CoercionError extends Error {
  constructor(
    public column: string,
    public reason: string,
  ) {
    super(`coerce failed: ${column} — ${reason}`);
    this.name = "CoercionError";
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `information_schema.columns.data_type` 값 예:
 *  "integer", "bigint", "smallint", "numeric", "boolean",
 *  "text", "character varying", "uuid",
 *  "timestamp with time zone", "timestamp without time zone", "date",
 *  "json", "jsonb"
 */
export function coerceValue(
  column: string,
  dataType: string,
  raw: unknown,
): unknown {
  const dt = dataType.toLowerCase();

  // null pass-through (action="null")
  if (raw === null) return null;

  // 정수
  if (dt === "integer" || dt === "bigint" || dt === "smallint") {
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new CoercionError(column, `정수가 아닙니다 (${String(raw)})`);
    }
    return n;
  }

  // numeric / real / double — 문자열 그대로 전달(정밀도 보존)
  if (
    dt === "numeric" ||
    dt === "real" ||
    dt === "double precision" ||
    dt.startsWith("decimal")
  ) {
    const s = String(raw).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) {
      throw new CoercionError(column, `유효한 숫자 형식이 아닙니다 (${s})`);
    }
    return s;
  }

  // bool
  if (dt === "boolean") {
    if (raw === true || raw === false) return raw;
    const s = String(raw).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "t") return true;
    if (s === "false" || s === "0" || s === "f") return false;
    throw new CoercionError(column, `boolean으로 변환 불가 (${s})`);
  }

  // uuid
  if (dt === "uuid") {
    const s = String(raw).trim();
    if (!UUID_REGEX.test(s)) {
      throw new CoercionError(column, `UUID 형식이 아닙니다 (${s})`);
    }
    return s;
  }

  // timestamp / date
  if (dt.startsWith("timestamp") || dt === "date") {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) {
      throw new CoercionError(column, `날짜 파싱 실패 (${String(raw)})`);
    }
    return d.toISOString();
  }

  // json / jsonb
  if (dt === "json" || dt === "jsonb") {
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      throw new CoercionError(column, `JSON 파싱 실패`);
    }
  }

  // text / varchar / bpchar / 기타 문자열 — 그대로
  return String(raw);
}
