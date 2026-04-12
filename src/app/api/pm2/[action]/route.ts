import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import { pm2ActionParamSchema, pm2ActionBodySchema } from "@/lib/schemas";
import { requireRoleApi } from "@/lib/auth-guard";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const auth = await requireRoleApi("ADMIN");
  if (auth.response) return auth.response;

  const paramParsed = pm2ActionParamSchema.safeParse(await params);
  if (!paramParsed.success) {
    return NextResponse.json({ error: "허용되지 않는 액션" }, { status: 400 });
  }
  const { action } = paramParsed.data;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const bodyParsed = pm2ActionBodySchema.safeParse(body);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: bodyParsed.error.issues[0]?.message ?? "잘못된 프로세스 이름" }, { status: 400 });
  }
  const { name } = bodyParsed.data;

  try {
    // execFileSync: 쉘 해석 없이 직접 실행 → 명령어 주입 불가
    execFileSync("pm2", [action, name], {
      encoding: "utf-8",
      timeout: 10000,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "명령 실행 실패" }, { status: 500 });
  }
}
