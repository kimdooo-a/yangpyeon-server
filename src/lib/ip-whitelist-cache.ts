// IP 화이트리스트 인메모리 캐시 — Edge Runtime 호환 (미들웨어에서 import 가능)
// audit-log.ts의 buffer 패턴과 동일: 같은 프로세스에서 모듈 레벨 변수 공유

let cachedIps: Set<string> = new Set();
let enabled = false;
let loaded = false;

/**
 * 캐시 갱신 — API Route에서 CRUD 후 호출
 */
export function setWhitelistCache(ips: string[], isEnabled: boolean) {
  cachedIps = new Set(ips);
  enabled = isEnabled;
  loaded = true;
}

/**
 * IP 허용 여부 확인 — 미들웨어에서 호출
 * - 비활성 상태면 모든 IP 허용
 * - 화이트리스트 비어있으면 모든 IP 허용 (잠금 방지)
 * - 캐시 미로드 시 통과 (안전 기본값)
 */
export function isIpAllowed(ip: string): boolean {
  if (!loaded || !enabled || cachedIps.size === 0) return true;
  return cachedIps.has(ip);
}

/**
 * 캐시 로드 여부
 */
export function isCacheLoaded(): boolean {
  return loaded;
}
