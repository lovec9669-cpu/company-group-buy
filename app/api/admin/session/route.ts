import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

export async function GET() {
  const cookieStore = await cookies();
  const valid = isValidAdminToken(cookieStore.get(adminCookieName)?.value);
  return NextResponse.json({ authenticated: valid }, { status: valid ? 200 : 401 });
}
