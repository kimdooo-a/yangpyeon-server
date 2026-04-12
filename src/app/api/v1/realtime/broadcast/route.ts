import { NextRequest } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { publish } from "@/lib/realtime/bus";

export const runtime = "nodejs";

const bodySchema = z.object({
  channel: z.string().trim().min(1).max(120),
  event: z.string().trim().min(1).max(80),
  payload: z.unknown().optional(),
});

export const POST = withRole(["ADMIN", "MANAGER"], async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "잘못된 요청 형식", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "검증 실패", 400);
  }
  const msg = publish(parsed.data.channel, parsed.data.event, parsed.data.payload ?? null);
  return successResponse(msg);
});
