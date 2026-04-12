import type { LogDrain } from "@/generated/prisma/client";
import type { LogDrainEntry, LogDrainDeliveryResult } from "@/lib/types/supabase-clone";
import { deliverHttp } from "./http";
import { deliverLoki } from "./loki";

/**
 * LogDrain 유형별 디스패처
 * - HTTP, WEBHOOK → deliverHttp (같은 포맷)
 * - LOKI → deliverLoki (Loki push API)
 */
export async function deliver(
  drain: Pick<LogDrain, "url" | "authHeader" | "type">,
  entries: LogDrainEntry[]
): Promise<LogDrainDeliveryResult> {
  if (entries.length === 0) {
    return { delivered: 0, failed: 0 };
  }
  switch (drain.type) {
    case "LOKI":
      return deliverLoki(drain, entries);
    case "HTTP":
    case "WEBHOOK":
    default:
      return deliverHttp(drain, entries);
  }
}
