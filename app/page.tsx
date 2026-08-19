"use client";

import { useEffect, useState } from "react";

type Member = { id?: string; employeeId: string; name: string };
type GroupBuy = { id: string; name: string; description: string | null; start_at: string; end_at: string; status: "open" | "closed" | "reviewing" | "finalized" };
type GroupDetail = GroupBuy & { totalAmount: number | null; products: { productId: string; productName: string; quantity: number; amount: number }[] };

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatMoney(value: number) { return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value); }
function normalizeEmployeeId(value: string) { return value.replace(/\D/g, "").slice(0, 5).padStart(5, "0"); }

const steps = ["團購中", "截止", "後台計算中", "計算完成", "顯示訂單金額"];
function statusStep(status: GroupBuy["status"]) { return status === "open" ? 1 : status === "closed" ? 2 : status === "reviewing" ? 3 : 4; }
function statusText(status: GroupBuy["status"]) { return status === "open" ? "團購中" : status === "closed" ? "截止" : status === "reviewing" ? "後台計算中" : "計算完成"; }

function StatusFlow({ status }: { status: GroupBuy["status"] }) {
  const current = statusStep(status);
  return <div className="mt-5 overflow-x-auto"><div className="flex min-w-[680px] items-start">{steps.map((step, index) => { const number = index + 1; const done = number <= current; const active = number === current; return <div key={step} className="flex flex-1 items-start"><div className="flex min-w-0 flex-1 flex-col items-center"><div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${done ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white text-[var(--muted)]"}`}>{number}</div><div className={`mt-2 text-center text-xs font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{step}</div></div>{index < steps.length - 1 && <div className={`mt-4 h-0.5 flex-1 ${number < current ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />}</div>; })}</div></div>;
}

export default function Home() {
  const [member, setMember] = useState<Member | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<GroupBuy[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadGroups() {
    try {
      const response = await fetch("/api/group-buys", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setGroups(result.data ?? []);
    } finally { setLoading(false); }
  }

  async function openGroup(group: GroupBuy) {
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/group-buys/${group.id}/public`, { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setSelectedGroup(result.data);
    } finally { setLoadingDetail(false); }
  }

  useEffect(() => {
    const saved = localStorage.getItem("company-group-buy-member");
    if (saved) { try { setMember(JSON.parse(saved)); } catch { localStorage.removeItem("company-group-buy-member"); } }
    loadGroups();
  }, []);

  async function saveMember() {
    setMemberError("");
    const normalized = normalizeEmployeeId(employeeId);
    if (normalized.length !== 5) { setMemberError("工號必須是 1～5 位數字，系統會自動補成 5 位數。"); return; }
    if (!name.trim()) { setMemberError("請輸入姓名。"); return; }
    setSavingMember(true);
    try {
      const response = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: normalized, name: name.trim() }) });
      const result = await response.json();
      if (!response.ok) { setMemberError(result.error ?? "成員資料儲存失敗"); return; }
      const next: Member = result.data;
      localStorage.setItem("company-group-buy-member", JSON.stringify(next));
      setMember(next); setEmployeeId(next.employeeId); setName(next.name); setShowMemberForm(false);
    } catch { setMemberError("無法連線到伺服器，請稍後再試"); }
    finally { setSavingMember(false); }
  }

  function switchMember() { setMemberError(""); setEmployeeId(member?.employeeId ?? ""); setName(member?.name ?? ""); setShowMemberForm(true); }
  async function adminLogin(event: React.FormEvent) { event.preventDefault(); setAdminError(""); setAdminLoggingIn(true); try { const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminPassword }) }); const result = await response.json(); if (!response.ok) { setAdminError(result.error ?? "管理員密碼錯誤"); return; } window.location.href = "/admin"; } catch { setAdminError("無法連線到伺服器，請稍後再試"); } finally { setAdminLoggingIn(false); } }

  const openGroups = groups.filter((group) => group.status === "open");
  const closedGroups = groups.filter((group) => group.status === "closed" || group.status === "reviewing");
  const pastGroups = groups.filter((group) => group.status === "finalized");

  const GroupCard = ({ group, tone }: { group: GroupBuy; tone: "open" | "closed" | "past" }) => <article className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><button type="button" onClick={() => openGroup(group)} className="text-left text-lg font-bold hover:text-[var(--accent)] hover:underline">{group.name}</button><p className="mt-1 text-sm text-[var(--muted)]">截止：{formatDate(group.end_at)}</p></div><span className="shrink-0 rounded-full bg-[#f1f3ef] px-3 py-1 text-xs font-semibold text-[var(--muted)]">{tone === "open" ? "進行中" : tone === "closed" ? statusText(group.status) : "已完成"}</span></div>{group.description && <p className="mt-3 text-sm text-[var(--muted)]">{group.description}</p>}<button type="button" onClick={() => openGroup(group)} className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold">查看團購狀況</button></article>;

  return <main className="min-h-screen px-5 py-8 md:px-10"><div className="mx-auto max-w-6xl">
    <header className="mb-8 flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between"><div><p className="mb-1 text-sm font-medium text-[var(--accent)]">Company Group Buy</p><h1 className="text-3xl font-bold tracking-tight">公司團購</h1><p className="mt-2 text-sm text-[var(--muted)]">集中管理團購、訂單與最終結算。</p></div>{member ? <div className="flex items-center gap-3 rounded-2xl bg-[#f4f5f1] px-4 py-3"><div><div className="font-semibold">{member.name}</div><div className="text-xs text-[var(--muted)]">員工編號：{member.employeeId}</div></div><button onClick={switchMember} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">切換使用者</button></div> : <button onClick={() => { setMemberError(""); setEmployeeId(""); setName(""); setShowMemberForm(true); }} className="rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white">首次使用／設定身分</button>}</header>

    <section className="mb-8"><div className="mb-4"><h2 className="text-xl font-bold">團購總覽</h2><p className="mt-1 text-sm text-[var(--muted)]">團購截止後會進入後台確認與計算流程，只有發布完成後才公開總訂單金額。</p></div>{loading ? <div className="rounded-3xl border border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">正在讀取團購...</div> : <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-3"><h3 className="font-bold">進行中的團購 <span className="text-sm font-normal text-[var(--muted)]">({openGroups.length})</span></h3>{openGroups.length ? openGroups.map((group) => <GroupCard key={group.id} group={group} tone="open" />) : <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--muted)]">目前沒有進行中的團購。</div>}</div>
      <div className="space-y-3"><h3 className="font-bold">截止的團購 <span className="text-sm font-normal text-[var(--muted)]">({closedGroups.length})</span></h3>{closedGroups.length ? closedGroups.map((group) => <GroupCard key={group.id} group={group} tone="closed" />) : <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--muted)]">目前沒有待處理團購。</div>}</div>
      <div className="space-y-3"><h3 className="font-bold">歷次團購 <span className="text-sm font-normal text-[var(--muted)]">({pastGroups.length})</span></h3>{pastGroups.length ? pastGroups.map((group) => <GroupCard key={group.id} group={group} tone="past" />) : <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--muted)]">目前還沒有完成的歷次團購。</div>}</div>
    </div>}</section>

    {selectedGroup && <section className="mb-8 rounded-3xl bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-[var(--accent)]">團購狀況</p><h2 className="mt-1 text-2xl font-bold">{selectedGroup.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{formatDate(selectedGroup.start_at)} ～ {formatDate(selectedGroup.end_at)}</p></div><button type="button" onClick={() => setSelectedGroup(null)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm">關閉</button></div><StatusFlow status={selectedGroup.status} /><div className="mt-6 rounded-2xl bg-[#f4f5f1] p-5"><p className="text-sm font-semibold">目前狀態：{statusText(selectedGroup.status)}</p>{selectedGroup.status === "closed" && <p className="mt-1 text-sm text-[var(--muted)]">團購已截止，等待管理員確認訂單。</p>}{selectedGroup.status === "reviewing" && <p className="mt-1 text-sm text-[var(--muted)]">管理員已確認訂單，目前正在後台計算最終金額。</p>}{selectedGroup.status === "finalized" && <p className="mt-1 text-sm text-[var(--muted)]">計算完成，最終總訂單金額已公開。</p>}{selectedGroup.status === "finalized" && <div className="mt-4"><p className="text-xs text-[var(--muted)]">總訂單金額</p><p className="mt-1 text-3xl font-bold text-[var(--accent)]">$ {formatMoney(selectedGroup.totalAmount ?? 0)}</p></div>}</div>{loadingDetail && <p className="mt-4 text-sm text-[var(--muted)]">正在更新團購狀況…</p>}</section>}

    <footer className="mt-8 text-center"><button onClick={() => { setAdminError(""); setAdminPassword(""); setShowAdminLogin(true); }} className="text-xs text-[var(--muted)] hover:underline">管理員入口</button></footer>
  </div>

  {showMemberForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">設定團員身分</h2><p className="mt-2 text-sm text-[var(--muted)]">工號一律以 5 位數儲存，例如 9279 會自動變成 09279。</p><label className="mt-5 block text-sm font-medium">員工編號</label><input inputMode="numeric" maxLength={5} value={employeeId} onChange={(e) => setEmployeeId(e.target.value.replace(/\D/g, "").slice(0, 5))} onBlur={() => setEmployeeId(normalizeEmployeeId(employeeId))} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" placeholder="例如：09279" /><label className="mt-4 block text-sm font-medium">姓名</label><input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3" placeholder="例如：王小明" />{memberError && <p className="mt-3 text-sm font-medium text-red-600">{memberError}</p>}<div className="mt-6 flex gap-3"><button onClick={() => setShowMemberForm(false)} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-3">取消</button><button onClick={saveMember} disabled={savingMember} className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:opacity-50">{savingMember ? "確認中..." : "儲存"}</button></div></div></div>}
  {showAdminLogin && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-5"><div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"><div className="text-center"><p className="text-sm font-medium text-[var(--accent)]">Company Group Buy</p><h2 className="mt-2 text-2xl font-bold">管理員入口</h2><p className="mt-2 text-sm text-[var(--muted)]">請輸入管理員密碼後進入後台。</p></div><form onSubmit={adminLogin} className="mt-6"><label className="text-sm font-medium">管理員密碼</label><input autoFocus type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none focus:border-[var(--accent)]" placeholder="請輸入密碼" required />{adminError && <p className="mt-3 text-sm font-medium text-red-600">{adminError}</p>}<div className="mt-6 flex gap-3"><button type="button" onClick={() => setShowAdminLogin(false)} className="flex-1 rounded-xl border border-[var(--border)] px-4 py-3">取消</button><button type="submit" disabled={adminLoggingIn} className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:opacity-50">{adminLoggingIn ? "驗證中..." : "登入後台"}</button></div></form></div></div>}
  </main>;
}
