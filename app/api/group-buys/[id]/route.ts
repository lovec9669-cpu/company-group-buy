import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

type PriceTierInput = { id?: unknown; minQuantity?: unknown; maxQuantity?: unknown; unitPrice?: unknown };
type ProductInput = { id?: unknown; name?: unknown; description?: unknown; unit?: unknown; price?: unknown; quantity?: unknown; maxQuantity?: unknown };
type PriceGroupInput = { id?: unknown; name?: unknown; productIndexes?: unknown; tiers?: unknown };

function requireAdmin() {
  return cookies().then((store) => isValidAdminToken(store.get(adminCookieName)?.value));
}

function validatePayload(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const startAt = String(body.startAt ?? "").trim();
  const endAt = String(body.endAt ?? "").trim();
  const products = Array.isArray(body.products) ? (body.products as ProductInput[]) : [];
  const priceGroups = Array.isArray(body.priceGroups) ? (body.priceGroups as PriceGroupInput[]) : [];

  if (!name || !startAt || !endAt) throw new Error("請填寫團購名稱、開始時間與結束時間");
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("開始或結束時間格式不正確");
  if (end <= start) throw new Error("結束時間必須晚於開始時間");
  if (!products.length) throw new Error("至少需要一個商品");

  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    const productName = String(p.name ?? "").trim();
    const price = Number(p.price);
    const quantity = Number(p.quantity);
    const maxText = String(p.maxQuantity ?? "").trim();
    if (!productName) throw new Error(`商品 ${i + 1} 尚未填寫品項名稱`);
    if (!Number.isFinite(price) || price < 0) throw new Error(`商品 ${i + 1} 的價格不正確`);
    if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`商品 ${i + 1} 的數量必須是 0 或正整數`);
    if (maxText && (!Number.isInteger(Number(maxText)) || Number(maxText) <= 0)) throw new Error(`商品 ${i + 1} 的最高購買數量必須是正整數`);
  }

  const assignments = new Set<number>();
  for (let gi = 0; gi < priceGroups.length; gi += 1) {
    const indexes = Array.isArray(priceGroups[gi].productIndexes) ? priceGroups[gi].productIndexes as unknown[] : [];
    if (!indexes.length) throw new Error(`價格群組 ${gi + 1} 至少要選一個商品`);
    for (const raw of indexes) {
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index >= products.length) throw new Error(`價格群組 ${gi + 1} 的商品選擇不正確`);
      if (assignments.has(index)) throw new Error(`商品 ${index + 1} 不能同時加入兩個價格群組`);
      assignments.add(index);
    }
    const tiers = Array.isArray(priceGroups[gi].tiers) ? priceGroups[gi].tiers as PriceTierInput[] : [];
    if (!tiers.length) throw new Error(`價格群組 ${gi + 1} 至少需要一個價格階梯`);
    const normalized = tiers.map((tier) => {
      const min = Number(tier.minQuantity);
      const maxText = String(tier.maxQuantity ?? "").trim();
      const max = maxText ? Number(maxText) : null;
      const price = Number(tier.unitPrice);
      return { min, max, price };
    });
    if (normalized[0].min !== 1) throw new Error(`價格群組 ${gi + 1} 的第一個價格階梯最低數量必須從 1 開始`);
    for (let ti = 0; ti < normalized.length; ti += 1) {
      const tier = normalized[ti];
      if (!Number.isInteger(tier.min) || tier.min < 1 || (tier.max !== null && (!Number.isInteger(tier.max) || tier.max < tier.min)) || !Number.isFinite(tier.price) || tier.price < 0) {
        throw new Error(`價格群組 ${gi + 1} 的價格階梯 ${ti + 1} 格式不正確`);
      }
      if (ti > 0) {
        const previous = normalized[ti - 1];
        if (previous.max === null) throw new Error(`價格群組 ${gi + 1} 只有最後一階可以設定為「以上」`);
        if (tier.min !== previous.max + 1) throw new Error(`價格群組 ${gi + 1} 的價格階梯沒有連續銜接`);
      }
    }
  }

  return { name, description, start, end, products, priceGroups };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: group, error: groupError } = await supabase.from("group_buys").select("id,name,description,start_at,end_at,status,created_at").eq("id", id).single();
    if (groupError) return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });

    const { data: products, error: productError } = await supabase.from("products").select("id,name,description,unit,price,quantity,max_quantity,sort_order,price_group_id").eq("group_buy_id", id).order("sort_order", { ascending: true });
    if (productError) throw productError;
    const { data: priceGroups, error: priceGroupError } = await supabase.from("group_buy_price_groups").select("id,name,sort_order").eq("group_buy_id", id).order("sort_order", { ascending: true });
    if (priceGroupError) throw priceGroupError;
    const { data: tiers, error: tierError } = await supabase.from("group_buy_price_tiers").select("id,price_group_id,min_quantity,max_quantity,unit_price").eq("group_buy_id", id).order("min_quantity", { ascending: true });
    if (tierError) throw tierError;

    const productRows = products ?? [];
    const groupRows = (priceGroups ?? []).map((pg) => ({
      id: pg.id,
      name: pg.name,
      sort_order: pg.sort_order,
      productIndexes: productRows.map((p, index) => p.price_group_id === pg.id ? index : -1).filter((index) => index >= 0),
      tiers: (tiers ?? []).filter((tier) => tier.price_group_id === pg.id).map((tier) => ({ id: tier.id, minQuantity: String(tier.min_quantity), maxQuantity: tier.max_quantity === null ? "" : String(tier.max_quantity), unitPrice: String(tier.unit_price) })),
    }));
    return NextResponse.json({ data: { ...group, products: productRows, priceGroups: groupRows } });
  } catch (error) {
    console.error("GET /api/group-buys/[id]", error);
    return NextResponse.json({ error: "無法取得團購詳細資料" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const { name, description, start, end, products, priceGroups } = validatePayload(body);
    const supabase = getSupabaseAdmin();

    const { error: groupError } = await supabase.from("group_buys").update({ name, description: description || null, start_at: start.toISOString(), end_at: end.toISOString() }).eq("id", id);
    if (groupError) throw groupError;

    const { data: existingProducts, error: existingProductError } = await supabase.from("products").select("id").eq("group_buy_id", id);
    if (existingProductError) throw existingProductError;
    const existingIds = new Set((existingProducts ?? []).map((p) => p.id as string));
    const keptIds = new Set<string>();
    const productIds: string[] = [];

    for (let index = 0; index < products.length; index += 1) {
      const p = products[index];
      const productId = typeof p.id === "string" && existingIds.has(p.id) ? p.id : null;
      const values = {
        group_buy_id: id,
        name: String(p.name).trim(),
        description: String(p.description ?? "").trim() || null,
        unit: String(p.unit ?? "").trim() || null,
        price: Number(p.price),
        quantity: Number(p.quantity),
        max_quantity: String(p.maxQuantity ?? "").trim() ? Number(p.maxQuantity) : null,
        sort_order: index,
      };
      if (productId) {
        const { error } = await supabase.from("products").update(values).eq("id", productId).eq("group_buy_id", id);
        if (error) throw error;
        keptIds.add(productId);
        productIds.push(productId);
      } else {
        const { data, error } = await supabase.from("products").insert(values).select("id").single();
        if (error) throw error;
        keptIds.add(data.id);
        productIds.push(data.id);
      }
    }

    const removedIds = [...existingIds].filter((productId) => !keptIds.has(productId));
    if (removedIds.length) {
      const { error } = await supabase.from("products").delete().in("id", removedIds).eq("group_buy_id", id);
      if (error) throw new Error(`刪除已移除的商品失敗，可能已有員工訂單：${error.message}`);
    }

    const { error: clearProductGroupsError } = await supabase.from("products").update({ price_group_id: null }).eq("group_buy_id", id);
    if (clearProductGroupsError) throw clearProductGroupsError;

    const { data: oldGroups, error: oldGroupsError } = await supabase.from("group_buy_price_groups").select("id").eq("group_buy_id", id);
    if (oldGroupsError) throw oldGroupsError;
    if ((oldGroups ?? []).length) {
      const { error } = await supabase.from("group_buy_price_groups").delete().eq("group_buy_id", id);
      if (error) throw error;
    }

    for (let groupIndex = 0; groupIndex < priceGroups.length; groupIndex += 1) {
      const input = priceGroups[groupIndex];
      const { data: priceGroup, error: priceGroupError } = await supabase.from("group_buy_price_groups").insert({ group_buy_id: id, name: String(input.name ?? `價格群組 ${groupIndex + 1}`).trim() || `價格群組 ${groupIndex + 1}`, sort_order: groupIndex }).select("id").single();
      if (priceGroupError) throw priceGroupError;
      const indexes = Array.isArray(input.productIndexes) ? input.productIndexes as unknown[] : [];
      for (const rawIndex of indexes) {
        const index = Number(rawIndex);
        const productId = productIds[index];
        if (!productId) throw new Error(`價格群組 ${groupIndex + 1} 的商品選擇不正確`);
        const { error } = await supabase.from("products").update({ price_group_id: priceGroup.id }).eq("id", productId).eq("group_buy_id", id);
        if (error) throw error;
      }
      const tiers = (input.tiers as PriceTierInput[]).map((tier) => ({ group_buy_id: id, price_group_id: priceGroup.id, min_quantity: Number(tier.minQuantity), max_quantity: String(tier.maxQuantity ?? "").trim() ? Number(tier.maxQuantity) : null, unit_price: Number(tier.unitPrice) }));
      const { error: tierError } = await supabase.from("group_buy_price_tiers").insert(tiers);
      if (tierError) throw tierError;
    }

    const { data: updated, error: updatedError } = await supabase.from("group_buys").select("id,name,description,start_at,end_at,status,created_at").eq("id", id).single();
    if (updatedError) throw updatedError;
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/group-buys/[id]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新團購失敗，請稍後再試" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  try {
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: group, error: findError } = await supabase.from("group_buys").select("id").eq("id", id).single();
    if (findError || !group) return NextResponse.json({ error: "找不到這個團購" }, { status: 404 });
    const { error } = await supabase.from("group_buys").delete().eq("id", id);
    if (error) return NextResponse.json({ error: `刪除失敗：${error.message}` }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/group-buys/[id]", error);
    return NextResponse.json({ error: "刪除團購失敗，請稍後再試" }, { status: 500 });
  }
}
