import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const memberId = String(body.memberId ?? "");
    const groupBuyId = String(body.groupBuyId ?? "");
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!memberId || !groupBuyId || !rawItems.length) return NextResponse.json({ error: "訂單資料不完整" }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data: member } = await supabase.from("members").select("id").eq("id", memberId).is("deleted_at", null).single();
    if (!member) return NextResponse.json({ error: "找不到團員資料" }, { status: 400 });
    const { data: group, error: groupError } = await supabase.from("group_buys").select("id,status,end_at").eq("id", groupBuyId).single();
    if (groupError || !group) return NextResponse.json({ error: "找不到團購" }, { status: 404 });
    if (group.status !== "open" || new Date(group.end_at).getTime() <= Date.now()) return NextResponse.json({ error: "團購已截止，無法下單" }, { status: 400 });
    const items = rawItems.map((item: { productId?: unknown; quantity?: unknown }) => ({ productId: String(item.productId ?? ""), quantity: Number(item.quantity ?? 0) })).filter((item: { productId: string; quantity: number }) => item.quantity > 0);
    if (!items.length || items.some((item: { productId: string; quantity: number }) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 0)) return NextResponse.json({ error: "商品數量不正確" }, { status: 400 });
    const productIds = items.map((item: { productId: string }) => item.productId);
    const { data: products, error: productError } = await supabase.from("products").select("id,quantity,max_quantity").eq("group_buy_id", groupBuyId).in("id", productIds);
    if (productError) throw productError;
    if ((products ?? []).length !== productIds.length) return NextResponse.json({ error: "包含不存在的商品" }, { status: 400 });
    for (const item of items) { const product = (products ?? []).find((p) => p.id === item.productId); if (product?.max_quantity != null && item.quantity > Number(product.max_quantity)) return NextResponse.json({ error: `商品限購數量為 ${product.max_quantity}` }, { status: 400 }); }
    const { data: existingOrder } = await supabase.from("orders").select("id").eq("group_buy_id", groupBuyId).eq("member_id", memberId).maybeSingle();
    let orderId = existingOrder?.id;
    if (orderId) { const { error } = await supabase.from("order_items").delete().eq("order_id", orderId); if (error) throw error; }
    else { const { data: order, error } = await supabase.from("orders").insert({ group_buy_id: groupBuyId, member_id: memberId }).select("id").single(); if (error) throw error; orderId = order.id; }
    const { error: itemError } = await supabase.from("order_items").insert(items.map((item: { productId: string; quantity: number }) => ({ order_id: orderId, product_id: item.productId, quantity: item.quantity }))); if (itemError) throw itemError;
    return NextResponse.json({ data: { orderId } }, { status: existingOrder ? 200 : 201 });
  } catch (error) { console.error("POST /api/orders", error); return NextResponse.json({ error: error instanceof Error ? error.message : "訂單建立失敗" }, { status: 400 }); }
}
