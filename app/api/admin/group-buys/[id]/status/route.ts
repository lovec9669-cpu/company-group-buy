import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

const allowedStatuses = new Set(["closed", "reviewing"]);

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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return String(error ?? "未知錯誤");
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
    if (requestedStatus !== "awaiting_payment") {
      return NextResponse.json({ error: "不支援的團購狀態" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: group, error: findError } = await supabase
      .from("group_buys")
      .select("id,name,status,end_at")
      .eq("id", id)
      .single();

    if (findError || !group) {
      return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });
    }
    if (!allowedStatuses.has(String(group.status))) {
      return NextResponse.json(
        { error: `目前團購狀態為「${group.status}」，不允許發布結果。` },
        { status: 400 },
      );
    }

    // 先計算本次團購的最終單價、數量與金額。
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,price,price_group_id")
      .eq("group_buy_id", id);
    if (productError) {
      throw new Error(`讀取團購商品失敗：${errorMessage(productError)}`);
    }

    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const priceGroupIds = [
      ...new Set(
        (products ?? [])
          .map((product) => product.price_group_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    let tiers: {
      price_group_id: string;
      min_quantity: number;
      max_quantity: number | null;
      unit_price: number | string;
    }[] = [];

    if (priceGroupIds.length) {
      const { data: tierRows, error: tierError } = await supabase
        .from("group_buy_price_tiers")
        .select("price_group_id,min_quantity,max_quantity,unit_price")
        .in("price_group_id", priceGroupIds);
      if (tierError) {
        throw new Error(`讀取團購階梯價格失敗：${errorMessage(tierError)}`);
      }
      tiers = tierRows ?? [];
    }

    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id")
      .eq("group_buy_id", id);
    if (orderError) {
      throw new Error(`讀取團購訂單失敗：${errorMessage(orderError)}`);
    }

    const orderIds = (orders ?? []).map((order) => order.id);
    if (orderIds.length) {
      const { data: items, error: itemError } = await supabase
        .from("order_items")
        .select("id,product_id,quantity")
        .in("order_id", orderIds);
      if (itemError) {
        throw new Error(`讀取訂單明細失敗：${errorMessage(itemError)}`);
      }

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
        const { error: updateItemError } = await supabase
          .from("order_items")
          .update({
            final_quantity: quantity,
            final_unit_price: unitPrice,
            final_amount: amount,
          })
          .eq("id", item.id);
        if (updateItemError) {
          throw new Error(`寫入訂單最終金額失敗：${errorMessage(updateItemError)}`);
        }
      }
    }

    // 不依賴 update(...).select().single()，避免 Supabase 在更新後回傳資料時造成假性失敗。
    const { error: statusError } = await supabase
      .from("group_buys")
      .update({ status: "awaiting_payment" })
      .eq("id", id)
      .in("status", ["closed", "reviewing"]);

    if (statusError) {
      throw new Error(`更新團購狀態失敗：${errorMessage(statusError)}`);
    }

    return NextResponse.json({
      data: { id, name: group.name, status: "awaiting_payment", end_at: group.end_at },
      message: "已發布計算結果，團購已移至「已完成待收款」。",
    });
  } catch (error) {
    console.error("PATCH /api/admin/group-buys/[id]/status", error);
    return NextResponse.json(
      { error: errorMessage(error) || "發布結果失敗" },
      { status: 500 },
    );
  }
}
