import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function requireAdmin() {
  const cookieStore = await cookies();
  return isValidAdminToken(cookieStore.get(adminCookieName)?.value);
}

async function getTotalsByMember() {
  const supabase = getSupabaseAdmin();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id,member_id")
    .not("member_id", "is", null);
  if (ordersError) throw ordersError;

  const orderRows = orders ?? [];
  const orderIds = orderRows.map((order) => order.id);
  const totals = new Map<string, number>();
  if (!orderIds.length) return totals;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("order_id,quantity,final_quantity,final_unit_price,final_amount")
    .in("order_id", orderIds);
  if (itemsError) throw itemsError;

  const memberByOrder = new Map(orderRows.map((order) => [order.id, order.member_id as string]));
  for (const item of items ?? []) {
    const memberId = memberByOrder.get(item.order_id);
    if (!memberId) continue;
    const quantity = Number(item.final_quantity ?? item.quantity ?? 0);
    const unitPrice = Number(item.final_unit_price ?? 0);
    const amount = item.final_amount == null ? quantity * unitPrice : Number(item.final_amount);
    totals.set(memberId, (totals.get(memberId) ?? 0) + amount);
  }
  return totals;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "未授權" }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("members")
      .select("id, employee_id, name, created_at, deleted_at")
      .order("employee_id", { ascending: true });
    if (error) throw error;

    const totals = await getTotalsByMember();
    const rows = (data ?? []).map((member) => ({
      ...member,
      totalAmount: totals.get(member.id) ?? 0,
    }));

    return NextResponse.json({
      data: rows.filter((member) => !member.deleted_at),
      deleted: rows.filter((member) => Boolean(member.deleted_at)),
    });
  } catch (error) {
    console.error("GET /api/admin/members", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法讀取成員名單" },
      { status: 500 }
    );
  }
}
