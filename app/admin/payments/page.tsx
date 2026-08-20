"use client";

import { useEffect, useState } from "react";

type PaymentMember = { memberId: string; orderId: string; employeeId: string; name: string; totalAmount: number; paid: boolean };
type PaymentGroup = { id: string; name: string; start_at: string; end_at: string; status: string; memberCount: number; totalAmount: number; paidCount: number; members: PaymentMember[] };

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value);
}

export default function PaymentsPage() {
  const [groups, setGroups] = useState<PaymentGroup[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingPaid, setPendingPaid] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/payments", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "無法取得待收款資料");
      const nextGroups: PaymentGroup[] = result.data ?? [];
      setGroups(nextGroups);
      setPendingPaid(Object.fromEntries(nextGroups.flatMap((group) => group.members.map((member) => [member.orderId, member.paid]))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法取得待收款資料");
    } finally {
      setLoading(false);
    }
  }

  function getPaid(member: PaymentMember) {
    return pendingPaid[member.orderId] ?? member.paid;
  }

  function togglePaid(member: PaymentMember) {
    setPendingPaid((current) => ({ ...current, [member.orderId]: !getPaid(member) }));
    setError("");
    setMessage("");
  }

  async function saveGroupPayments(group: PaymentGroup) {
    const updates = group.members.map((member) => ({ orderId: member.orderId, paid: getPaid(member) }));
    setBusyId(group.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "members", groupBuyId: group.id, updates }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "儲存付款狀態失敗");
      setMessage(result.message ?? "付款狀態已儲存");
      await load();
      setExpandedId(group.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "儲存付款狀態失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function finalizeGroup(group: PaymentGroup) {
    const allPaid = group.memberCount > 0 && group.members.every((member) => getPaid(member));
    if (!allPaid) {
      setError("仍有人尚未付款，請先把所有人的開關切到 ON 並儲存付款狀態。");
      return;
    }
    if (group.members.some((member) => getPaid(member) !== member.paid)) {
      setError("付款狀態尚有尚未儲存的變更，請先按「儲存付款狀態」。");
      return;
    }
    if (!window.confirm(`確定「${group.name}」所有人都已付款，要移到歷史團購嗎？`)) return;
    setBusyId(group.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "group", groupBuyId: group.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "移到歷史團購失敗");
      setMessage(result.message ?? "已移到歷史團購");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "移到歷史團購失敗");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
          <h1 className="mt-1 text-2xl font-bold">已完成待收款</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">這裡顯示已發布結果的團購。每位團員會顯示這一次團購的應收總金額，付款狀態預設都是 OFF，由管理員先調整，最後一次儲存。</p>
        </header>

        {message && <div className="mb-4 rounded-2xl bg-[#e8f3ef] p-4 text-sm font-medium text-[var(--accent)]">{message}</div>}
        {error && <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-600">{error}</div>}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">正在讀取待收款團購...</div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">目前沒有待收款團購。</div>
        ) : (
          <section className="space-y-4">
            {groups.map((group) => {
              const expanded = expandedId === group.id;
              const allPaid = group.memberCount > 0 && group.members.every((member) => getPaid(member));
              const hasUnsavedChanges = group.members.some((member) => getPaid(member) !== member.paid);
              return (
                <article key={group.id} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                  <button type="button" onClick={() => setExpandedId(expanded ? null : group.id)} className="flex w-full items-center justify-between gap-4 p-6 text-left hover:bg-[#fafbf9]">
                    <div>
                      <h2 className="text-lg font-bold">{group.name}</h2>
                      <p className="mt-1 text-sm text-[var(--muted)]">結束時間：{formatDate(group.end_at)} · 已付款 {group.members.filter((member) => getPaid(member)).length}/{group.memberCount} 人</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-bold text-[var(--accent)]">$ {formatMoney(group.totalAmount)}</span>
                      <span className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">{expanded ? "收起" : "查看收款"}</span>
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-[var(--border)] p-6">
                      <div className="mb-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-[#f4f5f1] p-4"><p className="text-xs text-[var(--muted)]">團購期間</p><p className="mt-1 text-sm font-semibold">{formatDate(group.start_at)} ～ {formatDate(group.end_at)}</p></div>
                        <div className="rounded-2xl bg-[#f4f5f1] p-4"><p className="text-xs text-[var(--muted)]">應收總金額</p><p className="mt-1 text-lg font-bold">$ {formatMoney(group.totalAmount)}</p></div>
                        <div className="rounded-2xl bg-[#f4f5f1] p-4"><p className="text-xs text-[var(--muted)]">付款進度</p><p className="mt-1 text-lg font-bold">{group.members.filter((member) => getPaid(member)).length} / {group.memberCount} 人</p></div>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
                        <div className="grid grid-cols-[1fr_180px_150px] bg-[#f4f5f1] px-5 py-3 text-sm font-semibold"><div>團員</div><div className="text-right">本次應付金額</div><div className="text-right">付款狀態</div></div>
                        {group.members.map((member) => {
                          const paid = getPaid(member);
                          return (
                            <div key={member.orderId} className="grid grid-cols-[1fr_180px_150px] items-center border-t border-[var(--border)] px-5 py-4 text-sm">
                              <div><div className="font-semibold">{member.name}</div><div className="mt-1 text-xs text-[var(--muted)]">工號：{member.employeeId}</div></div>
                              <div className="text-right text-base font-bold">$ {formatMoney(member.totalAmount)}</div>
                              <div className="flex justify-end">
                                <button type="button" role="switch" aria-checked={paid} onClick={() => togglePaid(member)} className={`relative h-8 w-14 rounded-full transition ${paid ? "bg-[var(--accent)]" : "bg-gray-300"}`}>
                                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition ${paid ? "left-7" : "left-1"}`} />
                                </button>
                                <span className={`ml-2 w-10 text-xs font-semibold ${paid ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{paid ? "ON" : "OFF"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-5 flex flex-col items-end gap-3 rounded-2xl bg-[#f4f5f1] p-5">
                        <p className="text-sm text-[var(--muted)]">可以先把所有人的付款開關一次調整好，再按儲存。儲存後才會寫入資料庫。</p>
                        <div className="flex flex-wrap justify-end gap-3">
                          <button type="button" disabled={!hasUnsavedChanges || busyId === group.id} onClick={() => saveGroupPayments(group)} className="rounded-xl border border-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40">
                            {busyId === group.id ? "儲存中…" : "儲存付款狀態"}
                          </button>
                          <button type="button" disabled={!allPaid || hasUnsavedChanges || busyId === group.id} onClick={() => finalizeGroup(group)} className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                            {busyId === group.id ? "處理中…" : "全部收款完成，移到歷史團購"}
                          </button>
                        </div>
                      </div>
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
