// 감사 로그: Edge Runtime 호환 (fs 미사용)
// 미들웨어에서 인메모리 버퍼에 저장, API로 조회/플러시 가능

export interface AuditEntry {
  timestamp: string;
  method: string;
  path: string;
  ip: string;
  status?: number;
  action?: string;
}

const MAX_ENTRIES = 500;
const buffer: AuditEntry[] = [];

/**
 * 감사 로그 기록 (인메모리)
 */
export function writeAuditLog(entry: AuditEntry): void {
  buffer.push({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });

  // 오래된 엔트리 제거
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

/**
 * 감사 로그 조회 (최근 N건)
 */
export function getAuditLogs(limit = 100): AuditEntry[] {
  return buffer.slice(-limit).reverse();
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
