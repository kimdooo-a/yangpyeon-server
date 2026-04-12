import type { LogDrain } from "@/generated/prisma/client";
import type { LogDrainEntry, LogDrainDeliveryResult } from "@/lib/types/supabase-clone";

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][]; // [ns_timestamp, line]
}

function toNs(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return String(Date.now() * 1_000_000);
  return String(ms * 1_000_000);
}

/**
 * Grafana Loki push API
 * POST <url>/loki/api/v1/push
 */
export async function deliverLoki(
  drain: Pick<LogDrain, "url" | "authHeader">,
  entries: LogDrainEntry[]
): Promise<LogDrainDeliveryResult> {
  const byLabel = new Map<string, LokiStream>();
  for (const e of entries) {
    const labels = { level: e.level, source: e.source };
    const key = JSON.stringify(labels);
    if (!byLabel.has(key)) {
      byLabel.set(key, { stream: labels, values: [] });
    }
    const line =
      e.metadata && Object.keys(e.metadata).length > 0
        ? `${e.message} ${JSON.stringify(e.metadata)}`
        : e.message;
    byLabel.get(key)!.values.push([toNs(e.timestamp), line]);
  }

  const body = { streams: Array.from(byLabel.values()) };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "ypserver-logdrain/1.0",
  };
  if (drain.authHeader) headers["authorization"] = drain.authHeader;

  // URL이 이미 /loki/api/v1/push 를 포함하지 않으면 자동 부착
  const endpoint = drain.url.includes("/loki/api/v1/push")
    ? drain.url
    : drain.url.replace(/\/$/, "") + "/loki/api/v1/push";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
