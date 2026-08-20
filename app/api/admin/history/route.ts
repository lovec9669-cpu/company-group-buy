import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

function getTierPrice(product: { price: number | string | null; price_group_id: string | null }, groupQuantity: number, tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[]) {
  const basePrice = Number(product.price ?? 0);
  if (!product.price_group_id || groupQuantity <= 0) return basePrice;
  const groupTiers = tiers.filter((tier) => tier.price_group_id === product.price_group_id).sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity));
  const tier = groupTiers.find((item) => groupQuantity >= Number(item.min_quantity) && (item.max_quantity == null || groupQuantity <= Number(item.max_quantity)));
  return tier ? Number(tier.unit_price) : basePrice;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  try {
    const supabase = getSupabaseAdmin();
    const { data: openGroups, error: openError } = await supabase.from("group_buys").select("id,end_at").eq("status", "open");
    if (openError) throw openError;
    const expiredIds = (openGroups ?? []).filter((group) => new Date(group.end_at).getTime() <= Date.now()).map((group) => group.id);
    if (expiredIds.length) {
      const { error: closeError } = await supabase.from("group_buys").update({ status: "closed" }).in("id", expiredIds).eq("status", "open");
      if (closeError) throw closeError;
    }
    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status");
    const statusFilter = requestedStatus === "closed" ? ["closed", "reviewing"] : requestedStatus === "awaiting_payment" ? ["awaiting_payment"] : ["finalized"];
    const { data: groups, error: groupError } = await supabase.from("group_buys").select("id,name,description,start_at,end_at,status,created_at").in("status", statusFilter).order("end_at", { ascending: false });
    if (groupError) throw groupError;
    const result = [];
    for (const group of groups ?? []) {
      const { data: products, error: productError } = await supabase.from("products").select("id,name,price,price_group_id").eq("group_buy_id", group.id).order("sort_order", { ascending: true });
      if (productError) throw productError;
      const productMap = new Map((products ?? []).map((p) => [p.id, p]));
      const priceGroupIds = [...new Set((products ?? []).map((p) => p.price_group_id).filter((id): id is string => Boolean(id)))];
      let tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[] = [];
      if (priceGroupIds.length) {
        const { data: tierRows, error: tierError } = await supabase.from("group_buy_price_tiers").select("price_group_id,min_quantity,max_quantity,unit_price").in("price_group_id", priceGroupIds);
        if (tierError) throw tierError;
        tiers = tierRows ?? [];
      }
      const { data: orders, error: orderError } = await supabase.from("orders").select("id,member_id").eq("group_buy_id", group.id);
      if (orderError) throw orderError;
      const orderIds = (orders ?? []).map((order) => order.id);
      const orderMemberMap = new Map((orders ?? []).map((order) => [order.id, order.member_id]));
      const memberIds = [...new Set((orders ?? []).map((order) => order.member_id).filter((id): id is string => Boolean(id)))];
      let members: { id: string; employee_id: string; name: string }[] = [];
      if (memberIds.length) {
        const { data: memberRows, error: memberError } = await supabase.from("members").select("id,employee_id,name").in("id", memberIds);
        if (memberError) throw memberError;
        members = memberRows ?? [];
      }
      const memberMap = new Map(members.map((member) => [member.id, member]));
      const rawItems: { orderId: string; memberId: string | null; productId: string; quantity: number; finalQuantity: number | null; finalUnitPrice: number | null; finalAmount: number | null }[] = [];
      if (orderIds.length) {
        const { data: items, error: itemError } = await supabase.from("order_items").select("order_id,product_id,quantity,final_quantity,final_unit_price,final_amount").in("order_id", orderIds);
        if (itemError) throw itemError;
        for (const item of items ?? []) rawItems.push({ orderId: item.order_id, memberId: orderMemberMap.get(item.order_id) ?? null, productId: item.product_id, quantity: Number(item.quantity ?? 0), finalQuantity: item.final_quantity == null ? null : Number(item.final_quantity), finalUnitPrice: item.final_unit_price == null ? null : Number(item.final_unit_price), finalAmount: item.final_amount == null ? null : Number(item.final_amount) });
      }
      const groupQuantities = new Map<string, number>();
      for (const item of rawItems) {
        const product = productMap.get(item.productId);
        if (product?.price_group_id) groupQuantities.set(product.price_group_id, (groupQuantities.get(product.price_group_id) ?? 0) + item.quantity);
      }
      const membersResult = new Map<string, { memberId: string; employeeId: string; name: string; totalAmount: number; items: { productId: string; productName: string; quantity: number; unitPrice: number; amount: number }[] }>();
      for (const item of rawItems) {
        const member = item.memberId ? memberMap.get(item.memberId) : null;
        const product = productMap.get(item.productId);
        if (!member || !product) continue;
        const quantity = item.finalQuantity ?? item.quantity;
        const estimatedUnitPrice = getTierPrice(product, groupQuantities.get(product.price_group_id ?? "") ?? 0, tiers);
        const unitPrice = item.finalUnitPrice ?? estimatedUnitPrice;
        const amount = item.finalAmount ?? quantity * unitPrice;
        const current = membersResult.get(member.id) ?? { memberId: member.id, employeeId: member.employee_id, name: member.name, totalAmount: 0, items: [] };
        current.items.push({ productId: product.id, productName: product.name, quantity, unitPrice, amount });
        current.totalAmount += amount;
        membersResult.set(member.id, current);
      }
      const memberOrders = Array.from(membersResult.values()).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      const totalQuantity = memberOrders.reduce((sum, member) => sum + member.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
      const totalAmount = memberOrders.reduce((sum, member) => sum + member.totalAmount, 0);
      result.push({ ...group, totalQuantity, memberCount: memberOrders.length, totalAmount, memberOrders });
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("GET /api/admin/history", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得團購資料" }, { status: 500 });
  }
}
