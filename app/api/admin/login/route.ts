import { NextResponse } from "next/server";
import { adminCookieName, createAdminToken } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const { password } = await request.json();
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "管理員密碼錯誤" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: adminCookieName,
    value: createAdminToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
