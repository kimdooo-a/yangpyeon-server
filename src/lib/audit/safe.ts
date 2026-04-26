/**
 * audit/safe — withTenant 가드 전용 fail-soft audit 어댑터.
 *
 * 기존 `safeAudit(entry: AuditEntry)` (src/lib/audit-log-db.ts) 는 HTTP 요청 단위
 * (method/path/ip) 의 access-log 모델이다. ADR-027 §9 가 정의하는 신규 이벤트 3종
 *   - cross_tenant_attempt
 *   - key_prefix_mismatch
 *   - tenant_membership_missing
 * 은 도메인 이벤트 모델 (event 명, actor, structured details) 이므로 본 어댑터에서
 * 두 모델을 매핑한다.
 *
 * fail-soft 보장: 내부 호출이 throw 해도 호출자에게 전파하지 않는다 (ADR-021).
 */

import { writeAuditLog, extractClientIp } from "@/lib/audit-log";
import { safeAudit } from "@/lib/audit-log-db";

export interface AuditEvent {
  /** 이벤트 명 (snake_case 권장) — ADR-027 §9 표 참조. */
  event: string;
  /** 행위자 — user.email 또는 시스템 식별자. */
  actor: string;
  /** 추가 구조화 컨텍스트. */
  details?: Record<string, unknown>;
  /** 옵션 — 전달되면 access-log 형태에도 함께 기록. */
  request?: Request;
}

/**
 * fail-soft audit 기록.
 *
 * 1) 인메모리 access-log (writeAuditLog) — 미들웨어/대시보드 buffer 호환.
 * 2) DB 즉시 기록 (safeAudit) — ADR-021 fail-soft 보장.
 *
 * 두 경로 모두 throw 하지 않으며, 본 함수는 항상 resolve 한다.
 */
export async function auditLogSafe(input: AuditEvent): Promise<void> {
  const detail = JSON.stringify({
    actor: input.actor,
    ...(input.details ?? {}),
  });
  const headers = input.request?.headers;
  const ip = headers ? extractClientIp(headers) : "unknown";
  const method = input.request?.method ?? "INTERNAL";
  const url = input.request ? new URL(input.request.url) : null;
  const path = url?.pathname ?? `audit:${input.event}`;
  const userAgent = headers?.get("user-agent") ?? undefined;

  const entry = {
    timestamp: new Date().toISOString(),
    method,
    path,
    ip,
    action: input.event,
    userAgent,
    detail,
  };

  // 1) 인메모리 buffer (Edge 호환 경로) — throw 하지 않음.
  try {
    writeAuditLog(entry);
  } catch {
    // 인메모리 버퍼 실패는 무시 (메모리 부족 등 극한 상황만).
  }

  // 2) DB 직접 기록 — safeAudit 자체가 fail-soft (ADR-021 §amendment-1).
  safeAudit(entry, `tenant-router:${input.event}`);
}
