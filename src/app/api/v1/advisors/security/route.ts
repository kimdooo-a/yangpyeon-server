import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runSecurityRules } from "@/lib/advisors/runner";

export const GET = withRole(["ADMIN"], async () => {
  try {
    const findings = await runSecurityRules();
    return successResponse({ findings, generatedAt: new Date().toISOString() });
  } catch (err) {
    return errorResponse(
      "ADVISOR_FAILED",
      err instanceof Error ? err.message : "보안 어드바이저 실행 실패",
      500
    );
  }
});
