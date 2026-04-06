import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { getFilePath, deleteFile } from "@/lib/filebox";
import { fileboxIdSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// 파일 다운로드
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = fileboxIdSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 파일 ID" }, { status: 400 });
  }

  const result = await getFilePath(id);
  if (!result) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다" }, { status: 404 });
  }

  const buffer = await fs.readFile(result.filePath);
  const encodedName = encodeURIComponent(result.metadata.originalName);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": result.metadata.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(result.metadata.size),
    },
  });
}

// 파일 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = fileboxIdSchema.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 파일 ID" }, { status: 400 });
  }

  try {
    await deleteFile(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "삭제 실패";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
