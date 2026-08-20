import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

const transitions: Record<string, { next: string; message: string }> = {
  closed: { next: "reviewing", message: "已確認訂單，開始計算中。" },
  reviewing: { next: "finalized", message: "已發布計算完成，首頁現在可以顯示總訂單金額。" },
};

function getTierPrice(
  product: { price: number | string | null; price_group_id: string | null },
  groupQuantity: number,
  tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[],
) {
  const basePrice = Number(product.price ?? 0);
  if (!product.price_group_id || groupQuantity <= 0) return basePrice;

  const groupTiers = tiers
    .filter((tier) => tier.price_group_id === product.price_group_id)
    .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity));

  const tier = groupTiers.find(
    (item) =>
      groupQuantity >= Number(item.min_quantity) &&
      (item.max_quantity == null || groupQuantity <= Number(item.max_quantity)),
  );

  return tier ? Number(tier.unit_price) : basePrice;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const requestedStatus = String(body.status ?? "").trim();
    const supabase = getSupabaseAdmin();

    const { data: group, error: findError } = await supabase
      .from("group_buys")
      .select("id,status,end_at")
      .eq("id", id)
      .single();
    if (findError || !group) return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });

    const transition = transitions[String(group.status)];
    if (!transition || requestedStatus !== transition.next) {
      return NextResponse.json({ error: "目前團購狀態不允許這個操作" }, { status: 400 });
    }

    // 從「後台計算中」發布成「計算完成」時，把後台計算結果正式寫入訂單明細。
    // 這樣團員首頁的歷史訂單就能直接讀取 final_unit_price / final_amount，
    // 不會再出現後台有金額、團員端卻顯示「待計算」的狀況。
    if (group.status === "reviewing" && transition.next === "finalized") {
      const { data: products, error: productError } = await supabase
        .from("products")
        .select("id,price,price_group_id")
        .eq("group_buy_id", id);
      if (productError) throw productError;

      const productMap = new Map((products ?? []).map((product) => [product.id, product]));
      const priceGroupIds = [...new Set((products ?? []).map((product) => product.price_group_id).filter((value): value is string => Boolean(value)))];

      let tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[] = [];
      if (priceGroupIds.length) {
        const { data: tierRows, error: tierError } = await supabase
          .from("group_buy_price_tiers")
          .select("price_group_id,min_quantity,max_quantity,unit_price")
          .in("price_group_id", priceGroupIds);
        if (tierError) throw tierError;
        tiers = tierRows ?? [];
      }

      const { data: orders, error: orderError } = await supabase
        .from("orders")
        .select("id")
        .eq("group_buy_id", id);
      if (orderError) throw orderError;

      const orderIds = (orders ?? []).map((order) => order.id);
      if (orderIds.length) {
        const { data: items, error: itemError } = await supabase
          .from("order_items")
          .select("id,product_id,quantity")
          .in("order_id", orderIds);
        if (itemError) throw itemError;

        const groupQuantities = new Map<string, number>();
        for (const item of items ?? []) {
          const product = productMap.get(item.product_id);
          if (!product?.price_group_id) continue;
          groupQuantities.set(
            product.price_group_id,
            (groupQuantities.get(product.price_group_id) ?? 0) + Number(item.quantity ?? 0),
          );
        }

        for (const item of items ?? []) {
          const product = productMap.get(item.product_id);
          if (!product) continue;

          const quantity = Number(item.quantity ?? 0);
          const unitPrice = getTierPrice(
            product,
            groupQuantities.get(product.price_group_id ?? "") ?? 0,
            tiers,
          );
          const amount = quantity * unitPrice;

          const { error: updateError } = await supabase
            .from("order_items")
            .update({
              final_quantity: quantity,
              final_unit_price: unitPrice,
              final_amount: amount,
            })
            .eq("id", item.id);
          if (updateError) throw updateError;
        }
      }
    }

    const { data, error } = await supabase
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
