import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const message = typeof value.message === "string" ? value.message : "";
    const details = typeof value.details === "string" ? value.details : "";
    const hint = typeof value.hint === "string" ? value.hint : "";
    const code = typeof value.code === "string" ? value.code : "";
    const parts = [message, details, hint].filter(Boolean);
    if (parts.length) return code ? `${parts.join(" ")}（錯誤代碼：${code}）` : parts.join(" ");
  }
  return fallback;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const memberId = String(body.memberId ?? "").trim();
    const groupBuyId = String(body.groupBuyId ?? "").trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (!memberId || !groupBuyId || !rawItems.length) {
      return NextResponse.json({ error: "訂單資料不完整" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("id", memberId)
      .is("deleted_at", null)
      .single();
    if (memberError) throw memberError;
    if (!member) return NextResponse.json({ error: "找不到團員資料，請重新登入。" }, { status: 400 });

    const { data: group, error: groupError } = await supabase
      .from("group_buys")
      .select("id,status,end_at")
      .eq("id", groupBuyId)
      .single();
    if (groupError) throw groupError;
    if (!group) return NextResponse.json({ error: "找不到團購" }, { status: 404 });
    if (group.status !== "open" || new Date(group.end_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "團購已截止，無法下單" }, { status: 400 });
    }

    const items = rawItems
      .map((item: { productId?: unknown; quantity?: unknown }) => ({
        productId: String(item.productId ?? "").trim(),
        quantity: Number(item.quantity ?? 0),
      }))
      .filter((item: { productId: string; quantity: number }) => item.quantity > 0);

    if (!items.length || items.some((item: { productId: string; quantity: number }) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 0)) {
      return NextResponse.json({ error: "商品數量不正確" }, { status: 400 });
    }

    const productIds = [...new Set(items.map((item: { productId: string }) => item.productId))];
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,quantity,max_quantity")
      .eq("group_buy_id", groupBuyId)
      .in("id", productIds);
    if (productError) throw productError;
    if ((products ?? []).length !== productIds.length) {
      return NextResponse.json({ error: "包含不存在或不屬於本團購的商品" }, { status: 400 });
    }

    for (const item of items) {
      const product = (products ?? []).find((p) => p.id === item.productId);
      if (product?.max_quantity != null && item.quantity > Number(product.max_quantity)) {
        return NextResponse.json({ error: `商品限購數量為 ${product.max_quantity}` }, { status: 400 });
      }
    }

    const { data: existingOrder, error: existingOrderError } = await supabase
      .from("orders")
      .select("id")
      .eq("group_buy_id", groupBuyId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;

    let orderId = existingOrder?.id;

    if (orderId) {
      const { error: deleteItemsError } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);
      if (deleteItemsError) throw deleteItemsError;
    } else {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({ group_buy_id: groupBuyId, member_id: memberId })
        .select("id")
        .single();
      if (orderError) throw orderError;
      if (!order?.id) throw new Error("訂單建立後沒有取得訂單編號");
      orderId = order.id;
    }

    const { error: itemError } = await supabase
      .from("order_items")
      .insert(items.map((item: { productId: string; quantity: number }) => ({
        order_id: orderId,
        product_id: item.productId,
        quantity: item.quantity,
      })));
    if (itemError) throw itemError;

    return NextResponse.json({ data: { orderId } }, { status: existingOrder ? 200 : 201 });
  } catch (error) {
    console.error("POST /api/orders", error);
    return NextResponse.json({ error: getErrorMessage(error, "訂單建立失敗") }, { status: 400 });
  }
}
