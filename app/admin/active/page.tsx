"use client";

import { useEffect, useMemo, useState } from "react";

type OrderItem = { productId: string; productName: string; unit: string; quantity: number; unitPrice: number; amount: number };
type OrderRow = { id: string; employeeId: string; memberName: string; createdAt: string; items: OrderItem[]; totalAmount: number; totalQuantity: number };
type ProductTotal = { productId: string; productName: string; unit: string; quantity: number; unitPrice: number; amount: number };
type ActiveGroup = { id: string; name: string; description: string | null; start_at: string; end_at: string; orderCount: number; totalQuantity: number; totalAmount: number; productTotals: ProductTotal[]; orders: OrderRow[] };

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatMoney(value: number) { return `$ ${Math.round(value).toLocaleString("zh-TW")}`; }

export default function ActiveGroupsPage() {
  const [groups, setGroups] = useState<ActiveGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/admin/active-orders", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "無法取得跟單資料");
      const nextGroups = (result.data ?? []) as ActiveGroup[];
      setGroups(nextGroups);
      setSelectedId((current) => current && nextGroups.some((group) => group.id === current) ? current : nextGroups[0]?.id ?? null);
      setUpdatedAt(result.updatedAt ?? new Date().toISOString());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法取得跟單資料");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const selected = useMemo(() => groups.find((group) => group.id === selectedId) ?? null, [groups, selectedId]);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
              <h1 className="mt-1 text-2xl font-bold">進行中的團購</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">團購開始後、截止前會自動出現在這裡，查看所有團員目前的跟單狀況。</p>
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <p>{updatedAt ? `最後同步：${formatDate(updatedAt)}` : "同步中..."}</p>
              <button type="button" onClick={load} className="mt-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]">立即同步</button>
            </div>
          </div>
        </header>

        {loading && <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">正在載入進行中的團購...</div>}
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && groups.length === 0 && (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <h2 className="font-semibold">目前沒有進行中的團購</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">團購到達開始時間後會自動出現在這裡。</p>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="space-y-3">
              {groups.map((group) => (
                <button key={group.id} type="button" onClick={() => setSelectedId(group.id)} className={`w-full rounded-2xl border p-5 text-left transition ${selectedId === group.id ? "border-[var(--accent)] bg-white shadow-sm" : "border-[var(--border)] bg-white/70 hover:bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-bold">{group.name}</h2>
                    <span className="rounded-full bg-[#e8f4ef] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">進行中</span>
                  </div>
                  <p className="mt-3 text-xs text-[var(--muted)]">{formatDate(group.start_at)} ～ {formatDate(group.end_at)}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-[#f6f6f2] p-2"><p className="text-[var(--muted)]">跟單人數</p><p className="mt-1 font-bold">{group.orderCount}</p></div>
                    <div className="rounded-xl bg-[#f6f6f2] p-2"><p className="text-[var(--muted)]">總件數</p><p className="mt-1 font-bold">{group.totalQuantity}</p></div>
                    <div className="rounded-xl bg-[#f6f6f2] p-2"><p className="text-[var(--muted)]">目前金額</p><p className="mt-1 font-bold">{formatMoney(group.totalAmount)}</p></div>
                  </div>
                </button>
              ))}
            </section>

            {selected && (
              <section className="space-y-6">
                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3"><h2 className="text-2xl font-bold">{selected.name}</h2><span className="rounded-full bg-[#e8f4ef] px-3 py-1 text-xs font-semibold text-[var(--accent)]">進行中</span></div>
                      {selected.description && <p className="mt-2 text-sm text-[var(--muted)]">{selected.description}</p>}
                      <p className="mt-3 text-sm text-[var(--muted)]">開始：{formatDate(selected.start_at)}　截止：{formatDate(selected.end_at)}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-right">
                      <div><p className="text-xs text-[var(--muted)]">跟單人數</p><p className="mt-1 text-xl font-bold">{selected.orderCount}</p></div>
                      <div><p className="text-xs text-[var(--muted)]">總件數</p><p className="mt-1 text-xl font-bold">{selected.totalQuantity}</p></div>
                      <div><p className="text-xs text-[var(--muted)]">目前總額</p><p className="mt-1 text-xl font-bold text-[var(--accent)]">{formatMoney(selected.totalAmount)}</p></div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-bold">商品目前累計</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">價格會依目前全體團員的訂購總量，套用對應價格階梯。</p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[650px] text-sm">
                      <thead><tr className="border-b border-[var(--border)] text-left text-[var(--muted)]"><th className="px-3 py-3">商品</th><th className="px-3 py-3">目前數量</th><th className="px-3 py-3">目前單價</th><th className="px-3 py-3 text-right">目前小計</th></tr></thead>
                      <tbody>{selected.productTotals.map((product) => <tr key={product.productId} className="border-b border-[var(--border)]"><td className="px-3 py-3 font-medium">{product.productName}{product.unit ? <span className="ml-1 text-xs text-[var(--muted)]">/{product.unit}</span> : null}</td><td className="px-3 py-3">{product.quantity}</td><td className="px-3 py-3">{formatMoney(product.unitPrice)}</td><td className="px-3 py-3 text-right font-semibold">{formatMoney(product.amount)}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between"><div><h3 className="text-lg font-bold">所有團員跟單狀況</h3><p className="mt-1 text-sm text-[var(--muted)]">每 5 秒自動同步一次。</p></div><span className="text-sm text-[var(--muted)]">共 {selected.orderCount} 筆訂單</span></div>
                  {selected.orders.length === 0 ? <div className="mt-5 rounded-2xl bg-[#f6f6f2] p-6 text-center text-sm text-[var(--muted)]">目前還沒有團員下單。</div> : <div className="mt-5 space-y-4">{selected.orders.map((order) => <article key={order.id} className="rounded-2xl border border-[var(--border)] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold">{order.memberName} <span className="ml-2 font-normal text-sm text-[var(--muted)]">工號 {order.employeeId || "未提供"}</span></h4><p className="mt-1 text-xs text-[var(--muted)]">下單時間：{formatDate(order.createdAt)}</p></div><div className="text-right"><p className="text-xs text-[var(--muted)]">目前訂單金額</p><p className="mt-1 text-lg font-bold text-[var(--accent)]">{formatMoney(order.totalAmount)}</p></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]"><th className="px-2 py-2">商品</th><th className="px-2 py-2">數量</th><th className="px-2 py-2">目前單價</th><th className="px-2 py-2 text-right">小計</th></tr></thead><tbody>{order.items.map((item) => <tr key={`${order.id}-${item.productId}`} className="border-b border-[var(--border)] last:border-0"><td className="px-2 py-2">{item.productName}</td><td className="px-2 py-2">{item.quantity}{item.unit ? ` ${item.unit}` : ""}</td><td className="px-2 py-2">{formatMoney(item.unitPrice)}</td><td className="px-2 py-2 text-right">{formatMoney(item.amount)}</td></tr>)}</tbody></table></div></article>)}</div>}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
