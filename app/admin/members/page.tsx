"use client";

import { useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  employee_id: string;
  name: string;
  created_at: string;
  deleted_at?: string | null;
  totalAmount: number;
};

type SortKey = "newest" | "oldest" | "amountHigh" | "amountLow" | "employeeHigh" | "employeeLow";

function formatAmount(value: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [deletedMembers, setDeletedMembers] = useState<Member[]>([]);
  const [sort, setSort] = useState<SortKey>("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [undoMember, setUndoMember] = useState<Member | null>(null);

  async function loadMembers() {
    setError("");
    try {
      const response = await fetch("/api/admin/members", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "無法讀取成員名單");
      setMembers(result.data ?? []);
      setDeletedMembers(result.deleted ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法讀取成員名單");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "amountHigh":
          return b.totalAmount - a.totalAmount;
        case "amountLow":
          return a.totalAmount - b.totalAmount;
        case "employeeHigh":
          return b.employee_id.localeCompare(a.employee_id);
        case "employeeLow":
          return a.employee_id.localeCompare(b.employee_id);
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [members, sort]);

  async function confirmDelete() {
    if (!confirming) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/members/${confirming.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "刪除成員失敗");
      const deleted = { ...confirming, deleted_at: new Date().toISOString() };
      setMembers((current) => current.filter((member) => member.id !== confirming.id));
      setDeletedMembers((current) => [deleted, ...current]);
      setUndoMember(deleted);
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除成員失敗");
    } finally {
      setDeleting(false);
    }
  }

  async function restoreMember(member: Member) {
    setRestoringId(member.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/members/${member.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "恢復成員失敗");
      setDeletedMembers((current) => current.filter((item) => item.id !== member.id));
      setMembers((current) => [...current, { ...member, deleted_at: null }]);
      setUndoMember(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "恢復成員失敗");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
          <h1 className="mt-1 text-2xl font-bold">成員名單</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">工號、姓名與所有團購的累計金額。刪除採可恢復方式，不會直接清掉歷史訂單。</p>
        </header>

        {undoMember && (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-medium">已刪除 {undoMember.employee_id}－{undoMember.name}，可以立即恢復。</p>
            <button onClick={() => restoreMember(undoMember)} disabled={restoringId === undoMember.id} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50">
              {restoringId === undoMember.id ? "恢復中..." : "立即恢復"}
            </button>
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-[var(--border)] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold">目前成員</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">共 {members.length} 位成員</p>
            </div>
            <label className="flex items-center gap-3 text-sm font-medium">
              排序
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2">
                <option value="newest">新加入 → 舊加入</option>
                <option value="oldest">舊加入 → 新加入</option>
                <option value="amountHigh">金額高 → 低</option>
                <option value="amountLow">金額低 → 高</option>
                <option value="employeeHigh">工號高 → 低</option>
                <option value="employeeLow">工號低 → 高</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">正在讀取成員名單...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm font-medium text-red-600">{error}</div>
          ) : sortedMembers.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">目前還沒有成員資料。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f4f5f1] text-[var(--muted)]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">工號</th>
                    <th className="px-6 py-4 font-semibold">姓名</th>
                    <th className="px-6 py-4 text-right font-semibold">總團購金額</th>
                    <th className="px-6 py-4 text-right font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((member) => (
                    <tr key={member.id} className="border-t border-[var(--border)]">
                      <td className="px-6 py-4 font-medium tracking-wide">{member.employee_id}</td>
                      <td className="px-6 py-4">{member.name}</td>
                      <td className="px-6 py-4 text-right font-semibold">{formatAmount(member.totalAmount)}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => setConfirming(member)} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">刪除成員</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {deletedMembers.length > 0 && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
            <div className="border-b border-amber-100 bg-amber-50 p-5">
              <h2 className="font-bold">已刪除成員</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">資料仍保留，可隨時恢復。歷史團購金額也會保留。</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f4f5f1] text-[var(--muted)]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">工號</th>
                    <th className="px-6 py-4 font-semibold">姓名</th>
                    <th className="px-6 py-4 text-right font-semibold">總團購金額</th>
                    <th className="px-6 py-4 text-right font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedMembers.map((member) => (
                    <tr key={member.id} className="border-t border-[var(--border)]">
                      <td className="px-6 py-4 font-medium tracking-wide">{member.employee_id}</td>
                      <td className="px-6 py-4">{member.name}</td>
                      <td className="px-6 py-4 text-right font-semibold">{formatAmount(member.totalAmount)}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => restoreMember(member)} disabled={restoringId === member.id} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium disabled:opacity-50">
                          {restoringId === member.id ? "恢復中..." : "恢復成員"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <p className="text-sm font-medium text-red-600">第二次確認</p>
            <h2 className="mt-2 text-xl font-bold">確定要刪除這位成員嗎？</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              工號：{confirming.employee_id}<br />
              姓名：{confirming.name}<br />
              歷史團購金額：{formatAmount(confirming.totalAmount)}
            </p>
            <p className="mt-3 rounded-xl bg-[#f4f5f1] p-3 text-xs leading-5 text-[var(--muted)]">刪除後不會清除歷史訂單，之後仍可從「已刪除成員」恢復。</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirming(null)} disabled={deleting} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-3">取消</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{deleting ? "刪除中..." : "確認刪除"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
