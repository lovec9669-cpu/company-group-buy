import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function closeIfExpired(id: string, status: string, endAt: string) {
  if (status === "open" && new Date(endAt).getTime() <= Date.now()) {
    const { data, error } = await getSupabaseAdmin().from("group_buys").update({ status: "closed" }).eq("id", id).eq("status", "open").select("status").single();
    if (!error && data) return data.status;
    return "closed";
  }
  return status;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: group, error: groupError } = await supabase.from("group_buys").select("id,name,description,start_at,end_at,status,created_at").eq("id", id).single();
    if (groupError || !group) return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });

    const now = Date.now();
    const startAt = new Date(group.start_at).getTime();
    if (group.status === "open" && startAt > now) {
      return NextResponse.json({ error: `團購尚未開始，開始時間：${new Date(group.start_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}` }, { status: 400 });
    }

    const status = await closeIfExpired(id, group.status, group.end_at);
    if (status !== "open" && status !== "finalized") {
      return NextResponse.json({ error: "團購目前無法參加" }, { status: 400 });
    }

    const { data: products, error: productError } = await supabase.from("products").select("id,name,description,unit,price,quantity,max_quantity,sort_order,price_group_id").eq("group_buy_id", id).order("sort_order", { ascending: true });
    if (productError) throw productError;
    const { data: groups } = await supabase.from("group_buy_price_groups").select("id,name,sort_order").eq("group_buy_id", id).order("sort_order", { ascending: true });
    const { data: tiers } = await supabase.from("group_buy_price_tiers").select("id,price_group_id,min_quantity,max_quantity,unit_price").eq("group_buy_id", id).order("min_quantity", { ascending: true });
    const productIds = (products ?? []).map((p) => p.id);
    const { data: orders } = productIds.length ? await supabase.from("orders").select("id").eq("group_buy_id", id) : { data: [] };
    const orderIds = (orders ?? []).map((o) => o.id);
    const { data: items } = orderIds.length ? await supabase.from("order_items").select("product_id,quantity").in("order_id", orderIds) : { data: [] };
    const totalByProduct = new Map<string, number>();
    for (const item of items ?? []) totalByProduct.set(item.product_id, (totalByProduct.get(item.product_id) ?? 0) + Number(item.quantity ?? 0));
    const productData = (products ?? []).map((p) => ({ ...p, orderedQuantity: totalByProduct.get(p.id) ?? 0 }));
    let totalAmount = 0;
    if (status === "finalized") {
      const { data: finalItems } = orderIds.length ? await supabase.from("order_items").select("product_id,quantity,final_quantity,final_unit_price,final_amount").in("order_id", orderIds) : { data: [] };
      for (const item of finalItems ?? []) totalAmount += item.final_amount == null ? Number(item.final_quantity ?? item.quantity ?? 0) * Number(item.final_unit_price ?? 0) : Number(item.final_amount);
    }
    return NextResponse.json({ data: { ...group, status, products: productData, priceGroups: groups ?? [], priceTiers: tiers ?? [], totalAmount: status === "finalized" ? totalAmount : null } });
  } catch (error) {
    console.error("GET /api/group-buys/[id]/public", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得團購資料" }, { status: 500 });
  }
}