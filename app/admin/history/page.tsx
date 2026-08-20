"use client";

import { useEffect, useState } from "react";

type MemberOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type MemberOrder = {
  memberId: string;
  employeeId: string;
  name: string;
  totalAmount: number;
  items: MemberOrderItem[];
};

type HistoryGroup = {
  id: string;
  name: string;
  description: string | null;
  start_at: string;
  end_at: string;
  status: "closed" | "reviewing" | "finalized" | string;
  totalQuantity: number;
  memberCount: number;
  totalAmount: number;
  memberOrders: MemberOrder[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
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

function statusLabel(status: string) {
  return status === "closed"
    ? "待確認訂單"
    : status === "reviewing"
      ? "後台計算中"
      : status === "finalized"
        ? "計算完成"
        : status;
}

export default function HistoryPage() {
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadHistory() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/history", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "無法取得歷史團購資料");

      const normalized = (Array.isArray(result.data) ? result.data : []).map((group: HistoryGroup) => ({
        ...group,
        memberOrders: Array.isArray(group.memberOrders) ? group.memberOrders : [],
        totalQuantity: Number(group.totalQuantity ?? 0),
        memberCount: Number(group.memberCount ?? 0),
        totalAmount: Number(group.totalAmount ?? 0),
      }));

      setGroups(normalized);
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法取得歷史團購資料");
    } finally {
      setLoading(false);
    }
  }

  async function advanceStatus(group: HistoryGroup) {
    const next =
      group.status === "closed"
        ? "reviewing"
        : group.status === "reviewing"
          ? "finalized"
          : null;
    if (!next) return;

    const prompt =
      group.status === "closed"
        ? `確定已確認「${group.name}」的訂單，開始後台計算嗎？`
        : `確定已完成「${group.name}」的計算，要發布結果讓首頁顯示總訂單金額嗎？`;

    if (!window.confirm(prompt)) return;

    setActionId(group.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/group-buys/${group.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "更新團購狀態失敗");
      setMessage(result.message ?? "團購狀態已更新");
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新團購狀態失敗");
    } finally {
      setActionId(null);
    }
  }

  async function deleteHistoryGroup(group: HistoryGroup) {
    const confirmed = window.confirm(
      `確定要刪除歷史團購「${group.name}」嗎？\n\n這會同時刪除這次團購的商品、訂單與訂單明細，刪除後無法復原。`,
    );
    if (!confirmed) return;

    setActionId(group.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/group-buys/${group.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "刪除團購失敗");

      if (expandedId === group.id) setExpandedId(null);
      setMessage(result.message ?? "歷史團購已刪除");
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "刪除團購失敗");
    } finally {
      setActionId(null);
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
          <p className="mt-2 text-sm text-[var(--muted)]">
            團購截止後，先確認訂單，再完成後台計算，最後發布結果。已完成的歷史團購可以刪除。
          </p>
        </header>

        {message && (
          <div className="mb-4 rounded-2xl bg-[#e8f3ef] p-4 text-sm font-medium text-[var(--accent)]">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            正在讀取歷史團購...
          </div>
        ) : error ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-red-600 shadow-sm">
            <p>{error}</p>
            <button
              onClick={loadHistory}
              className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-white"
            >
              重新讀取
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            目前還沒有歷史團購。
          </div>
        ) : (
          <section className="space-y-4">
            {groups.map((group) => {
              const expanded = expandedId === group.id;
              const deleting = actionId === group.id;

              return (
                <article key={group.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : group.id)}
                    className="flex w-full items-center justify-between gap-4 p-6 text-left hover:bg-[#fafbf9]"
                  >
                    <div>
                      <h2 className="text-lg font-bold">{group.name}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        結束時間：{formatDate(group.end_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {group.status === "finalized" && (
                        <span className="text-sm font-semibold text-[var(--accent)]">
                          $ {formatMoney(group.totalAmount)}
                        </span>
                      )}
                      <span className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">
                        {expanded ? "收起" : "查看資料"}
                      </span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-[var(--border)] p-6">
                      <div className="mb-5 flex flex-col gap-4 rounded-2xl bg-[#f4f5f1] p-5 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs text-[var(--muted)]">目前流程狀態</p>
                          <p className="mt-1 text-lg font-bold">{statusLabel(group.status)}</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {group.status === "closed" && (
                            <button
                              disabled={actionId === group.id}
                              onClick={() => advanceStatus(group)}
                              className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {actionId === group.id ? "處理中…" : "確認訂單並開始計算"}
                            </button>
                          )}

                          {group.status === "reviewing" && (
                            <button
                              disabled={actionId === group.id}
                              onClick={() => advanceStatus(group)}
                              className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {actionId === group.id ? "發布中…" : "發布計算完成"}
                            </button>
                          )}

                          {group.status === "finalized" && (
                            <>
                              <span className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[var(--accent)]">
                                已發布，首頁可查看總金額
                              </span>
                              <button
                                disabled={deleting}
                                onClick={() => deleteHistoryGroup(group)}
                                className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {deleting ? "刪除中…" : "刪除團購"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mb-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-[#f4f5f1] p-4">
                          <p className="text-xs text-[var(--muted)]">團購期間</p>
                          <p className="mt-1 text-sm font-semibold">
                            {formatDate(group.start_at)} ～ {formatDate(group.end_at)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#f4f5f1] p-4">
                          <p className="text-xs text-[var(--muted)]">總訂購數量</p>
                          <p className="mt-1 text-lg font-bold">{group.totalQuantity} 件</p>
                        </div>
                        <div className="rounded-2xl bg-[#f4f5f1] p-4">
                          <p className="text-xs text-[var(--muted)]">訂購人數</p>
                          <p className="mt-1 text-lg font-bold">{group.memberCount} 人</p>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                        <div className="grid grid-cols-[150px_1fr_90px_120px] bg-[#f4f5f1] px-5 py-3 text-sm font-semibold">
                          <div>訂購人</div>
                          <div>商品</div>
                          <div className="text-right">數量</div>
                          <div className="text-right">金額</div>
                        </div>

                        {group.memberOrders.length === 0 ? (
                          <div className="p-6 text-center text-sm text-[var(--muted)]">
                            這次團購沒有可顯示的訂購資料。
                          </div>
                        ) : (
                          group.memberOrders.map((member) => (
                            <div key={member.memberId} className="border-t border-[var(--border)]">
                              {member.items.map((item, index) => (
                                <div
                                  key={`${member.memberId}-${item.productId}-${index}`}
                                  className="grid grid-cols-[150px_1fr_90px_120px] px-5 py-3 text-sm"
                                >
                                  <div className="font-medium">
                                    {index === 0 ? (
                                      <>
                                        {member.name}
                                        <span className="ml-2 text-xs text-[var(--muted)]">
                                          {member.employeeId}
                                        </span>
                                      </>
                                    ) : null}
                                  </div>
                                  <div>
                                    <div className="font-medium">{item.productName}</div>
                                    <div className="text-xs text-[var(--muted)]">
                                      單價 $ {formatMoney(item.unitPrice)}
                                    </div>
                                  </div>
                                  <div className="text-right">{item.quantity}</div>
                                  <div className="text-right font-semibold">
                                    $ {formatMoney(item.amount)}
                                  </div>
                                </div>
                              ))}
                              <div className="flex justify-end border-t border-[var(--border)] bg-[#fafbf9] px-5 py-3 text-sm font-semibold">
                                {member.name} 小計：$ {formatMoney(member.totalAmount)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {group.status === "finalized" && (
                        <div className="mt-5 flex justify-end rounded-2xl bg-[#f4f5f1] p-5">
                          <div className="text-right">
                            <p className="text-sm text-[var(--muted)]">團購總金額</p>
                            <p className="mt-1 text-2xl font-bold text-[var(--accent)]">
                              $ {formatMoney(group.totalAmount)}
                            </p>
                          </div>
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
