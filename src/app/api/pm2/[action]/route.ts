import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";

const ALLOWED_ACTIONS = ["restart", "stop", "start"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  if (!ALLOWED_ACTIONS.includes(action as (typeof ALLOWED_ACTIONS)[number])) {
    return NextResponse.json({ error: "허용되지 않는 액션" }, { status: 400 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const name = body.name;

  if (typeof name !== "string" || !/^[\w-]+$/.test(name) || name.length > 64) {
    return NextResponse.json({ error: "잘못된 프로세스 이름" }, { status: 400 });
  }

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
