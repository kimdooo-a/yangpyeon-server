import { NextResponse } from "next/server";
import { collectSystemMetrics } from "@/lib/system-metrics";

export async function GET() {
  return NextResponse.json(collectSystemMetrics());
}
