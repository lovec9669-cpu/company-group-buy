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

function unauthorized() {
  return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
}

export async function GET() {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) return unauthorized();

  try {
    const supabase = getSupabaseAdmin();
    const { data: groups, error: groupError } = await supabase
      .from("group_buys")
      .select("id,name,start_at,end_at,status")
      .eq("status", "awaiting_payment")
      .order("end_at", { ascending: false });
    if (groupError) throw groupError;

    const result = [];
    for (const group of groups ?? []) {
      const { data: products, error: productError } = await supabase.from("products").select("id,name,price,price_group_id").eq("group_buy_id", group.id).order("sort_order", { ascending: true });
      if (productError) throw productError;
      const productMap = new Map((products ?? []).map((product) => [product.id, product]));
      const priceGroupIds = [...new Set((products ?? []).map((product) => product.price_group_id).filter((id): id is string => Boolean(id)))];
      let tiers: { price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number | string }[] = [];
      if (priceGroupIds.length) {
        const { data: tierRows, error: tierError } = await supabase.from("group_buy_price_tiers").select("price_group_id,min_quantity,max_quantity,unit_price").in("price_group_id", priceGroupIds);
        if (tierError) throw tierError;
        tiers = tierRows ?? [];
      }

      const { data: orders, error: orderError } = await supabase.from("orders").select("id,member_id,paid_at").eq("group_buy_id", group.id);
      if (orderError) throw orderError;
      const orderIds = (orders ?? []).map((order) => order.id);
      const orderMemberMap = new Map((orders ?? []).map((order) => [order.id, order.member_id]));
      const memberIds = [...new Set((orders ?? []).map((order) => order.member_id).filter((id): id is string => Boolean(id)))];
      const paidMap = new Map((orders ?? []).map((order) => [order.id, Boolean(order.paid_at)]));

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
        if (product?.price_group_id) groupQuantities.set(product.price_group_id, (groupQuantities.get(product.price_group_id) ?? 0) + (item.finalQuantity ?? item.quantity));
      }

      const memberResult = new Map<string, { memberId: string; orderId: string; employeeId: string; name: string; totalAmount: number; paid: boolean }>();
      for (const item of rawItems) {
        const member = item.memberId ? memberMap.get(item.memberId) : null;
        const product = productMap.get(item.productId);
        if (!member || !product) continue;
        const quantity = item.finalQuantity ?? item.quantity;
        const unitPrice = item.finalUnitPrice ?? getTierPrice(product, groupQuantities.get(product.price_group_id ?? "") ?? 0, tiers);
        const amount = item.finalAmount ?? quantity * unitPrice;
        const current = memberResult.get(member.id) ?? { memberId: member.id, orderId: item.orderId, employeeId: member.employee_id, name: member.name, totalAmount: 0, paid: paidMap.get(item.orderId) ?? false };
        current.totalAmount += amount;
        memberResult.set(member.id, current);
      }

      const membersResult = Array.from(memberResult.values()).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
      result.push({ ...group, memberCount: membersResult.length, totalAmount: membersResult.reduce((sum, member) => sum + member.totalAmount, 0), paidCount: membersResult.filter((member) => member.paid).length, members: membersResult });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("GET /api/admin/payments", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法取得待收款資料" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) return unauthorized();

  try {
    const body = await request.json();
    const supabase = getSupabaseAdmin();
    const type = String(body.type ?? "");

    if (type === "members") {
      const groupBuyId = String(body.groupBuyId ?? "").trim();
      const updates = Array.isArray(body.updates) ? body.updates : [];
      if (!groupBuyId) return NextResponse.json({ error: "缺少團購編號" }, { status: 400 });
      if (!updates.length) return NextResponse.json({ error: "沒有需要儲存的付款狀態" }, { status: 400 });

      const { data: group, error: groupError } = await supabase.from("group_buys").select("status").eq("id", groupBuyId).single();
      if (groupError || !group) return NextResponse.json({ error: "找不到團購" }, { status: 404 });
      if (group.status !== "awaiting_payment") return NextResponse.json({ error: "這筆團購目前不在待收款狀態" }, { status: 400 });

      const orderIds = updates.map((item: { orderId?: unknown }) => String(item.orderId ?? "").trim()).filter(Boolean);
      const uniqueOrderIds = [...new Set(orderIds)];
      if (!uniqueOrderIds.length || uniqueOrderIds.length !== updates.length) return NextResponse.json({ error: "付款狀態資料格式不正確" }, { status: 400 });

      const { data: orders, error: orderError } = await supabase.from("orders").select("id,group_buy_id").in("id", uniqueOrderIds);
      if (orderError) throw orderError;
      const validOrderIds = new Set((orders ?? []).filter((order) => order.group_buy_id === groupBuyId).map((order) => order.id));
      if (validOrderIds.size !== uniqueOrderIds.length) return NextResponse.json({ error: "付款狀態中包含不屬於此團購的訂單" }, { status: 400 });

      await Promise.all(updates.map(async (item: { orderId?: unknown; paid?: unknown }) => {
        const orderId = String(item.orderId ?? "").trim();
        const paid = Boolean(item.paid);
        const { error: updateError } = await supabase.from("orders").update({ paid_at: paid ? new Date().toISOString() : null }).eq("id", orderId).eq("group_buy_id", groupBuyId);
        if (updateError) throw updateError;
      }));

      return NextResponse.json({ message: "付款狀態已儲存" });
    }

    if (type === "member") {
      const orderId = String(body.orderId ?? "").trim();
      const paid = Boolean(body.paid);
      if (!orderId) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
      const { data: order, error: findError } = await supabase.from("orders").select("id,group_buy_id").eq("id", orderId).single();
      if (findError || !order) return NextResponse.json({ error: "找不到這筆訂單" }, { status: 404 });
      const { data: group, error: groupError } = await supabase.from("group_buys").select("status").eq("id", order.group_buy_id).single();
      if (groupError || !group || group.status !== "awaiting_payment") return NextResponse.json({ error: "這筆團購目前不在待收款狀態" }, { status: 400 });
      const { error: updateError } = await supabase.from("orders").update({ paid_at: paid ? new Date().toISOString() : null }).eq("id", orderId);
      if (updateError) throw updateError;
      return NextResponse.json({ message: paid ? "已標記為已付款" : "已標記為尚未付款" });
    }

    if (type === "group") {
      const groupBuyId = String(body.groupBuyId ?? "").trim();
      if (!groupBuyId) return NextResponse.json({ error: "缺少團購編號" }, { status: 400 });
      const { data: group, error: groupError } = await supabase.from("group_buys").select("status,name").eq("id", groupBuyId).single();
      if (groupError || !group) return NextResponse.json({ error: "找不到團購" }, { status: 404 });
      if (group.status !== "awaiting_payment") return NextResponse.json({ error: "這筆團購目前不在待收款狀態" }, { status: 400 });
      const { data: orders, error: orderError } = await supabase.from("orders").select("id,paid_at").eq("group_buy_id", groupBuyId);
      if (orderError) throw orderError;
      const unpaid = (orders ?? []).filter((order) => !order.paid_at);
      if (unpaid.length) return NextResponse.json({ error: `仍有 ${unpaid.length} 人尚未付款，請先儲存所有人的付款狀態為 ON。` }, { status: 400 });
      const { error: updateError } = await supabase.from("group_buys").update({ status: "finalized" }).eq("id", groupBuyId).eq("status", "awaiting_payment");
      if (updateError) throw updateError;
      return NextResponse.json({ message: "所有人已付款，團購已移到歷史團購。" });
    }

    return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/admin/payments", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新收款狀態失敗" }, { status: 500 });
  }
}
