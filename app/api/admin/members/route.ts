import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type Product = {
  id: string;
  price: number | string | null;
  price_group_id: string | null;
};

type PriceTier = {
  price_group_id: string;
  min_quantity: number;
  max_quantity: number | null;
  unit_price: number | string;
};

async function requireAdmin() {
  const cookieStore = await cookies();
  return isValidAdminToken(cookieStore.get(adminCookieName)?.value);
}

function getTierPrice(
  product: Product,
  groupQuantity: number,
  tiers: PriceTier[],
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

async function getTotalsByMember() {
  const supabase = getSupabaseAdmin();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id,member_id,group_buy_id")
    .not("member_id", "is", null);
  if (ordersError) throw ordersError;

  const orderRows = orders ?? [];
  const orderIds = orderRows.map((order) => order.id);
  const totals = new Map<string, number>();
  if (!orderIds.length) return totals;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("order_id,product_id,quantity,final_quantity,final_unit_price,final_amount")
    .in("order_id", orderIds);
  if (itemsError) throw itemsError;

  const rawItems = (items ?? []).map((item) => ({
    orderId: item.order_id as string,
    memberId: orderRows.find((order) => order.id === item.order_id)?.member_id as string | null,
    groupBuyId: orderRows.find((order) => order.id === item.order_id)?.group_buy_id as string | null,
    productId: item.product_id as string,
    quantity: Number(item.quantity ?? 0),
    finalQuantity: item.final_quantity == null ? null : Number(item.final_quantity),
    finalUnitPrice: item.final_unit_price == null ? null : Number(item.final_unit_price),
    finalAmount: item.final_amount == null ? null : Number(item.final_amount),
  }));

  const productIds = [...new Set(rawItems.map((item) => item.productId))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id,price,price_group_id")
    .in("id", productIds);
  if (productsError) throw productsError;

  const productMap = new Map((products ?? []).map((product) => [product.id, product as Product]));
  const priceGroupIds = [
    ...new Set(
      (products ?? [])
        .map((product) => product.price_group_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let tiers: PriceTier[] = [];
  if (priceGroupIds.length) {
    const { data: tierRows, error: tierError } = await supabase
      .from("group_buy_price_tiers")
      .select("price_group_id,min_quantity,max_quantity,unit_price")
      .in("price_group_id", priceGroupIds);
    if (tierError) throw tierError;
    tiers = (tierRows ?? []) as PriceTier[];
  }

  // Price tiers are determined from the total quantity of the same
  // price-group within each group-buy, matching the admin history page.
  const groupQuantities = new Map<string, number>();
  for (const item of rawItems) {
    const product = productMap.get(item.productId);
    if (!product?.price_group_id || !item.groupBuyId) continue;
    const key = `${item.groupBuyId}:${product.price_group_id}`;
    groupQuantities.set(key, (groupQuantities.get(key) ?? 0) + item.quantity);
  }

  const memberByOrder = new Map(
    orderRows.map((order) => [order.id, order.member_id as string]),
  );
  const groupByOrder = new Map(
    orderRows.map((order) => [order.id, order.group_buy_id as string]),
  );

  for (const item of rawItems) {
    const memberId = memberByOrder.get(item.orderId) ?? item.memberId;
    if (!memberId) continue;

    // A finalized order stores its final amount directly. For older or
    // unfinalized orders, calculate the amount from the product/tier price.
    let amount: number;
    if (item.finalAmount != null) {
      amount = item.finalAmount;
    } else {
      const product = productMap.get(item.productId);
      if (!product) continue;
      const quantity = item.finalQuantity ?? item.quantity;
      const groupBuyId = groupByOrder.get(item.orderId) ?? item.groupBuyId;
      const tierKey = `${groupBuyId}:${product.price_group_id ?? ""}`;
      const estimatedUnitPrice = getTierPrice(
        product,
        groupQuantities.get(tierKey) ?? 0,
        tiers,
      );
      const unitPrice = item.finalUnitPrice ?? estimatedUnitPrice;
      amount = quantity * unitPrice;
    }

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
      { status: 500 },
    );
  }
}
