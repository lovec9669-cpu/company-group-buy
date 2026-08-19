import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status,created_at")
      .order("start_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "無法取得團購資料" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName)?.value;

  if (!isValidAdminToken(token)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, startAt, endAt } = body;

    if (!name || !startAt || !endAt) {
      return NextResponse.json({ error: "請填寫團購名稱、開始時間與結束時間" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("group_buys")
      .insert({
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        start_at: startAt,
        end_at: endAt,
        status: "open",
      })
      .select("id,name,description,start_at,end_at,status,created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "建立團購失敗" }, { status: 500 });
  }
}
