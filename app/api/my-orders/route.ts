import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const employeeId = new URL(request.url).searchParams.get("employeeId")?.trim() ?? "";
    if (!/^\d{5}$/.test(employeeId)) return NextResponse.json({ error: "工號格式不正確" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id")
      .eq("employee_id", employeeId)
      .is("deleted_at", null)
      .single();
    if (memberError || !member) return NextResponse.json({ data: [] });

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
        ? await supabase.from("products").select("id,name,unit").in("id", productIds)
        : { data: [] };
      const productMap = new Map((products ?? []).map((p) => [p.id, p]));

      const orderItems = (items ?? []).map((item) => ({
        productId: item.product_id,
        productName: productMap.get(item.product_id)?.name ?? "商品",
        unit: productMap.get(item.product_id)?.unit ?? "",
        quantity: Number(item.final_quantity ?? item.quantity ?? 0),
        finalAmount: item.final_amount == null ? null : Number(item.final_amount),
      }));

      result.push({
        ...order,
        group,
        items: orderItems,
        isFinalized: group?.status === "finalized",
      });
    }

    // 首頁的「截止的訂單／歷史訂單」要與後台的團購清單同步。
    // 即使某位員工沒有在該團購下單，團購本身仍應出現在對應區域，
    // 避免首頁只靠 orders 表而漏掉後台已經截止或完成的團購。
    const { data: closedAndHistoryGroups, error: groupListError } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status,created_at")
      .in("status", ["closed", "reviewing", "finalized"])
      .order("end_at", { ascending: false });
    if (groupListError) throw groupListError;

    const existingGroupIds = new Set(result.map((order) => order.group_buy_id));

    for (const group of closedAndHistoryGroups ?? []) {
      if (existingGroupIds.has(group.id)) continue;
      result.push({
        id: `group-${group.id}`,
        group_buy_id: group.id,
        created_at: group.created_at,
        group,
        items: [],
        isFinalized: group.status === "finalized",
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
