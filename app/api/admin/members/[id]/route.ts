import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin() {
  const cookieStore = await cookies();
  return isValidAdminToken(cookieStore.get(adminCookieName)?.value);
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: member, error: findError } = await supabase
      .from("members")
      .select("id,employee_id,name,deleted_at")
      .eq("id", id)
      .single();
    if (findError || !member) return NextResponse.json({ error: "找不到這位成員" }, { status: 404 });
    if (member.deleted_at) return NextResponse.json({ error: "這位成員已經刪除" }, { status: 400 });

    const { error } = await supabase.from("members").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, data: member });
  } catch (error) {
    console.error("DELETE /api/admin/members/[id]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "刪除成員失敗" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action !== "restore") return NextResponse.json({ error: "無效操作" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: member, error: findError } = await supabase
      .from("members")
      .select("id,employee_id,name,deleted_at")
      .eq("id", id)
      .single();
    if (findError || !member) return NextResponse.json({ error: "找不到這位成員" }, { status: 404 });
    if (!member.deleted_at) return NextResponse.json({ error: "這位成員目前未刪除" }, { status: 400 });

    const { data: restored, error } = await supabase
      .from("members")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,employee_id,name,created_at,deleted_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data: restored });
  } catch (error) {
    console.error("POST /api/admin/members/[id]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "恢復成員失敗" }, { status: 500 });
  }
}
