import { NextRequest } from "next/server";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { withRole } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { getBackupsDir, sanitizeBackupFilename, backupsEnabled } from "@/lib/backup/paths";
import { writeAuditLog } from "@/lib/audit-log";

type RouteContext = { params: Promise<{ filename: string }> };

export const GET = withRole(["ADMIN"], async (request: NextRequest, user, context) => {
  if (!backupsEnabled()) {
    return errorResponse("BACKUPS_DISABLED", "백업 기능이 비활성화되어 있습니다", 403);
  }

  const { filename: raw } = await (context as RouteContext).params;
  const safe = sanitizeBackupFilename(decodeURIComponent(raw));
  if (!safe) {
    return errorResponse("INVALID_FILENAME", "허용되지 않은 파일명입니다", 400);
  }

  const filePath = path.join(getBackupsDir(), safe);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return errorResponse("NOT_FOUND", "파일을 찾을 수 없습니다", 404);
  }

  writeAuditLog({
    timestamp: new Date().toISOString(),
    method: "GET",
    path: `/api/v1/backups/${safe}/download`,
    ip: request.headers.get("x-forwarded-for") ?? "unknown",
    action: "DB_BACKUP_DOWNLOAD",
    detail: `${user.email} -> ${safe}`,
  });

  const nodeStream = createReadStream(filePath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
        );
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      "content-type": "application/gzip",
      "content-length": String(stat.size),
      "content-disposition": `attachment; filename="${safe}"`,
      "cache-control": "no-store",
    },
  });
});
