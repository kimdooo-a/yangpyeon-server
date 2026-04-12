import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { createBackup, listBackups, backupsEnabled } from "@/lib/backup/pgdump";
import { writeAuditLog } from "@/lib/audit-log";

export const GET = withRole(["ADMIN"], async () => {
  try {
    const files = await listBackups();
    return successResponse({
      files,
      enabled: backupsEnabled(),
    });
  } catch (err) {
    return errorResponse(
      "LIST_FAILED",
      err instanceof Error ? err.message : "목록 조회 실패",
      500
    );
  }
});

export const POST = withRole(["ADMIN"], async (request: NextRequest, user) => {
  if (!backupsEnabled()) {
    return errorResponse(
      "BACKUPS_DISABLED",
      "백업 기능이 비활성화되어 있습니다. ENABLE_DB_BACKUPS=true 환경변수를 설정하세요.",
      403
    );
  }

  try {
    const file = await createBackup();
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: "POST",
      path: "/api/v1/backups",
      ip: request.headers.get("x-forwarded-for") ?? "unknown",
      action: "DB_BACKUP_CREATE",
      detail: `${user.email} -> ${file.filename} (${file.sizeBytes}B)`,
    });
    return successResponse(file, 201);
  } catch (err) {
    return errorResponse(
      "BACKUP_FAILED",
      err instanceof Error ? err.message : "백업 실패",
      500
    );
  }
});
