import { NextResponse } from "next/server";
import { V1_REFRESH_COOKIE } from "@/lib/jwt-v1";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(V1_REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/api/v1/",
  });
  return response;
}
