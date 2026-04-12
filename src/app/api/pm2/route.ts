import { NextResponse } from "next/server";
import { getPm2List } from "@/lib/pm2-metrics";
import { requireSessionApi } from "@/lib/auth-guard";

// 타입 re-export (기존 import 호환)
export type { Pm2Process } from "@/lib/pm2-metrics";

export async function GET() {
  const auth = await requireSessionApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ processes: getPm2List() });
}
