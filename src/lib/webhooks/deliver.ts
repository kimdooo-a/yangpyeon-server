import type { Webhook } from "@/generated/prisma/client";
import type { WebhookDeliveryResult } from "@/lib/types/supabase-clone";

/**
 * Private IP 차단 정규식
 * - 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16
 * - localhost, ::1, fe80::/10 (link-local)
 */
const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^::1$/,
  /^fe80:/i,
  /^fc[0-9a-f]{2}:/i, // ULA
  /^fd[0-9a-f]{2}:/i,
  /^0\.0\.0\.0$/,
];

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return PRIVATE_HOST_PATTERNS.some((p) => p.test(h));
}

export function validateWebhookUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "URL 형식이 올바르지 않습니다" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "HTTPS 프로토콜만 허용됩니다" };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, error: "내부(private) IP/호스트로는 전송할 수 없습니다" };
  }
  return { ok: true, url };
}

/**
 * 웹훅 전송. HTTPS + Private IP 차단 + 5초 타임아웃.
 */
export async function deliver(
  webhook: Pick<Webhook, "url" | "headers" | "secret">,
  payload: unknown
): Promise<WebhookDeliveryResult> {
  const start = Date.now();
  const validation = validateWebhookUrl(webhook.url);
  if (!validation.ok) {
    return { ok: false, error: validation.error, durationMs: Date.now() - start };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "ypserver-webhook/1.0",
  };

  if (webhook.headers && typeof webhook.headers === "object") {
    for (const [k, v] of Object.entries(webhook.headers as Record<string, unknown>)) {
      if (typeof v === "string") headers[k.toLowerCase()] = v;
    }
  }

  if (webhook.secret) {
    headers["x-webhook-secret"] = webhook.secret;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(validation.url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: "manual",
    });
    return {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - start,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: msg,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
