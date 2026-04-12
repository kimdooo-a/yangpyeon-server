import { withRole } from "@/lib/api-guard";
import { successResponse } from "@/lib/api-response";
import { listChannels } from "@/lib/realtime/bus";

export const runtime = "nodejs";

export const GET = withRole(["ADMIN", "MANAGER"], async () => {
  return successResponse(listChannels());
});
