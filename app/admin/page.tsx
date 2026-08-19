"use client";

import { FormEvent, useEffect, useState } from "react";

type TierDraft = {
  minQuantity: string;
  maxQuantity: string;
  unitPrice: string;
};

type ProductDraft = {
  name: string;
  description: string;
  unit: string;
  maxQuantity: string;
};

type GroupBuy = {
  id: string;
  name: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: "open" | "closed" | "reviewing" | "finalized";
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function newTier(): TierDraft {
  return { minQuantity: "1", maxQuantity: "", unitPrice: "" };
}

function newProduct(): ProductDraft {
  return { name: "", description: "", unit: "個", maxQuantity: "" };
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [products, setProducts] = useState<ProductDraft[]>([newProduct()]);
  const [priceTiers, setPriceTiers] = useState<TierDraft[]>([newTier()]);
  const [groups, setGroups] = useState<GroupBuy[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadGroups() {
    const response = await fetch("/api/group-buys", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setGroups(result.data ?? []);
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setError("管理員密碼錯誤");
      return;
    }

    setLoggedIn(true);
    setPassword("");
  }

  function updateProduct(index: number, patch: Partial<ProductDraft>) {
    setProducts((current) => current.map((product, i) => (i === index ? { ...product, ...patch } : product)));
  }

  function updateTier(index: number, patch: Partial<TierDraft>) {
    setPriceTiers((current) => current.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  }

  function addProduct() {
    setProducts((current) => [...current, newProduct()]);
  }

  function removeProduct(index: number) {
    setProducts((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  }

  function addTier() {
    setPriceTiers((current) => {
      const previous = current[current.length - 1];
      const nextMin = previous?.maxQuantity ? String(Number(previous.maxQuantity) + 1) : "";
      return [...current, { ...newTier(), minQuantity: nextMin }];
    });
  }

  function removeTier(index: number) {
    setPriceTiers((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (endAt && startAt && new Date(endAt) <= new Date(startAt)) {
      setError("結束時間必須晚於開始時間");
      return;
    }

    const filledProducts = products.filter((product) => product.name.trim());
    if (filledProducts.length === 0) {
      setError("至少新增一個商品並填寫品項名稱");
      return;
    }

    if (priceTiers.length === 0) {
      setError("至少需要一個共用價格階梯");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/group-buys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, startAt, endAt, products: filledProducts, priceTiers }),
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "建立失敗");
        return;
      }

      setMessage("團購建立成功，所有商品會共用同一套混搭價格階梯。");
      setName("");
      setDescription("");
      setStartAt("");
      setEndAt("");
      setProducts([newProduct()]);
      setPriceTiers([newTier()]);
      await loadGroups();
    } catch {
      setError("無法連線到伺服器，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  if (!loggedIn) {
    return (
      <main className="min-h-screen px-5 py-10">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-sm">
          <p className="text-sm font-medium text-[var(--accent)]">Company Group Buy</p>
          <h1 className="mt-2 text-2xl font-bold">管理員後台</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">請輸入管理員密碼進入後台。</p>
          <form onSubmit={login} className="mt-6">
            <label className="text-sm font-medium">管理員密碼</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" required />
            <button className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">登入</button>
          </form>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between rounded-3xl bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
            <h1 className="mt-1 text-2xl font-bold">團購管理後台</h1>
          </div>
          <a href="/" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm">回首頁</a>
        </header>

        <form onSubmit={createGroup}>
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">建立新團購</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-medium">開團名稱</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：雞胸肉團購" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" required />
              </div>
              <div>
                <label className="text-sm font-medium">開始時間</label>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" required />
              </div>
              <div>
                <label className="text-sm font-medium">結束時間</label>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" required />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">團購說明（選填）</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="例如：本次免運、預計到貨日期等" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" />
              </div>
            </div>
          </section>

          <section className="mt-6 space-y-5">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold">團購商品</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">不同口味、不同品項的數量會合併計算價格階梯。</p>
              </div>
              <button type="button" onClick={addProduct} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">＋ 新增商品</button>
            </div>

            {products.map((product, productIndex) => (
              <div key={productIndex} className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold">商品 {productIndex + 1}</h3>
                  <button type="button" onClick={() => removeProduct(productIndex)} disabled={products.length === 1} className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-40">刪除商品</button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">品項名稱</label>
                    <input value={product.name} onChange={(e) => updateProduct(productIndex, { name: e.target.value })} placeholder="例如：原味雞胸肉" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">單位</label>
                    <input value={product.unit} onChange={(e) => updateProduct(productIndex, { unit: e.target.value })} placeholder="個／包／盒／瓶" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">每人最高購買數量</label>
                    <input type="number" min="1" value={product.maxQuantity} onChange={(e) => updateProduct(productIndex, { maxQuantity: e.target.value })} placeholder="留白代表不限購" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">商品說明（選填）</label>
                    <input value={product.description} onChange={(e) => updateProduct(productIndex, { description: e.target.value })} placeholder="例如：100g／包" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" />
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold">跨商品共用價格階梯</h2>
                <p className="mt-2 text-sm text-[var(--muted)]">系統會把同一位團員選購的所有商品數量加總，再決定全部商品的單價。</p>
              </div>
              <button type="button" onClick={addTier} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium">＋ 新增價格階梯</button>
            </div>

            <div className="mt-5 rounded-2xl bg-[#f7f8f5] p-4">
              <div className="grid gap-3 text-xs font-medium text-[var(--muted)] md:grid-cols-[1fr_1fr_1fr_auto]">
                <div>最低數量</div>
                <div>最高數量</div>
                <div>混搭後單價</div>
                <div />
              </div>
              <div className="mt-3 space-y-3">
                {priceTiers.map((tier, tierIndex) => (
                  <div key={tierIndex} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                    <input type="number" min="1" value={tier.minQuantity} onChange={(e) => updateTier(tierIndex, { minQuantity: e.target.value })} className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" />
                    <input type="number" min="1" value={tier.maxQuantity} onChange={(e) => updateTier(tierIndex, { maxQuantity: e.target.value })} placeholder="以上" className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" />
                    <input type="number" min="0" step="0.01" value={tier.unitPrice} onChange={(e) => updateTier(tierIndex, { unitPrice: e.target.value })} placeholder="例如 35" className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" />
                    <button type="button" onClick={() => removeTier(tierIndex)} disabled={priceTiers.length === 1} className="rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-red-600 disabled:opacity-40">刪除</button>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--muted)]">例如設定 1～9 件 35 元、10～29 件 34 元，3 原味＋2 胡椒＋5 椒麻＝10 件，全部適用 34 元。</p>
            </div>
          </section>

          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                {error && <p className="text-sm font-medium text-red-600">{error}</p>}
                {message && <p className="text-sm font-medium text-[var(--accent)]">{message}</p>}
                {!error && !message && <p className="text-sm text-[var(--muted)]">確認商品與共用價格階梯後建立團購。</p>}
              </div>
              <button disabled={submitting} className="rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white disabled:opacity-50">{submitting ? "建立中..." : "建立團購"}</button>
            </div>
          </section>
        </form>

        <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">目前團購</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)]">
            {groups.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--muted)]">目前還沒有團購。</div>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="flex flex-col gap-3 border-b border-[var(--border)] p-4 last:border-0 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold">{group.name}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">{formatDate(group.start_at)} ～ {formatDate(group.end_at)}</div>
                  </div>
                  <span className="rounded-full bg-[#e8f3ef] px-3 py-1 text-xs font-semibold text-[var(--accent)]">{group.status === "open" ? "訂購中" : group.status === "finalized" ? "已結算" : "已截止"}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
