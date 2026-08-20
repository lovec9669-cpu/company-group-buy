import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: group, error: groupError } = await supabase
      .from("group_buys")
      .select("id,name,status")
      .eq("id", id)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });
    }

    // 刪除功能只開放給已完成的歷史團購，避免誤刪仍在進行中的訂單。
    if (group.status !== "finalized") {
      return NextResponse.json({ error: "只有已完成的歷史團購可以刪除" }, { status: 400 });
    }

    // 先刪除訂單明細，再刪除訂單，避免舊資料庫的外鍵限制阻止刪除。
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .eq("group_buy_id", id);
    if (ordersError) throw ordersError;

    const orderIds = (orders ?? []).map((order) => order.id);
    if (orderIds.length) {
      const { error: itemDeleteError } = await supabase
        .from("order_items")
        .delete()
        .in("order_id", orderIds);
      if (itemDeleteError) throw itemDeleteError;

      const { error: orderDeleteError } = await supabase
        .from("orders")
        .delete()
        .in("id", orderIds);
      if (orderDeleteError) throw orderDeleteError;
    }

    // 刪除本團購的商品、價格階梯與價格群組。
    // price_group / tier 的外鍵設定本身也有 CASCADE，但這裡主動清除可相容舊資料。
    const { error: productDeleteError } = await supabase
      .from("products")
      .delete()
      .eq("group_buy_id", id);
    if (productDeleteError) throw productDeleteError;

    const { error: tierDeleteError } = await supabase
      .from("group_buy_price_tiers")
      .delete()
      .eq("group_buy_id", id);
    if (tierDeleteError && !tierDeleteError.message.includes("column")) throw tierDeleteError;

    const { error: priceGroupDeleteError } = await supabase
      .from("group_buy_price_groups")
      .delete()
      .eq("group_buy_id", id);
    if (priceGroupDeleteError) throw priceGroupDeleteError;

    const { error: deleteError } = await supabase
      .from("group_buys")
      .delete()
      .eq("id", id)
      .eq("status", "finalized");
    if (deleteError) throw deleteError;

    return NextResponse.json({ message: `「${group.name}」已刪除` });
  } catch (error) {
    console.error("DELETE /api/admin/group-buys/[id]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "刪除團購失敗" },
      { status: 500 },
    );
  }
}
