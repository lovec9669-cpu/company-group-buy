import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

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

type HistoryItem = {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  finalAmount: number;
};

type HistorySummary = {
  participantCount: number;
  totalAmount: number;
  items: HistoryItem[];
};

async function getHistorySummary(groupBuyId: string): Promise<HistorySummary> {
  const supabase = getSupabaseAdmin();

  const { data: allOrders, error: allOrdersError } = await supabase
    .from("orders")
    .select("id,member_id")
    .eq("group_buy_id", groupBuyId);
  if (allOrdersError) throw allOrdersError;

  const participantCount = new Set((allOrders ?? []).map((order) => order.member_id).filter(Boolean)).size;
  const orderIds = (allOrders ?? []).map((order) => order.id);
  if (!orderIds.length) return { participantCount: 0, totalAmount: 0, items: [] };

  const { data: allItems, error: allItemsError } = await supabase
    .from("order_items")
    .select("order_id,product_id,quantity,final_quantity,final_unit_price,final_amount")
    .in("order_id", orderIds);
  if (allItemsError) throw allItemsError;

  const productIds = [...new Set((allItems ?? []).map((item) => item.product_id))];
  if (!productIds.length) return { participantCount, totalAmount: 0, items: [] };

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id,name,unit,price,price_group_id")
    .in("id", productIds);
  if (productsError) throw productsError;

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const priceGroupIds = [...new Set((products ?? []).map((product) => product.price_group_id).filter((id): id is string => Boolean(id)))];

  let tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[] = [];
  if (priceGroupIds.length) {
    const { data: tierRows, error: tierError } = await supabase
      .from("group_buy_price_tiers")
      .select("price_group_id,min_quantity,max_quantity,unit_price")
      .in("price_group_id", priceGroupIds);
    if (tierError) throw tierError;
    tiers = tierRows ?? [];
  }

  const groupQuantities = new Map<string, number>();
  for (const item of allItems ?? []) {
    const product = productMap.get(item.product_id);
    if (!product?.price_group_id) continue;
    const quantity = Number(item.final_quantity ?? item.quantity ?? 0);
    groupQuantities.set(
      product.price_group_id,
      (groupQuantities.get(product.price_group_id) ?? 0) + quantity,
    );
  }

  const aggregated = new Map<string, HistoryItem>();
  for (const item of allItems ?? []) {
    const product = productMap.get(item.product_id);
    if (!product) continue;

    const quantity = Number(item.final_quantity ?? item.quantity ?? 0);
    const calculatedUnitPrice = getTierPrice(
      product,
      groupQuantities.get(product.price_group_id ?? "") ?? 0,
      tiers,
    );
    const amount = item.final_amount == null
      ? quantity * (item.final_unit_price == null ? calculatedUnitPrice : Number(item.final_unit_price))
      : Number(item.final_amount);

    const existing = aggregated.get(product.id);
    if (existing) {
      existing.quantity += quantity;
      existing.finalAmount += amount;
    } else {
      aggregated.set(product.id, {
        productId: product.id,
        productName: product.name,
        unit: product.unit ?? "",
        quantity,
        finalAmount: amount,
      });
    }
  }

  const items = [...aggregated.values()];
  return {
    participantCount,
    totalAmount: items.reduce((sum, item) => sum + item.finalAmount, 0),
    items,
  };
}

export async function GET(request: Request) {
  try {
    const employeeId = new URL(request.url).searchParams.get("employeeId")?.trim() ?? "";
    if (!/^\d{5}$/.test(employeeId)) return NextResponse.json({ error: "工號格式不正確" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // 先依照後台相同規則同步團購狀態。
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

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .single();
    if (memberError || !member) return NextResponse.json({ data: [] });

    // 取得這位員工自己的訂單。
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id,group_buy_id,created_at")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false });
    if (orderError) throw orderError;

    const result: Array<{
      id: string;
      group_buy_id: string;
      created_at: string;
      group: { id: string; name: string; description: string | null; start_at: string; end_at: string; status: string } | null;
      items: { productId: string; productName: string; unit: string; quantity: number; finalAmount: number | null }[];
      isFinalized: boolean;
      history: HistorySummary | null;
    }> = [];

    for (const order of orders ?? []) {
      const { data: group } = await supabase
        .from("group_buys")
        .select("id,name,description,start_at,end_at,status")
        .eq("id", order.group_buy_id)
        .single();

      const { data: items, error: itemError } = await supabase
        .from("order_items")
        .select("product_id,quantity,final_quantity,final_unit_price,final_amount")
        .eq("order_id", order.id);
      if (itemError) throw itemError;

      const productIds = (items ?? []).map((item) => item.product_id);
      const { data: products } = productIds.length
        ? await supabase.from("products").select("id,name,unit,price,price_group_id").in("id", productIds)
        : { data: [] };
      const productMap = new Map((products ?? []).map((p) => [p.id, p]));

      const priceGroupIds = [...new Set((products ?? []).map((p) => p.price_group_id).filter((id): id is string => Boolean(id)))];
      let tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[] = [];
      if (priceGroupIds.length) {
        const { data: tierRows, error: tierError } = await supabase
          .from("group_buy_price_tiers")
          .select("price_group_id,min_quantity,max_quantity,unit_price")
          .in("price_group_id", priceGroupIds);
        if (tierError) throw tierError;
        tiers = tierRows ?? [];
      }

      // 團購截止後，包含「已完成待收款」階段，都直接依全體團員的數量計算本次單價。
      // 這樣會員端在管理員發布結果後就能立即看到自己的應付金額，不再顯示「待計算」。
      const groupQuantities = new Map<string, number>();
      const shouldCalculateFinalAmount = Boolean(group && ["closed", "reviewing", "awaiting_payment", "finalized"].includes(group.status));
      if (shouldCalculateFinalAmount && group) {
        const { data: allOrders, error: allOrdersError } = await supabase
          .from("orders")
          .select("id")
          .eq("group_buy_id", group.id);
        if (allOrdersError) throw allOrdersError;

        const allOrderIds = (allOrders ?? []).map((item) => item.id);
        if (allOrderIds.length) {
          const { data: allItems, error: allItemsError } = await supabase
            .from("order_items")
            .select("product_id,quantity,final_quantity")
            .in("order_id", allOrderIds);
          if (allItemsError) throw allItemsError;

          const allProductIds = [...new Set((allItems ?? []).map((item) => item.product_id))];
          const { data: allProducts, error: allProductsError } = allProductIds.length
            ? await supabase.from("products").select("id,price_group_id").in("id", allProductIds)
            : { data: [], error: null };
          if (allProductsError) throw allProductsError;

          const allProductMap = new Map((allProducts ?? []).map((p) => [p.id, p]));
          for (const item of allItems ?? []) {
            const product = allProductMap.get(item.product_id);
            if (!product?.price_group_id) continue;
            groupQuantities.set(
              product.price_group_id,
              (groupQuantities.get(product.price_group_id) ?? 0) + Number(item.final_quantity ?? item.quantity ?? 0),
            );
          }
        }
      }

      const orderItems = (items ?? []).map((item) => {
        const product = productMap.get(item.product_id);
        const quantity = Number(item.final_quantity ?? item.quantity ?? 0);
        const calculatedUnitPrice = product
          ? getTierPrice(product, groupQuantities.get(product.price_group_id ?? "") ?? 0, tiers)
          : 0;
        const finalAmount = item.final_amount == null && shouldCalculateFinalAmount
          ? quantity * (item.final_unit_price == null ? calculatedUnitPrice : Number(item.final_unit_price))
          : item.final_amount == null
            ? null
            : Number(item.final_amount);

        return {
          productId: item.product_id,
          productName: product?.name ?? "商品",
          unit: product?.unit ?? "",
          quantity,
          finalAmount,
        };
      });

      // awaiting_payment 在會員首頁仍視為「截止的訂單」。
      // 真正進入歷史訂單只在後台完成收款並轉成 finalized 後發生。
      const displayGroup = group?.status === "awaiting_payment"
        ? { ...group, status: "closed" }
        : group;

      result.push({
        ...order,
        group: displayGroup,
        items: orderItems,
        isFinalized: group?.status === "finalized",
        history: group?.status === "finalized" ? await getHistorySummary(group.id) : null,
      });
    }

    // 首頁的「截止的訂單／歷史訂單」要與後台的團購清單同步。
    // awaiting_payment 仍留在會員首頁的「截止的訂單」，只有 finalized 才進入「歷史訂單」。
    // 即使某位員工沒有在該團購下單，團購本身仍應出現在對應區域。
    const { data: closedAndHistoryGroups, error: groupListError } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status,created_at")
      .in("status", ["closed", "reviewing", "awaiting_payment", "finalized"])
      .order("end_at", { ascending: false });
    if (groupListError) throw groupListError;

    const existingGroupIds = new Set(result.map((order) => order.group_buy_id));

    for (const group of closedAndHistoryGroups ?? []) {
      if (existingGroupIds.has(group.id)) continue;

      const displayGroup = group.status === "awaiting_payment"
        ? { ...group, status: "closed" }
        : group;

      result.push({
        id: `group-${group.id}`,
        group_buy_id: group.id,
        created_at: group.created_at,
        group: displayGroup,
        items: [],
        isFinalized: group.status === "finalized",
        history: group.status === "finalized" ? await getHistorySummary(group.id) : null,
      });
    }

    // 保持最新團購優先。
    result.sort((a, b) => {
      const aTime = new Date(a.group?.end_at ?? a.created_at).getTime();
      const bTime = new Date(b.group?.end_at ?? b.created_at).getTime();
      return bTime - aTime;
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("GET /api/my-orders", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得訂單" }, { status: 500 });
  }
}
