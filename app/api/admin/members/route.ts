import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName)?.value;
  if (!isValidAdminToken(token)) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("members")
      .select("id, employee_id, name, created_at")
      .order("employee_id", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/members", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法讀取成員名單" },
      { status: 500 }
    );
  }
}
