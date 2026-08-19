import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function closeIfExpired(id: string, status: string, endAt: string) {
  if (status === "open" && new Date(endAt).getTime() <= Date.now()) {
    const { data, error } = await getSupabaseAdmin()
      .from("group_buys")
      .update({ status: "closed" })
      .eq("id", id)
      .eq("status", "open")
      .select("status")
      .single();
    if (!error && data) return data.status;
    return "closed";
  }
  return status;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: group, error: groupError } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status,created_at")
      .eq("id", id)
      .single();
    if (groupError || !group) return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });

    const status = await closeIfExpired(id, group.status, group.end_at);
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,name")
      .eq("group_buy_id", id)
      .order("sort_order", { ascending: true });
    if (productError) throw productError;

    let totalAmount = 0;
    const productTotals = new Map<string, { productId: string; productName: string; quantity: number; amount: number }>();

    if (status === "finalized") {
      const { data: orders, error: orderError } = await supabase
        .from("orders")
        .select("id")
        .eq("group_buy_id", id);
      if (orderError) throw orderError;
      const orderIds = (orders ?? []).map((order) => order.id);
      if (orderIds.length) {
        const { data: items, error: itemError } = await supabase
          .from("order_items")
          .select("product_id,quantity,final_quantity,final_unit_price,final_amount")
          .in("order_id", orderIds);
        if (itemError) throw itemError;
        const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));
        for (const item of items ?? []) {
          const quantity = Number(item.final_quantity ?? item.quantity ?? 0);
          const amount = item.final_amount == null ? quantity * Number(item.final_unit_price ?? 0) : Number(item.final_amount);
          const productId = String(item.product_id);
          const current = productTotals.get(productId) ?? { productId, productName: productMap.get(productId) ?? "未知商品", quantity: 0, amount: 0 };
          current.quantity += quantity;
          current.amount += amount;
          productTotals.set(productId, current);
          totalAmount += amount;
        }
      }
    }

    return NextResponse.json({
      data: {
        ...group,
        status,
        products: Array.from(productTotals.values()),
        totalAmount: status === "finalized" ? totalAmount : null,
      },
    });
  } catch (error) {
    console.error("GET /api/group-buys/[id]/public", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得團購狀態" }, { status: 500 });
  }
}
