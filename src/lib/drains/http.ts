import type { LogDrain } from "@/generated/prisma/client";
import type { LogDrainEntry, LogDrainDeliveryResult } from "@/lib/types/supabase-clone";

/**
 * 일반 HTTP drain — JSON POST로 entries 전송
 */
export async function deliverHttp(
  drain: Pick<LogDrain, "url" | "authHeader">,
  entries: LogDrainEntry[]
): Promise<LogDrainDeliveryResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "ypserver-logdrain/1.0",
  };
  if (drain.authHeader) {
    headers["authorization"] = drain.authHeader;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(drain.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ entries }),
      signal: controller.signal,
      redirect: "manual",
    });
    if (!res.ok) {
      return {
        delivered: 0,
        failed: entries.length,
        error: `HTTP ${res.status}`,
      };
    }
    return { delivered: entries.length, failed: 0 };
  } catch (err) {
    return {
      delivered: 0,
      failed: entries.length,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
