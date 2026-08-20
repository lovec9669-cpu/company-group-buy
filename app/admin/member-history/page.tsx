"use client";

import { useEffect, useMemo, useState } from "react";

type Member = {
  id: string;
  employee_id: string;
  name: string;
  totalAmount: number;
};

type HistoryItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type HistoryMemberOrder = {
  memberId: string;
  employeeId: string;
  name: string;
  totalAmount: number;
  items: HistoryItem[];
};

type HistoryGroup = {
  id: string;
  name: string;
  start_at: string;
  end_at: string;
  totalAmount: number;
  memberOrders: HistoryMemberOrder[];
};

type MemberHistory = Member & {
  groupBuys: { id: string; name: string; endAt: string; totalAmount: number }[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value);
}

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

export default function MemberHistoryPage() {
  const [members, setMembers] = useState<MemberHistory[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [membersResponse, historyResponse] = await Promise.all([
        fetch("/api/admin/members", { cache: "no-store" }),
        fetch("/api/admin/history", { cache: "no-store" }),
      ]);

      const membersResult = await membersResponse.json();
      const historyResult = await historyResponse.json();
      if (!membersResponse.ok) throw new Error(membersResult.error ?? "無法取得成員資料");
      if (!historyResponse.ok) throw new Error(historyResult.error ?? "無法取得歷史團購資料");

      const historyGroups: HistoryGroup[] = historyResult.data ?? [];
      const historyByMember = new Map<string, MemberHistory["groupBuys"]>();

      for (const group of historyGroups) {
        for (const memberOrder of group.memberOrders ?? []) {
          const current = historyByMember.get(memberOrder.memberId) ?? [];
          current.push({
            id: group.id,
            name: group.name,
            endAt: group.end_at,
            totalAmount: Number(memberOrder.totalAmount ?? 0),
          });
          historyByMember.set(memberOrder.memberId, current);
        }
      }

      const rows: MemberHistory[] = (membersResult.data ?? []).map((member: Member) => {
        const groupBuys = (historyByMember.get(member.id) ?? []).sort(
          (a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime(),
        );
        return {
          ...member,
          totalAmount: groupBuys.reduce((sum, group) => sum + group.totalAmount, 0),
          groupBuys,
        };
      });

      setMembers(rows);
      setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法取得成員團購歷史明細");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalMembers = useMemo(() => members.length, [members]);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
          <h1 className="mt-1 text-2xl font-bold">成員團購歷史明細</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            顯示每位成員的工號、姓名與所有已完成團購的累計金額。按右側按鈕可展開查看參加過的每一筆團購與該次總金額。
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-600">
            {error}
            <button type="button" onClick={load} className="ml-3 underline">
              重新讀取
            </button>
          </div>
        )}

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            正在讀取成員團購歷史明細...
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            目前沒有成員資料。
          </div>
        ) : (
          <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <p className="text-sm font-semibold">成員名單</p>
              <p className="text-sm text-[var(--muted)]">共 {totalMembers} 人</p>
            </div>

            <div className="grid grid-cols-[180px_1fr_220px_120px] gap-4 bg-[#f4f5f1] px-6 py-3 text-sm font-semibold">
              <div>工號</div>
              <div>姓名</div>
              <div className="text-right">所有團購總金額</div>
              <div className="text-right">明細</div>
            </div>

            {members.map((member) => {
              const expanded = expandedId === member.id;
              return (
                <article key={member.id} className="border-b border-[var(--border)] last:border-b-0">
                  <div className="grid grid-cols-[180px_1fr_220px_120px] items-center gap-4 px-6 py-5">
                    <div className="text-sm font-semibold">{member.employee_id}</div>
                    <div className="text-sm font-semibold">{member.name}</div>
                    <div className="text-right text-base font-bold text-[var(--accent)]">
                      $ {formatMoney(member.totalAmount)}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedId(expanded ? null : member.id)}
                        className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium transition hover:bg-[#fafbf9]"
                      >
                        {expanded ? "收起" : "查看明細"}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-[var(--border)] bg-[#fafbf9] px-6 py-5">
                      {member.groupBuys.length === 0 ? (
                        <div className="rounded-2xl bg-white p-5 text-sm text-[var(--muted)]">
                          此成員尚無已完成的團購紀錄。
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                          <div className="grid grid-cols-[1fr_220px_180px] bg-[#f4f5f1] px-5 py-3 text-sm font-semibold">
                            <div>團購</div>
                            <div>結束時間</div>
                            <div className="text-right">本次團購總金額</div>
                          </div>
                          {member.groupBuys.map((group) => (
                            <div
                              key={group.id}
                              className="grid grid-cols-[1fr_220px_180px] items-center border-t border-[var(--border)] px-5 py-4 text-sm"
                            >
                              <div className="font-semibold">{group.name}</div>
                              <div className="text-[var(--muted)]">{formatDate(group.endAt)}</div>
                              <div className="text-right text-base font-bold">$ {formatMoney(group.totalAmount)}</div>
                            </div>
                          ))}
                          <div className="flex items-center justify-between border-t border-[var(--border)] bg-[#f4f5f1] px-5 py-4">
                            <span className="text-sm font-semibold">此成員所有已完成團購總金額</span>
                            <span className="text-lg font-bold text-[var(--accent)]">$ {formatMoney(member.totalAmount)}</span>
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
