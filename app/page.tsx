"use client";

import { useEffect, useState } from "react";

type Member = { employeeId: string; name: string };

type GroupBuy = {
  id: string;
  name: string;
  start: string;
  end: string;
  status: "open" | "closed" | "finalized";
  participants: number;
};

const demoGroups: GroupBuy[] = [
  {
    id: "chicken-breast",
    name: "雞胸肉團購",
    start: "2026-08-20 09:00",
    end: "2026-08-25 18:00",
    status: "open",
    participants: 0,
  },
  {
    id: "bagel",
    name: "貝果團購",
    start: "2026-08-22 09:00",
    end: "2026-08-27 18:00",
    status: "open",
    participants: 0,
  },
  {
    id: "snacks",
    name: "零食團購",
    start: "2026-08-10 09:00",
    end: "2026-08-18 18:00",
    status: "finalized",
    participants: 25,
  },
];

export default function Home() {
  const [member, setMember] = useState<Member | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("company-group-buy-member");
    if (saved) setMember(JSON.parse(saved));
  }, []);

  function saveMember() {
    if (!employeeId.trim() || !name.trim()) return;
    const next = { employeeId: employeeId.trim(), name: name.trim() };
    localStorage.setItem("company-group-buy-member", JSON.stringify(next));
    setMember(next);
    setShowMemberForm(false);
  }

  function switchMember() {
    localStorage.removeItem("company-group-buy-member");
    setMember(null);
    setEmployeeId("");
    setName("");
    setShowMemberForm(true);
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-[var(--accent)]">Company Group Buy</p>
            <h1 className="text-3xl font-bold tracking-tight">公司團購</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">集中管理團購、訂單與最終結算。</p>
          </div>

          {member ? (
            <div className="flex items-center gap-3 rounded-2xl bg-[#f4f5f1] px-4 py-3">
              <div>
                <div className="font-semibold">{member.name}</div>
                <div className="text-xs text-[var(--muted)]">員工編號：{member.employeeId}</div>
              </div>
              <button onClick={switchMember} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                切換使用者
              </button>
            </div>
          ) : (
            <button onClick={() => setShowMemberForm(true)} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white">
              首次使用／設定身分
            </button>
          )}
        </header>

        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold">進行中的團購</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">選擇團購後即可查看商品與目前價格。</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {demoGroups.filter((g) => g.status === "open").map((group) => (
              <article key={group.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex rounded-full bg-[#e8f3ef] px-3 py-1 text-xs font-semibold text-[var(--accent)]">訂購中</span>
                    <h3 className="mt-3 text-xl font-bold">{group.name}</h3>
                  </div>
                  <span className="text-sm text-[var(--muted)]">{group.participants} 人</span>
                </div>
                <div className="space-y-2 text-sm text-[var(--muted)]">
                  <p>開始：{group.start}</p>
                  <p>截止：{group.end}</p>
                </div>
                <button className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">進入團購</button>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold">歷次團購</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">團購結束後，最終結果會保留在原團購頁面。</p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
            {demoGroups.filter((g) => g.status === "finalized").map((group) => (
              <div key={group.id} className="flex flex-col gap-3 border-b border-[var(--border)] p-5 last:border-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{group.name}</h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-[var(--muted)]">已結算</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">參與人數：{group.participants} 人</p>
                </div>
                <button className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">查看最終結果</button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showMemberForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold">設定團員身分</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">只需設定一次，這台電腦之後會自動記住你的資料。</p>
            <label className="mt-5 block text-sm font-medium">員工編號</label>
            <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" placeholder="例如：A12345" />
            <label className="mt-4 block text-sm font-medium">姓名</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" placeholder="例如：王小明" />
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowMemberForm(false)} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-3">取消</button>
              <button onClick={saveMember} className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">儲存</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
