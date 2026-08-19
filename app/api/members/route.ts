import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function normalizeEmployeeId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) throw new Error("工號只能輸入數字");
  if (raw.length > 5) throw new Error("工號最多只能 5 位數字");
  return raw.padStart(5, "0");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = normalizeEmployeeId(body.employeeId);
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "請輸入姓名" }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: existing, error: findError } = await supabase
      .from("members")
      .select("id,employee_id,name,deleted_at")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      if (existing.deleted_at) {
        return NextResponse.json({ error: `工號 ${employeeId} 的成員資料目前已被管理員刪除，請聯絡管理員恢復後再登入。` }, { status: 403 });
      }
      if (existing.name !== name) {
        return NextResponse.json({ error: `工號 ${employeeId} 已經有成員資料，請確認姓名是否正確。` }, { status: 409 });
      }
      return NextResponse.json({ data: { id: existing.id, employeeId: existing.employee_id, name: existing.name }, existing: true });
    }

    const { data: member, error: insertError } = await supabase
      .from("members")
      .insert({ employee_id: employeeId, name })
      .select("id,employee_id,name")
      .single();
    if (insertError) {
      if (insertError.code === "23505") return NextResponse.json({ error: `工號 ${employeeId} 已經存在，請重新整理後再試。` }, { status: 409 });
      throw insertError;
    }

    return NextResponse.json({ data: { id: member.id, employeeId: member.employee_id, name: member.name }, existing: false }, { status: 201 });
  } catch (error) {
    console.error("POST /api/members", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "成員資料建立失敗" }, { status: 400 });
  }
}
