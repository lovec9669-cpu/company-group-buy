"use client";

import { useEffect, useState } from "react";

type Member = { employeeId: string; name: string };

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

export default function Home() {
  const [member, setMember] = useState<Member | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadGroups() {
    try {
      const response = await fetch("/api/group-buys", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setGroups(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("company-group-buy-member");
    if (saved) {
      try {
        setMember(JSON.parse(saved));
      } catch {
        localStorage.removeItem("company-group-buy-member");
      }
    }
    loadGroups();
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

  const openGroups = groups.filter((group) => group.status === "open");
  const pastGroups = groups.filter((group) => group.status !== "open");

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
              <button onClick={switchMember} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">切換使用者</button>
            </div>
          ) : (
            <button onClick={() => setShowMemberForm(true)} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white">首次使用／設定身分</button>
          )}
        </header>

        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-xl font-bold">進行中的團購</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">選擇團購後即可查看商品與目前價格。</p>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">正在讀取團購...</div>
          ) : openGroups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">目前沒有進行中的團購。</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {openGroups.map((group) => (
                <article key={group.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                  <span className="inline-flex rounded-full bg-[#e8f3ef] px-3 py-1 text-xs font-semibold text-[var(--accent)]">訂購中</span>
                  <h3 className="mt-3 text-xl font-bold">{group.name}</h3>
                  {group.description && <p className="mt-2 text-sm text-[var(--muted)]">{group.description}</p>}
                  <div className="mt-5 space-y-2 text-sm text-[var(--muted)]">
                    <p>開始：{formatDate(group.start_at)}</p>
                    <p>截止：{formatDate(group.end_at)}</p>
                  </div>
                  <button className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">進入團購</button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-bold">歷次團購</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">團購結束後，最終結果會保留在原團購頁面。</p>
          </div>
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
            {pastGroups.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--muted)]">目前還沒有歷史團購。</div>
            ) : (
              pastGroups.map((group) => (
                <div key={group.id} className="flex flex-col gap-3 border-b border-[var(--border)] p-5 last:border-0 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{group.name}</h3>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-[var(--muted)]">{group.status === "finalized" ? "已結算" : "已截止"}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--muted)]">截止：{formatDate(group.end_at)}</p>
                  </div>
                  <button className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium">查看團購</button>
                </div>
              ))
            )}
          </div>
        </section>

        <footer className="mt-8 text-center">
          <a href="/admin" className="text-xs text-[var(--muted)] hover:underline">管理員入口</a>
        </footer>
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
