// IP 화이트리스트 유틸 — Node.js 전용 (API Route에서 사용)
// Edge Runtime에서는 import 금지 (better-sqlite3 사용)

import { getDb } from "@/lib/db";
import { ipWhitelist } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setWhitelistCache } from "@/lib/ip-whitelist-cache";

/**
 * 전체 화이트리스트 조회
 */
export async function getWhitelist() {
  const db = getDb();
  return db.select().from(ipWhitelist).all();
}

/**
 * IP 추가
 */
export async function addIp(ip: string, description?: string) {
  const db = getDb();
  const result = db.insert(ipWhitelist).values({ ip, description }).returning().get();
  await syncCache();
  return result;
}

/**
 * IP 삭제
 */
export async function removeIp(id: number) {
  const db = getDb();
  db.delete(ipWhitelist).where(eq(ipWhitelist.id, id)).run();
  await syncCache();
}

/**
 * IP 허용 여부 (DB 직접 조회 — API Route 내부용)
 * 비어있으면 모든 IP 허용
 */
export async function isIpAllowedFromDb(ip: string): Promise<boolean> {
  const list = await getWhitelist();
  if (list.length === 0) return true;
  return list.some((row) => row.ip === ip);
}

/**
 * 인메모리 캐시 동기화 — CRUD 후 자동 호출
 */
export async function syncCache() {
  const list = await getWhitelist();
  const ips = list.map((row) => row.ip);
  const isEnabled = process.env.IP_WHITELIST_ENABLED === "true";
  setWhitelistCache(ips, isEnabled);
}
