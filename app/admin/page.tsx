"use client";

import { FormEvent, useEffect, useState } from "react";

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

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [groups, setGroups] = useState<GroupBuy[]>([]);
  const [message, setMessage] = useState("");

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
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setMessage("管理員密碼錯誤");
      return;
    }

    setLoggedIn(true);
    setPassword("");
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const response = await fetch("/api/group-buys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, startAt, endAt }),
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "建立失敗");
      return;
    }

    setMessage("團購建立成功");
    setName("");
    setDescription("");
    setStartAt("");
    setEndAt("");
    await loadGroups();
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]"
              required
            />
            <button className="mt-4 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">登入</button>
          </form>
          {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between rounded-3xl bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
            <h1 className="mt-1 text-2xl font-bold">團購管理後台</h1>
          </div>
          <a href="/" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm">回首頁</a>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">建立新團購</h2>
          <form onSubmit={createGroup} className="mt-5 grid gap-5 md:grid-cols-2">
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
            <div className="md:col-span-2 flex items-center justify-between gap-4">
              {message ? <p className="text-sm text-[var(--accent)]">{message}</p> : <span />}
              <button className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white">建立團購</button>
            </div>
          </form>
        </section>

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
