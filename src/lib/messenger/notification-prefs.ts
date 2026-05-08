/**
 * Notification preferences pure logic — M6.
 *
 * Backend zod `updateNotificationPrefsSchema` 의 HHMM_RE 와 동일 정규식.
 * UI 사전 검증 + DnD 윈도우 현재 활성 여부 표시 보조.
 */

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHMM(s: string): boolean {
  return HHMM_RE.test(s);
}

export function normalizeHHMM(s: string): string {
  return s.trim();
}

/**
 * 현재 시각 (HH:MM) 이 DnD 윈도우 내부인지.
 * 야간 wrap (예: 22:00~07:00) 지원 — start > end 면 자정 cross 로 간주.
 * dndStart === dndEnd 는 0폭 윈도우 (의미 없음) → false.
 */
export function isInDndWindow(
  nowHHMM: string,
  dndStart: string | null,
  dndEnd: string | null,
): boolean {
  if (!dndStart || !dndEnd) return false;
  if (!isValidHHMM(nowHHMM) || !isValidHHMM(dndStart) || !isValidHHMM(dndEnd)) {
    return false;
  }
  if (dndStart === dndEnd) return false;
  const now = toMinutes(nowHHMM);
  const start = toMinutes(dndStart);
  const end = toMinutes(dndEnd);
  if (start < end) {
    // 주간 윈도 [start, end)
    return now >= start && now < end;
  }
  // 야간 wrap [start, 24:00) ∪ [00:00, end)
  return now >= start || now < end;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
