import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

const transitions: Record<string, { next: string; message: string }> = {
  closed: { next: "reviewing", message: "已確認訂單，開始計算中。" },
  reviewing: { next: "finalized", message: "已發布計算完成，首頁現在可以顯示總訂單金額。" },
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const requestedStatus = String(body.status ?? "").trim();
    const { data: group, error: findError } = await getSupabaseAdmin()
      .from("group_buys")
      .select("id,status,end_at")
      .eq("id", id)
      .single();
    if (findError || !group) return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });

    const transition = transitions[String(group.status)];
    if (!transition || requestedStatus !== transition.next) {
      return NextResponse.json({ error: "目前團購狀態不允許這個操作" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("group_buys")
      .update({ status: transition.next })
      .eq("id", id)
      .select("id,name,status,start_at,end_at,created_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ data, message: transition.message });
  } catch (error) {
    console.error("PATCH /api/admin/group-buys/[id]/status", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新團購狀態失敗" }, { status: 500 });
  }
}
