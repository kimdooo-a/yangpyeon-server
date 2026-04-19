/**
 * Phase 15-D 보강 (세션 38) — 활성 세션 UX 개선 유틸.
 *
 * 두 pure function 을 분리:
 *   1. `shouldTouch` — lastUsedAt 디바운스. GET /sessions 요청마다 DB 쓰기 방지.
 *   2. `parseUserAgent` — raw UA 를 사람 읽기 쉬운 "Chrome 130 · Windows" 로 변환.
 *
 * 두 함수 모두 순수 — 외부 상태 참조·DB 접근·시간 Side Effect 없음 (now 는 주입).
 * 단위 테스트는 `activity.test.ts` 에 선행 작성 (TDD).
 */

/**
 * GET /api/v1/auth/sessions 마다 touchSessionLastUsed 를 호출하면
 * 1인 사용자도 페이지 탐색 시 수 초 간격으로 UPDATE 가 발생해 DB 쓰기 낭비.
 * 기본 1분 디바운스: 마지막 업데이트 후 60초 이상 지났을 때만 touch.
 */
export const TOUCH_THROTTLE_MS = 60_000;

/**
 * @returns true 이면 호출자는 `touchSessionLastUsed` 호출 / false 이면 skip.
 * 시계 역행(now < lastUsedAt) 은 diff 음수 → threshold 미달 → false.
 */
export function shouldTouch(
  lastUsedAt: Date,
  now: Date = new Date(),
  thresholdMs: number = TOUCH_THROTTLE_MS,
): boolean {
  const diff = now.getTime() - lastUsedAt.getTime();
  return diff >= thresholdMs;
}

/**
 * 브라우저 + OS 를 추출한 간결 문자열. UA 파싱 라이브러리 의존 제거 —
 * 필요 범위는 "Chrome/Firefox/Safari/Edge × Windows/macOS/Linux/iOS/Android"
 * + curl 뿐. ua-parser-js (~20KB) 는 과투자.
 *
 * 예:
 *   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/130..." → "Chrome 130 · Windows"
 *   "Mozilla/5.0 (Macintosh; Intel Mac OS X ...) ... Chrome/130..."   → "Chrome 130 · macOS"
 *   "Mozilla/5.0 (iPhone; ...) ... Version/17.0 ... Safari/..."        → "Safari 17 · iOS"
 *   "Mozilla/5.0 (X11; Linux x86_64) ... Firefox/134.0"               → "Firefox 134 · Linux"
 *   "curl/8.5.0"                                                       → "curl 8"
 *   null / ""                                                          → "알 수 없음"
 *   아무것도 매칭 안 될 때                                              → "기타 브라우저 · 기타 OS"
 */
export function parseUserAgent(raw: string | null | undefined): string {
  if (!raw) return "알 수 없음";

  const edge = raw.match(/Edg\/(\d+)/);
  const chrome = !edge ? raw.match(/Chrome\/(\d+)/) : null;
  const firefox = raw.match(/Firefox\/(\d+)/);
  const hasSafari = !chrome && !edge && /Safari\//.test(raw);
  const safariVersion = hasSafari ? raw.match(/Version\/(\d+)/) : null;
  const curl = raw.match(/^curl\/(\d+)/i);

  let browser: string;
  if (edge) browser = `Edge ${edge[1]}`;
  else if (chrome) browser = `Chrome ${chrome[1]}`;
  else if (firefox) browser = `Firefox ${firefox[1]}`;
  else if (safariVersion) browser = `Safari ${safariVersion[1]}`;
  else if (curl) return `curl ${curl[1]}`;
  else browser = "기타 브라우저";

  let os: string;
  if (/iPhone|iPad|iPod/.test(raw)) os = "iOS";
  else if (/Android/.test(raw)) os = "Android";
  else if (/Mac OS X/.test(raw)) os = "macOS";
  else if (/Windows/.test(raw)) os = "Windows";
  else if (/Linux/.test(raw)) os = "Linux";
  else os = "기타 OS";

  return `${browser} · ${os}`;
}
