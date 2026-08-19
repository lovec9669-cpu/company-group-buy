"use client";

import { useEffect, useState } from "react";

type ProductResult = {
  productId: string;
  productName: string;
  quantity: number;
  finalAmount: number;
};

type HistoryGroup = {
  id: string;
  name: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: string;
  products: ProductResult[];
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value);
}

export default function HistoryPage() {
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadHistory() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/history", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "無法取得歷史團購資料");
      setGroups(result.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法取得歷史團購資料");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
          <h1 className="mt-1 text-2xl font-bold">歷史團購</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">點選團購名稱，在同一個頁面查看該次團購的最終商品數量與金額。</p>
        </header>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">正在讀取歷史團購...</div>
        ) : error ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-red-600 shadow-sm">
            <p>{error}</p>
            <button onClick={loadHistory} className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white">重新讀取</button>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">目前還沒有歷史團購。</div>
        ) : (
          <section className="space-y-4">
            {groups.map((group) => {
              const expanded = expandedId === group.id;
              const totalAmount = group.products.reduce((sum, product) => sum + product.finalAmount, 0);
              const totalQuantity = group.products.reduce((sum, product) => sum + product.quantity, 0);

              return (
                <article key={group.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : group.id)}
                    className="flex w-full items-center justify-between gap-4 p-6 text-left hover:bg-[#fafbf9]"
                  >
                    <div>
                      <h2 className="text-lg font-bold">{group.name}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">結束時間：{formatDate(group.end_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">
                      {expanded ? "收起" : "查看資料"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-[var(--border)] p-6">
                      <div className="mb-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-[#f4f5f1] p-4">
                          <p className="text-xs text-[var(--muted)]">團購期間</p>
                          <p className="mt-1 text-sm font-semibold">{formatDate(group.start_at)} ～ {formatDate(group.end_at)}</p>
                        </div>
                        <div className="rounded-2xl bg-[#f4f5f1] p-4">
                          <p className="text-xs text-[var(--muted)]">總數量</p>
                          <p className="mt-1 text-lg font-bold">{totalQuantity} 件</p>
                        </div>
                        <div className="rounded-2xl bg-[#f4f5f1] p-4">
                          <p className="text-xs text-[var(--muted)]">最終總金額</p>
                          <p className="mt-1 text-lg font-bold">$ {formatMoney(totalAmount)}</p>
                        </div>
                      </div>

                      {group.products.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">這次團購沒有可顯示的訂購資料。</div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                          <div className="grid grid-cols-[1fr_140px_180px] bg-[#f4f5f1] px-5 py-3 text-sm font-semibold">
                            <div>商品名稱</div>
                            <div className="text-right">數量</div>
                            <div className="text-right">最終金額</div>
                          </div>
                          {group.products.map((product) => (
                            <div key={product.productId} className="grid grid-cols-[1fr_140px_180px] border-t border-[var(--border)] px-5 py-4 text-sm">
                              <div className="font-medium">{product.productName}</div>
                              <div className="text-right">{product.quantity}</div>
                              <div className="text-right font-semibold">$ {formatMoney(product.finalAmount)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
