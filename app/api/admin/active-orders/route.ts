import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

function getTierPrice(
  product: { price: number | string | null; price_group_id: string | null },
  groupQuantity: number,
  tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[],
) {
  const basePrice = Number(product.price ?? 0);
  if (!product.price_group_id || groupQuantity <= 0) return basePrice;
  const tier = tiers
    .filter((item) => item.price_group_id === product.price_group_id)
    .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity))
    .find((item) => groupQuantity >= Number(item.min_quantity) && (item.max_quantity == null || groupQuantity <= Number(item.max_quantity)));
  return tier ? Number(tier.unit_price) : basePrice;
}

export async function GET() {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const now = Date.now();

    const { data: openGroups, error: groupsError } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status")
      .eq("status", "open")
      .order("start_at", { ascending: true });
    if (groupsError) throw groupsError;

    const expiredIds = (openGroups ?? [])
      .filter((group) => new Date(group.end_at).getTime() <= now)
      .map((group) => group.id);

    if (expiredIds.length) {
      const { error: closeError } = await supabase
        .from("group_buys")
        .update({ status: "closed" })
        .in("id", expiredIds)
        .eq("status", "open");
      if (closeError) throw closeError;
    }

    const activeGroups = (openGroups ?? []).filter((group) => {
      const start = new Date(group.start_at).getTime();
      const end = new Date(group.end_at).getTime();
      return start <= now && end > now;
    });

    const result = [];

    for (const group of activeGroups) {
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id,member_id,created_at")
        .eq("group_buy_id", group.id)
        .order("created_at", { ascending: true });
      if (ordersError) throw ordersError;

      const orderIds = (orders ?? []).map((order) => order.id);
      const memberIds = [...new Set((orders ?? []).map((order) => order.member_id).filter(Boolean))];

      const { data: members, error: membersError } = memberIds.length
        ? await supabase.from("members").select("id,employee_id,name").in("id", memberIds).is("deleted_at", null)
        : { data: [], error: null };
      if (membersError) throw membersError;

      const { data: items, error: itemsError } = orderIds.length
        ? await supabase.from("order_items").select("order_id,product_id,quantity").in("order_id", orderIds)
        : { data: [], error: null };
      if (itemsError) throw itemsError;

      const productIds = [...new Set((items ?? []).map((item) => item.product_id))];
      const { data: products, error: productsError } = productIds.length
        ? await supabase.from("products").select("id,name,unit,price,price_group_id").in("id", productIds)
        : { data: [], error: null };
      if (productsError) throw productsError;

      const priceGroupIds = [...new Set((products ?? []).map((product) => product.price_group_id).filter((id): id is string => Boolean(id)))];
      const { data: tiers, error: tiersError } = priceGroupIds.length
        ? await supabase.from("group_buy_price_tiers").select("price_group_id,min_quantity,max_quantity,unit_price").in("price_group_id", priceGroupIds)
        : { data: [], error: null };
      if (tiersError) throw tiersError;

      const memberMap = new Map((members ?? []).map((member) => [member.id, member]));
      const productMap = new Map((products ?? []).map((product) => [product.id, product]));
      const groupQuantities = new Map<string, number>();
      for (const item of items ?? []) {
        const product = productMap.get(item.product_id);
        if (!product?.price_group_id) continue;
        groupQuantities.set(product.price_group_id, (groupQuantities.get(product.price_group_id) ?? 0) + Number(item.quantity ?? 0));
      }

      const orderRows = (orders ?? []).map((order) => {
        const member = memberMap.get(order.member_id);
        const orderItems = (items ?? [])
          .filter((item) => item.order_id === order.id)
          .map((item) => {
            const product = productMap.get(item.product_id);
            const quantity = Number(item.quantity ?? 0);
            const unitPrice = product ? getTierPrice(product, groupQuantities.get(product.price_group_id ?? "") ?? 0, tiers ?? []) : 0;
            return {
              productId: item.product_id,
              productName: product?.name ?? "商品",
              unit: product?.unit ?? "",
              quantity,
              unitPrice,
              amount: quantity * unitPrice,
            };
          });
        return {
          id: order.id,
          memberId: order.member_id,
          employeeId: member?.employee_id ?? "",
          memberName: member?.name ?? "未知團員",
          createdAt: order.created_at,
          items: orderItems,
          totalAmount: orderItems.reduce((sum, item) => sum + item.amount, 0),
          totalQuantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
        };
      });

      const productTotals = (products ?? []).map((product) => {
        const quantity = (items ?? [])
          .filter((item) => item.product_id === product.id)
          .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
        const unitPrice = getTierPrice(product, groupQuantities.get(product.price_group_id ?? "") ?? 0, tiers ?? []);
        return {
          productId: product.id,
          productName: product.name,
          unit: product.unit ?? "",
          quantity,
          unitPrice,
          amount: quantity * unitPrice,
        };
      });

      result.push({
        ...group,
        orderCount: orderRows.length,
        totalQuantity: orderRows.reduce((sum, order) => sum + order.totalQuantity, 0),
        totalAmount: orderRows.reduce((sum, order) => sum + order.totalAmount, 0),
        productTotals,
        orders: orderRows,
      });
    }

    return NextResponse.json({ data: result, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/admin/active-orders", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得進行中團購的跟單資料" }, { status: 500 });
  }
}
