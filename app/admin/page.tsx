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
  tiers: TierDraft[];
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
  return {
    name: "",
    description: "",
    unit: "個",
    maxQuantity: "",
    tiers: [newTier()],
  };
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [products, setProducts] = useState<ProductDraft[]>([newProduct()]);
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

  function updateTier(productIndex: number, tierIndex: number, patch: Partial<TierDraft>) {
    setProducts((current) => current.map((product, i) => {
      if (i !== productIndex) return product;
      return {
        ...product,
        tiers: product.tiers.map((tier, j) => (j === tierIndex ? { ...tier, ...patch } : tier)),
      };
    }));
  }

  function addProduct() {
    setProducts((current) => [...current, newProduct()]);
  }

  function removeProduct(index: number) {
    setProducts((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
  }

  function addTier(productIndex: number) {
    setProducts((current) => current.map((product, i) => i === productIndex ? { ...product, tiers: [...product.tiers, newTier()] } : product));
  }

  function removeTier(productIndex: number, tierIndex: number) {
    setProducts((current) => current.map((product, i) => {
      if (i !== productIndex) return product;
      if (product.tiers.length === 1) return product;
      return { ...product, tiers: product.tiers.filter((_, j) => j !== tierIndex) };
    }));
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

    setSubmitting(true);
    try {
      const response = await fetch("/api/group-buys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, startAt, endAt, products: filledProducts }),
      });

      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "建立失敗");
        return;
      }

      setMessage("團購建立成功，商品與價格階梯也已建立。");
      setName("");
      setDescription("");
      setStartAt("");
      setEndAt("");
      setProducts([newProduct()]);
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
                <p className="mt-1 text-sm text-[var(--muted)]">商品與價格階梯都可以一直新增。</p>
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

                <div className="mt-6 rounded-2xl bg-[#f7f8f5] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">價格階梯</h4>
                      <p className="mt-1 text-xs text-[var(--muted)]">最後一階的最高數量留白，代表「以上」。</p>
                    </div>
                    <button type="button" onClick={() => addTier(productIndex)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium">＋ 新增價格階梯</button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {product.tiers.map((tier, tierIndex) => (
                      <div key={tierIndex} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                        <div>
                          <label className="text-xs text-[var(--muted)]">最低數量</label>
                          <input type="number" min="1" value={tier.minQuantity} onChange={(e) => updateTier(productIndex, tierIndex, { minQuantity: e.target.value })} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--muted)]">最高數量</label>
                          <input type="number" min="1" value={tier.maxQuantity} onChange={(e) => updateTier(productIndex, tierIndex, { maxQuantity: e.target.value })} placeholder="以上" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--muted)]">單價</label>
                          <input type="number" min="0" step="0.01" value={tier.unitPrice} onChange={(e) => updateTier(productIndex, tierIndex, { unitPrice: e.target.value })} placeholder="例如 100" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" />
                        </div>
                        <button type="button" onClick={() => removeTier(productIndex, tierIndex)} disabled={product.tiers.length === 1} className="rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-red-600 disabled:opacity-40">刪除</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                {error && <p className="text-sm font-medium text-red-600">{error}</p>}
                {message && <p className="text-sm font-medium text-[var(--accent)]">{message}</p>}
                {!error && !message && <p className="text-sm text-[var(--muted)]">確認資料後建立團購。</p>}
              </div>
              <button disabled={submitting} className="rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white disabled:opacity-50">{submitting ? "建立中…" : "建立團購"}</button>
            </div>
          </section>
        </form>

        <section className="mt-8">
          <h2 className="mb-4 text-xl font-bold">目前團購</h2>
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-[var(--border)] bg-white p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold">{group.name}</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(group.start_at)} ～ {formatDate(group.end_at)}</p>
                  </div>
                  <span className="rounded-full bg-[#e8f3ef] px-3 py-1 text-xs font-semibold text-[var(--accent)]">{group.status}</span>
                </div>
                {group.description && <p className="mt-3 text-sm text-[var(--muted)]">{group.description}</p>}
              </div>
            ))}
            {groups.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">目前還沒有團購。</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
