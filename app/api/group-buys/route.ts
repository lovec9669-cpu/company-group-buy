import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { adminCookieName, isValidAdminToken } from "@/lib/admin-auth";

type PriceTierInput = {
  minQuantity?: unknown;
  maxQuantity?: unknown;
  unitPrice?: unknown;
};

type ProductInput = {
  name?: unknown;
  description?: unknown;
  unit?: unknown;
  maxQuantity?: unknown;
};

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
      throw new Error(`共用價格階梯 ${i + 1} 格式不正確`);
    }
    if (i > 0) {
      const previous = normalized[i - 1];
      if (previous.max === null) {
        throw new Error("價格階梯中，只有最後一階可以設定為「以上」");
      }
      if (tier.min !== previous.max + 1) {
        throw new Error(`價格階梯 ${i} 與第 ${i + 1} 階數量區間沒有連續銜接`);
      }
    }
  }

  if (normalized.length > 0 && normalized[0].min !== 1) {
    throw new Error("第一個價格階梯的最低數量必須從 1 開始");
  }

  return normalized;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("group_buys")
      .select("id,name,description,start_at,end_at,status,created_at")
      .order("start_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/group-buys", error);
    return NextResponse.json({ error: "無法取得團購資料" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName)?.value;

  if (!isValidAdminToken(token)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 401 });
  }

  let createdGroupId: string | null = null;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim();
    const startAt = String(body.startAt ?? "").trim();
    const endAt = String(body.endAt ?? "").trim();
    const products = Array.isArray(body.products) ? (body.products as ProductInput[]) : [];
    const priceTiers = Array.isArray(body.priceTiers) ? (body.priceTiers as PriceTierInput[]) : [];

    if (!name || !startAt || !endAt) {
      return NextResponse.json({ error: "請填寫團購名稱、開始時間與結束時間" }, { status: 400 });
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "開始或結束時間格式不正確" }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: "結束時間必須晚於開始時間" }, { status: 400 });
    }
    if (products.length === 0) {
      return NextResponse.json({ error: "至少需要一個商品" }, { status: 400 });
    }

    let normalizedTiers;
    try {
      normalizedTiers = validateTiers(priceTiers);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "價格階梯設定錯誤" }, { status: 400 });
    }

    if (normalizedTiers.length === 0) {
      return NextResponse.json({ error: "至少需要一個共用價格階梯" }, { status: 400 });
    }

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      if (!String(product.name ?? "").trim()) {
        return NextResponse.json({ error: `商品 ${index + 1} 尚未填寫品項名稱` }, { status: 400 });
      }

      const maxQuantityText = String(product.maxQuantity ?? "").trim();
      if (maxQuantityText && (!Number.isInteger(Number(maxQuantityText)) || Number(maxQuantityText) <= 0)) {
        return NextResponse.json({ error: `商品 ${index + 1} 的限購數量必須是正整數` }, { status: 400 });
      }
    }

    const supabase = getSupabaseAdmin();
    const { data: group, error: groupError } = await supabase
      .from("group_buys")
      .insert({
        name,
        description: description || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        status: "open",
      })
      .select("id,name,description,start_at,end_at,status,created_at")
      .single();

    if (groupError) {
      console.error("Supabase group_buys insert error", groupError);
      return NextResponse.json({ error: `建立團購失敗：${groupError.message}` }, { status: 500 });
    }

    createdGroupId = group.id;

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      const { error: productError } = await supabase
        .from("products")
        .insert({
          group_buy_id: group.id,
          name: String(product.name).trim(),
          description: String(product.description ?? "").trim() || null,
          unit: String(product.unit ?? "").trim() || null,
          max_quantity: String(product.maxQuantity ?? "").trim() ? Number(product.maxQuantity) : null,
          sort_order: index,
        });

      if (productError) throw new Error(`商品 ${index + 1} 建立失敗：${productError.message}`);
    }

    const tierRows = normalizedTiers.map((tier) => ({
      group_buy_id: group.id,
      min_quantity: tier.min,
      max_quantity: tier.max,
      unit_price: tier.price,
    }));

    const { error: tierError } = await supabase
      .from("group_buy_price_tiers")
      .insert(tierRows);

    if (tierError) {
      throw new Error(`共用價格階梯建立失敗：${tierError.message}`);
    }

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (error) {
    console.error("POST /api/group-buys", error);

    if (createdGroupId) {
      try {
        const supabase = getSupabaseAdmin();
        await supabase.from("group_buys").delete().eq("id", createdGroupId);
      } catch (cleanupError) {
        console.error("Cleanup failed", cleanupError);
      }
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "建立團購失敗，請稍後再試" }, { status: 500 });
  }
}
