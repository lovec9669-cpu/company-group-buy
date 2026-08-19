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
    console.error("GET /api/group-buys", error);
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
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();
    const startAt = String(body.startAt ?? "").trim();
    const endAt = String(body.endAt ?? "").trim();

    if (!name || !startAt || !endAt) {
      return NextResponse.json({ error: "請填寫團購名稱、開始時間與結束時間" }, { status: 400 });
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "開始或結束時間格式不正確" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("group_buys")
      .insert({
        name,
        description: description || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        status: "open",
      })
      .select("id,name,description,start_at,end_at,status,created_at")
      .single();

    if (error) {
      console.error("Supabase group_buys insert error", error);
      return NextResponse.json({ error: `建立團購失敗：${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/group-buys", error);
    return NextResponse.json({ error: "建立團購失敗，請稍後再試" }, { status: 500 });
  }
}
