import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const employeeId = new URL(request.url).searchParams.get("employeeId")?.trim() ?? "";
    if (!/^\d{5}$/.test(employeeId)) return NextResponse.json({ error: "工號格式不正確" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .single();
    if (memberError || !member) return NextResponse.json({ data: [] });

    // 與管理員後台使用同一個團購狀態來源。
    // 只要團購時間已到，這裡也會立即把 open 更新成 closed，
    // 避免首頁與後台因為讀取先後順序不同而顯示不同狀態。
    const { data: openGroups, error: openGroupsError } = await supabase
      .from("group_buys")
      .select("id,end_at")
      .eq("status", "open");
    if (openGroupsError) throw openGroupsError;

    const expiredIds = (openGroups ?? [])
      .filter((group) => new Date(group.end_at).getTime() <= Date.now())
      .map((group) => group.id);

    if (expiredIds.length) {
      const { error: closeError } = await supabase
        .from("group_buys")
        .update({ status: "closed" })
        .in("id", expiredIds)
        .eq("status", "open");
      if (closeError) throw closeError;
    }

    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id,group_buy_id,created_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false });
    if (orderError) throw orderError;

    const result = [];
    for (const order of orders ?? []) {
      const { data: group } = await supabase
        .from("group_buys")
        .select("id,name,start_at,end_at,status")
        .eq("id", order.group_buy_id)
        .single();

      const { data: items, error: itemError } = await supabase
        .from("order_items")
        .select("product_id,quantity,final_quantity,final_unit_price,final_amount")
        .eq("order_id", order.id);
      if (itemError) throw itemError;

      const productIds = (items ?? []).map((item) => item.product_id);
      const { data: products } = productIds.length
        ? await supabase.from("products").select("id,name,unit").in("id", productIds)
        : { data: [] };
      const productMap = new Map((products ?? []).map((p) => [p.id, p]));

      const orderItems = (items ?? []).map((item) => ({
        productId: item.product_id,
        productName: productMap.get(item.product_id)?.name ?? "商品",
        unit: productMap.get(item.product_id)?.unit ?? "",
        quantity: Number(item.final_quantity ?? item.quantity ?? 0),
        finalAmount: item.final_amount == null ? null : Number(item.final_amount),
      }));

      result.push({
        ...order,
        group,
        items: orderItems,
        // 最終金額只有後台發布 finalized 後才算正式完成。
        isFinalized: group?.status === "finalized",
      });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("GET /api/my-orders", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得訂單" }, { status: 500 });
  }
}
