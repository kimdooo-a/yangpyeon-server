// 감사 로그 — Edge Runtime 호환 (미들웨어에서 사용)
// DB 관련 코드는 audit-log-db.ts에 분리 (API Route 전용)

export interface AuditEntry {
  timestamp: string;
  method: string;
  path: string;
  ip: string;
  status?: number;
  action?: string;
  userAgent?: string;
  detail?: string;
  // Phase 1.7 (T1.7) ADR-029 §2.2.3 — per-tenant Observability 차원.
  // 선택적 — safeAudit 가 request-context AsyncLocalStorage 에서 자동 주입 (호출자 명시 시 우선).
  // 11 콜사이트는 시그니처 무수정 (ADR-021 §amendment-2).
  tenantId?: string;
  traceId?: string;
}

// 인메모리 버퍼 (미들웨어에서 기록, API Route에서 flush)
const MAX_BUFFER = 500;
export const buffer: AuditEntry[] = [];

/**
 * 감사 로그 기록 (인메모리 — 미들웨어에서 호출)
 */
export function writeAuditLog(entry: AuditEntry): void {
  buffer.push({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }
}

/**
 * 요청에서 클라이언트 IP 추출
 */
export function extractClientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
