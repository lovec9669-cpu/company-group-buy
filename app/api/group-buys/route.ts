import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

type PriceTierInput = { minQuantity?: unknown; maxQuantity?: unknown; unitPrice?: unknown };
type ProductInput = {
  name?: unknown;
  description?: unknown;
  unit?: unknown;
  price?: unknown;
  quantity?: unknown;
  maxQuantity?: unknown;
  priceGroupId?: unknown;
};
type PriceGroupInput = { id?: unknown; name?: unknown; productIndexes?: unknown; tiers?: unknown };

function parseTaipeiDateTime(value: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return new Date(NaN);
  return new Date(`${normalized}:00+08:00`);
}

function validateTiers(tiers: PriceTierInput[]) {
  const normalized = tiers.map((tier) => {
    const min = Number(tier.minQuantity);
    const maxText = String(tier.maxQuantity ?? "").trim();
    const max = maxText ? Number(maxText) : null;
    const price = Number(tier.unitPrice);
    return { min, max, price };
  });
  for (let i = 0; i < normalized.length; i += 1) {
    const tier = normalized[i];
    if (!Number.isInteger(tier.min) || tier.min < 1 || (tier.max !== null && (!Number.isInteger(tier.max) || tier.max < tier.min)) || !Number.isFinite(tier.price) || tier.price < 0) {
      throw new Error(`價格階梯 ${i + 1} 格式不正確`);
    }
    if (i > 0) {
      const previous = normalized[i - 1];
      if (previous.max === null) throw new Error("價格階梯中，只有最後一階可以設定為「以上」");
      if (tier.min !== previous.max + 1) throw new Error(`價格階梯 ${i} 與第 ${i + 1} 階數量區間沒有連續銜接`);
    }
  }
  if (normalized.length === 0 || normalized[0].min !== 1) throw new Error("第一個價格階梯的最低數量必須從 1 開始");
  return normalized;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("group_buys").select("id,name,description,start_at,end_at,status,created_at").order("start_at", { ascending: false });
    if (error) throw error;

    const now = Date.now();
    const openExpired = (data ?? []).filter((group) => group.status === "open" && new Date(group.end_at).getTime() <= now).map((group) => group.id);
    if (openExpired.length) {
      const { error: closeError } = await supabase.from("group_buys").update({ status: "closed" }).in("id", openExpired).eq("status", "open");
      if (closeError) throw closeError;
    }

    // 團員端只顯示已經到開始時間的團購。尚未開始的團購會等到 start_at 到達後才出現在可參加清單。
    const normalized = (data ?? [])
      .filter((group) => new Date(group.start_at).getTime() <= now)
      .map((group) => openExpired.includes(group.id) ? { ...group, status: "closed" } : group);
    return NextResponse.json({ data: normalized });
  } catch (error) {
    console.error("GET /api/group-buys", error);
    return NextResponse.json({ error: "無法取得團購資料" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!isValidAdminToken(cookieStore.get(adminCookieName)?.value)) return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });

  let createdGroupId: string | null = null;
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();
    const startAt = String(body.startAt ?? "").trim();
    const endAt = String(body.endAt ?? "").trim();
    const products = Array.isArray(body.products) ? (body.products as ProductInput[]) : [];
    const priceGroups = Array.isArray(body.priceGroups) ? (body.priceGroups as PriceGroupInput[]) : [];
    if (!name || !startAt || !endAt) return NextResponse.json({ error: "請填寫團購名稱、開始時間與結束時間" }, { status: 400 });
    const start = parseTaipeiDateTime(startAt), end = parseTaipeiDateTime(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return NextResponse.json({ error: "開始或結束時間格式不正確" }, { status: 400 });
    if (end <= start) return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });
    if (products.length === 0) return NextResponse.json({ error: "至少需要一個商品" }, { status: 400 });

    const assignments = new Map<number, number>();
    for (let groupIndex = 0; groupIndex < priceGroups.length; groupIndex += 1) {
      const indexes = Array.isArray(priceGroups[groupIndex].productIndexes) ? priceGroups[groupIndex].productIndexes as unknown[] : [];
      if (indexes.length < 1) return NextResponse.json({ error: `價格群組 ${groupIndex + 1} 至少要選一個商品` }, { status: 400 });
      for (const rawIndex of indexes) {
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || index < 0 || index >= products.length) return NextResponse.json({ error: `價格群組 ${groupIndex + 1} 的商品選擇不正確` }, { status: 400 });
        if (assignments.has(index)) return NextResponse.json({ error: `商品 ${index + 1} 不能同時加入兩個價格群組` }, { status: 400 });
        assignments.set(index, groupIndex);
      }
    }

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const productName = String(product.name ?? "").trim();
      const price = Number(product.price);
      const quantity = Number(product.quantity);
      const maxText = String(product.maxQuantity ?? "").trim();
      if (!productName) return NextResponse.json({ error: `商品 ${index + 1} 尚未填寫品項名稱` }, { status: 400 });
      if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: `商品 ${index + 1} 的價格不正確` }, { status: 400 });
      if (!Number.isInteger(quantity) || quantity < 0) return NextResponse.json({ error: `商品 ${index + 1} 的數量必須是 0 或正整數` }, { status: 400 });
      if (maxText && (!Number.isInteger(Number(maxText)) || Number(maxText) <= 0)) return NextResponse.json({ error: `商品 ${index + 1} 的最高購買數量必須是正整數` }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: group, error: groupError } = await supabase.from("group_buys").insert({ name, description: description || null, start_at: start.toISOString(), end_at: end.toISOString(), status: "open" }).select("id,name,description,start_at,end_at,status,created_at").single();
    if (groupError) throw new Error(`建立團購失敗：${groupError.message}`);
    createdGroupId = group.id;

    const createdProducts: { id: string }[] = [];
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const { data: created, error: productError } = await supabase.from("products").insert({ group_buy_id: group.id, name: String(product.name).trim(), description: String(product.description ?? "").trim() || null, unit: String(product.unit ?? "").trim() || null, price: Number(product.price), quantity: Number(product.quantity), max_quantity: String(product.maxQuantity ?? "").trim() ? Number(product.maxQuantity) : null, sort_order: index }).select("id").single();
      if (productError) throw new Error(`商品 ${index + 1} 建立失敗：${productError.message}`);
      createdProducts.push(created);
    }

    for (let groupIndex = 0; groupIndex < priceGroups.length; groupIndex += 1) {
      const input = priceGroups[groupIndex];
      const tiers = Array.isArray(input.tiers) ? input.tiers as PriceTierInput[] : [];
      let normalized;
      try { normalized = validateTiers(tiers); } catch (error) { throw new Error(`價格群組 ${groupIndex + 1}：${error instanceof Error ? error.message : "價格階梯設定錯誤"}`); }
      const { data: priceGroup, error: priceGroupError } = await supabase.from("group_buy_price_groups").insert({ group_buy_id: group.id, name: String(input.name ?? `價格群組 ${groupIndex + 1}`).trim() || `價格群組 ${groupIndex + 1}`, sort_order: groupIndex }).select("id").single();
      if (priceGroupError) throw new Error(`價格群組 ${groupIndex + 1} 建立失敗：${priceGroupError.message}`);
      const indexes = input.productIndexes as unknown[];
      for (const rawIndex of indexes) {
        const index = Number(rawIndex);
        const { error } = await supabase.from("products").update({ price_group_id: priceGroup.id }).eq("id", createdProducts[index].id);
        if (error) throw new Error(`商品 ${index + 1} 價格群組設定失敗：${error.message}`);
      }
      const tierRows = normalized.map((tier) => ({ group_buy_id: group.id, price_group_id: priceGroup.id, min_quantity: tier.min, max_quantity: tier.max, unit_price: tier.price }));
      const { error: tierError } = await supabase.from("group_buy_price_tiers").insert(tierRows);
      if (tierError) throw new Error(`價格群組 ${groupIndex + 1} 階梯建立失敗：${tierError.message}`);
    }
    return NextResponse.json({ data: group }, { status: 201 });
  } catch (error) {
    console.error("POST /api/group-buys", error);
    if (createdGroupId) { try { await getSupabaseAdmin().from("group_buys").delete().eq("id", createdGroupId); } catch (cleanupError) { console.error("Cleanup failed", cleanupError); } }
    return NextResponse.json({ error: error instanceof Error ? error.message : "建立團購失敗，請稍後再試" }, { status: 500 });
  }
}