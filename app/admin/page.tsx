"use client";

import { FormEvent, useEffect, useState } from "react";

type TierDraft = { minQuantity: string; maxQuantity: string; unitPrice: string };
type ProductDraft = { name: string; price: string; quantity: string; maxQuantity: string; description: string; unit: string };
type PriceGroupDraft = { name: string; productIndexes: number[]; tiers: TierDraft[] };
type GroupBuy = { id: string; name: string; description: string | null; start_at: string; end_at: string; status: "open" | "closed" | "reviewing" | "finalized" };

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function newTier(): TierDraft { return { minQuantity: "1", maxQuantity: "", unitPrice: "" }; }
function newProduct(): ProductDraft { return { name: "", price: "", quantity: "", maxQuantity: "", description: "", unit: "個" }; }
function newPriceGroup(index: number): PriceGroupDraft { return { name: `價格群組 ${index + 1}`, productIndexes: index === 0 ? [0] : [], tiers: [newTier()] }; }

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [products, setProducts] = useState<ProductDraft[]>([newProduct()]);
  const [priceGroups, setPriceGroups] = useState<PriceGroupDraft[]>([newPriceGroup(0)]);
  const [groups, setGroups] = useState<GroupBuy[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadGroups() {
    const response = await fetch("/api/group-buys", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setGroups(result.data ?? []);
  }
  useEffect(() => { loadGroups(); }, []);

  async function login(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError("");
    const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!response.ok) { setError("管理員密碼錯誤"); return; }
    setLoggedIn(true); setPassword("");
  }

  function updateProduct(index: number, patch: Partial<ProductDraft>) { setProducts((current) => current.map((p, i) => i === index ? { ...p, ...patch } : p)); }
  function addProduct() { setProducts((current) => [...current, newProduct()]); }
  function removeProduct(index: number) {
    if (products.length === 1) return;
    setProducts((current) => current.filter((_, i) => i !== index));
    setPriceGroups((current) => current.map((group) => ({ ...group, productIndexes: group.productIndexes.filter((i) => i !== index).map((i) => i > index ? i - 1 : i) })));
  }
  function updateGroup(index: number, patch: Partial<PriceGroupDraft>) { setPriceGroups((current) => current.map((g, i) => i === index ? { ...g, ...patch } : g)); }
  function addPriceGroup() { setPriceGroups((current) => [...current, newPriceGroup(current.length)]); }
  function removePriceGroup(index: number) { setPriceGroups((current) => current.length === 1 ? current : current.filter((_, i) => i !== index)); }
  function toggleProductInGroup(groupIndex: number, productIndex: number) {
    setPriceGroups((current) => current.map((group, i) => {
      if (i !== groupIndex) return group;
      const selected = group.productIndexes.includes(productIndex);
      return { ...group, productIndexes: selected ? group.productIndexes.filter((x) => x !== productIndex) : [...group.productIndexes, productIndex].sort((a, b) => a - b) };
    }));
  }
  function updateTier(groupIndex: number, tierIndex: number, patch: Partial<TierDraft>) {
    setPriceGroups((current) => current.map((group, i) => i !== groupIndex ? group : { ...group, tiers: group.tiers.map((tier, j) => j === tierIndex ? { ...tier, ...patch } : tier) }));
  }
  function addTier(groupIndex: number) {
    setPriceGroups((current) => current.map((group, i) => {
      if (i !== groupIndex) return group;
      const previous = group.tiers[group.tiers.length - 1];
      const nextMin = previous?.maxQuantity ? String(Number(previous.maxQuantity) + 1) : "";
      return { ...group, tiers: [...group.tiers, { ...newTier(), minQuantity: nextMin }] };
    }));
  }
  function removeTier(groupIndex: number, tierIndex: number) {
    setPriceGroups((current) => current.map((group, i) => i !== groupIndex ? group : { ...group, tiers: group.tiers.length === 1 ? group.tiers : group.tiers.filter((_, j) => j !== tierIndex) }));
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError("");
    if (endAt && startAt && new Date(endAt) <= new Date(startAt)) { setError("結束時間必須晚於開始時間"); return; }
    const filledProducts = products.filter((p) => p.name.trim());
    if (!filledProducts.length) { setError("至少新增一個商品並填寫品項名稱"); return; }

    const remappedGroups = priceGroups.map((group) => ({ ...group, productIndexes: group.productIndexes.filter((i) => i < products.length && products[i].name.trim()) }));
    const used = new Set<number>();
    for (let i = 0; i < remappedGroups.length; i += 1) {
      if (!remappedGroups[i].productIndexes.length) { setError(`價格群組 ${i + 1} 尚未勾選任何商品`); return; }
      for (const productIndex of remappedGroups[i].productIndexes) {
        if (used.has(productIndex)) { setError(`商品 ${productIndex + 1} 已經加入其他價格群組，請每個商品只選一個群組`); return; }
        used.add(productIndex);
      }
      if (!remappedGroups[i].tiers.length) { setError(`價格群組 ${i + 1} 至少需要一個價格階梯`); return; }
    }

    const payloadProducts = products.map((p) => ({ ...p, price: p.price || "0", quantity: p.quantity || "0" })).filter((p) => p.name.trim());
    const indexMap = new Map<number, number>();
    products.forEach((p, originalIndex) => { if (p.name.trim()) indexMap.set(originalIndex, indexMap.size); });
    const payloadGroups = remappedGroups.map((g) => ({ name: g.name, productIndexes: g.productIndexes.map((i) => indexMap.get(i) ?? -1).filter((i) => i >= 0), tiers: g.tiers }));

    setSubmitting(true);
    try {
      const response = await fetch("/api/group-buys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description, startAt, endAt, products: payloadProducts, priceGroups: payloadGroups }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "建立失敗"); return; }
      setMessage("團購建立成功。價格階梯會依各價格群組中「全體員工」的訂購總數量計算。");
      setName(""); setDescription(""); setStartAt(""); setEndAt(""); setProducts([newProduct()]); setPriceGroups([newPriceGroup(0)]); await loadGroups();
    } catch { setError("無法連線到伺服器，請稍後再試"); }
    finally { setSubmitting(false); }
  }

  if (!loggedIn) return (
    <main className="min-h-screen px-5 py-10"><div className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-sm">
      <p className="text-sm font-medium text-[var(--accent)]">Company Group Buy</p><h1 className="mt-2 text-2xl font-bold">管理員後台</h1><p className="mt-2 text-sm text-[var(--muted)]">請輸入管理員密碼進入後台。</p>
      <form onSubmit={login} className="mt-6"><label className="text-sm font-medium">管理員密碼</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /><button className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">登入</button></form>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div></main>
  );

  return <main className="min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-6xl">
    <header className="mb-8 flex items-center justify-between rounded-3xl bg-white p-6 shadow-sm"><div><p className="text-sm font-medium text-[var(--accent)]">Admin</p><h1 className="mt-1 text-2xl font-bold">團購管理後台</h1></div><a href="/" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm">回首頁</a></header>
    <form onSubmit={createGroup}>
      <section className="rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">建立新團購</h2><div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2"><label className="text-sm font-medium">開團名稱</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：雞胸肉團購" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /></div>
        <div><label className="text-sm font-medium">開始時間</label><input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /></div>
        <div><label className="text-sm font-medium">結束時間</label><input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /></div>
        <div className="md:col-span-2"><label className="text-sm font-medium">團購說明（選填）</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="例如：本次免運、預計到貨日期等" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" /></div>
      </div></section>

      <section className="mt-6 space-y-5"><div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">團購商品</h2><p className="mt-1 text-sm text-[var(--muted)]">可無限新增商品。每個商品有自己的基本價格、庫存與限購數量。</p></div><button type="button" onClick={addProduct} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">＋ 新增商品</button></div>
        {products.map((product, productIndex) => <div key={productIndex} className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-lg font-bold">商品 {productIndex + 1}</h3><button type="button" onClick={() => removeProduct(productIndex)} disabled={products.length === 1} className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 disabled:opacity-40">刪除商品</button></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2"><div><label className="text-sm font-medium">品名</label><input value={product.name} onChange={(e) => updateProduct(productIndex, { name: e.target.value })} placeholder="例如：原味雞胸肉" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /></div>
          <div><label className="text-sm font-medium">價格</label><input type="number" min="0" step="0.01" value={product.price} onChange={(e) => updateProduct(productIndex, { price: e.target.value })} placeholder="例如：35" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /></div>
          <div><label className="text-sm font-medium">數量</label><input type="number" min="0" value={product.quantity} onChange={(e) => updateProduct(productIndex, { quantity: e.target.value })} placeholder="例如：100" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" required /></div>
          <div><label className="text-sm font-medium">最高購買數量</label><input type="number" min="1" value={product.maxQuantity} onChange={(e) => updateProduct(productIndex, { maxQuantity: e.target.value })} placeholder="留白代表不限購" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" /></div>
          <div><label className="text-sm font-medium">單位</label><input value={product.unit} onChange={(e) => updateProduct(productIndex, { unit: e.target.value })} placeholder="個／包／盒" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" /></div>
          <div><label className="text-sm font-medium">商品說明</label><input value={product.description} onChange={(e) => updateProduct(productIndex, { description: e.target.value })} placeholder="例如：100g／包" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" /></div></div>
        </div>)}
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-bold">跨商品共用價格階梯</h2><p className="mt-2 text-sm text-[var(--muted)]">請用勾選方式決定哪些商品共用價格。價格階梯會依「整個團購所有員工」的訂購總數量計算。</p></div><button type="button" onClick={addPriceGroup} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">＋ 新增價格群組</button></div>
        <div className="mt-5 space-y-5">{priceGroups.map((group, groupIndex) => <div key={groupIndex} className="rounded-2xl bg-[#f7f8f5] p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><input value={group.name} onChange={(e) => updateGroup(groupIndex, { name: e.target.value })} className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 font-semibold md:max-w-md" /><button type="button" onClick={() => removePriceGroup(groupIndex)} disabled={priceGroups.length === 1} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-600 disabled:opacity-40">刪除價格群組</button></div>
          <div className="mt-4"><p className="text-sm font-semibold">選擇共用這套價格的商品</p><div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">{products.map((product, productIndex) => <label key={productIndex} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3"><input type="checkbox" checked={group.productIndexes.includes(productIndex)} onChange={() => toggleProductInGroup(groupIndex, productIndex)} className="h-4 w-4" /><span>{product.name.trim() || `商品 ${productIndex + 1}`}</span></label>)}</div><p className="mt-2 text-xs text-[var(--muted)]">同一商品只能加入一個價格群組。沒有加入任何群組的商品，會使用自己的基本價格。</p></div>
          <div className="mt-5 flex items-center justify-between"><div><h3 className="font-semibold">價格階梯</h3><p className="mt-1 text-xs text-[var(--muted)]">這裡的數量是整個團購、所有員工、所有被勾選商品的合計數量。</p></div><button type="button" onClick={() => addTier(groupIndex)} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm">＋ 新增價格階梯</button></div>
          <div className="mt-3 space-y-3">{group.tiers.map((tier, tierIndex) => <div key={tierIndex} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"><input type="number" min="1" value={tier.minQuantity} onChange={(e) => updateTier(groupIndex, tierIndex, { minQuantity: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" placeholder="最低數量" /><input type="number" min="1" value={tier.maxQuantity} onChange={(e) => updateTier(groupIndex, tierIndex, { maxQuantity: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" placeholder="最高數量，留白代表以上" /><input type="number" min="0" step="0.01" value={tier.unitPrice} onChange={(e) => updateTier(groupIndex, tierIndex, { unitPrice: e.target.value })} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5" placeholder="單價" /><button type="button" onClick={() => removeTier(groupIndex, tierIndex)} disabled={group.tiers.length === 1} className="rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm text-red-600 disabled:opacity-40">刪除</button></div>)}</div>
          <p className="mt-4 text-xs text-[var(--muted)]">例如：1～9 件 35 元、10～29 件 34 元。全公司原味 4 + 胡椒 2 + 椒麻 5 = 11 件時，這個價格群組內所有員工的這些商品都按 34 元計算。</p>
        </div>)}</div>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-4"><div>{error && <p className="text-sm font-medium text-red-600">{error}</p>}{message && <p className="text-sm font-medium text-[var(--accent)]">{message}</p>}</div><button type="submit" disabled={submitting} className="rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white disabled:opacity-50">{submitting ? "建立中..." : "建立團購"}</button></div></section>
    </form>

    <section className="mt-10"><h2 className="text-xl font-bold">目前團購</h2><div className="mt-4 overflow-hidden rounded-3xl border border-[var(--border)] bg-white">{groups.length === 0 ? <div className="p-8 text-center text-sm text-[var(--muted)]">目前還沒有團購。</div> : groups.map((group) => <div key={group.id} className="flex flex-col gap-2 border-b border-[var(--border)] p-5 last:border-0 md:flex-row md:items-center md:justify-between"><div><div className="font-semibold">{group.name}</div><div className="mt-1 text-sm text-[var(--muted)]">{formatDate(group.start_at)} ～ {formatDate(group.end_at)}</div></div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-[var(--muted)]">{group.status}</span></div>)}</div></section>
  </div></main>;
}
