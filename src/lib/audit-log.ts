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
