import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data: openGroups, error: openError } = await supabase.from("group_buys").select("id,end_at").eq("status", "open");
    if (openError) throw openError;
    const expiredIds = (openGroups ?? []).filter((group) => new Date(group.end_at).getTime() <= Date.now()).map((group) => group.id);
    if (expiredIds.length) {
      const { error: closeError } = await supabase.from("group_buys").update({ status: "closed" }).in("id", expiredIds).eq("status", "open");
      if (closeError) throw closeError;
    }

    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status");
    const statusFilter = requestedStatus === "closed" ? ["closed"] : ["reviewing", "finalized"];

    const { data: groups, error: groupError } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status,created_at")
      .in("status", statusFilter)
      .order("end_at", { ascending: false });
    if (groupError) throw groupError;

    const result = [];
    for (const group of groups ?? []) {
      const { data: products, error: productError } = await supabase.from("products").select("id,name").eq("group_buy_id", group.id).order("sort_order", { ascending: true });
      if (productError) throw productError;
      const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));
      const { data: orders, error: orderError } = await supabase.from("orders").select("id").eq("group_buy_id", group.id);
      if (orderError) throw orderError;
      const orderIds = (orders ?? []).map((order) => order.id);
      const rows = new Map<string, { productId: string; productName: string; quantity: number; finalAmount: number }>();
      if (orderIds.length) {
        const { data: items, error: itemError } = await supabase.from("order_items").select("order_id,product_id,quantity,final_quantity,final_unit_price,final_amount").in("order_id", orderIds);
        if (itemError) throw itemError;
        for (const item of items ?? []) {
          const quantity = Number(item.final_quantity ?? item.quantity ?? 0);
          const unitPrice = Number(item.final_unit_price ?? 0);
          const finalAmount = item.final_amount == null ? quantity * unitPrice : Number(item.final_amount);
          const productId = String(item.product_id);
          const current = rows.get(productId) ?? { productId, productName: productMap.get(item.product_id) ?? "未知商品", quantity: 0, finalAmount: 0 };
          current.quantity += quantity; current.finalAmount += finalAmount; rows.set(productId, current);
        }
      }
      result.push({ ...group, products: Array.from(rows.values()) });
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("GET /api/admin/history", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得團購資料" }, { status: 500 });
  }
}
