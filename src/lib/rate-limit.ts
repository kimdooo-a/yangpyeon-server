// 인메모리 슬라이딩 윈도우 Rate Limiter
// 외부 의존성 없음 (Redis 불필요)

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// 오래된 엔트리 주기적 정리 (메모리 누수 방지)
const CLEANUP_INTERVAL = 60 * 1000; // 1분
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * 슬라이딩 윈도우 Rate Limiter
 * @param key - 식별자 (보통 IP)
 * @param maxRequests - 윈도우 내 최대 요청 수
 * @param windowMs - 윈도우 크기 (ms)
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  cleanup(windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // 윈도우 밖의 타임스탬프 제거
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldest + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: windowMs,
  };
}

// API별 Rate Limit 설정
export const RATE_LIMITS = {
  // 일반 API: 분당 60회
  api: { maxRequests: 60, windowMs: 60 * 1000 },
  // PM2 제어 (restart/stop/start): 분당 10회
  pm2Action: { maxRequests: 10, windowMs: 60 * 1000 },
  // 로그인: 분당 5회 (브루트포스 방지는 login API 자체에도 있음)
  login: { maxRequests: 5, windowMs: 60 * 1000 },
} as const;
