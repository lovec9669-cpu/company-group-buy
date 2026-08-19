"use client";

import { useEffect, useMemo, useState } from "react";

type Member = { id?: string; employeeId: string; name: string };
type GroupBuy = { id: string; name: string; description: string | null; start_at: string; end_at: string; status: "open" | "closed" | "reviewing" | "finalized" };
type Product = { id: string; name: string; description: string | null; unit: string | null; price: number; quantity: number; max_quantity: number | null; orderedQuantity: number; price_group_id: string | null };
type PriceGroup = { id: string; name: string; sort_order: number };
type PriceTier = { id: string; price_group_id: string; min_quantity: number; max_quantity: number | null; unit_price: number };
type GroupDetail = GroupBuy & { products: Product[]; priceGroups: PriceGroup[]; priceTiers: PriceTier[]; totalAmount: number | null };
type MyOrder = { id: string; group_buy_id: string; created_at: string; group?: GroupBuy; items: { productId: string; productName: string; unit: string; quantity: number; finalAmount: number | null }[]; isFinalized: boolean };
type Step = "products" | "confirm";
type Menu = "current" | "closed" | "history" | "myHistory";

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value);
}
function normalizeEmployeeId(value: string) {
  return value.replace(/\D/g, "").slice(0, 5).padStart(5, "0");
}
function getGroupQuantity(group: GroupDetail, product: Product, selectedItems: { product: Product; quantity: number }[]) {
  return selectedItems.filter((item) => item.product.price_group_id === product.price_group_id).reduce((sum, item) => sum + item.quantity, 0);
}
function getTierPrice(group: GroupDetail, product: Product, groupQuantity: number) {
  if (groupQuantity <= 0) return 0;
  const tiers = group.priceTiers.filter((tier) => tier.price_group_id === product.price_group_id).sort((a, b) => a.min_quantity - b.min_quantity);
  const tier = tiers.find((item) => groupQuantity >= item.min_quantity && (item.max_quantity == null || groupQuantity <= item.max_quantity));
  return tier?.unit_price ?? product.price;
}
function StatusBadge({ status }: { status: GroupBuy["status"] }) {
  const text = status === "open" ? "進行中" : status === "closed" ? "截止" : status === "reviewing" ? "後台計算中" : "計算完成";
  return <span className="rounded-full bg-[#f1f3ef] px-3 py-1 text-xs font-semibold text-[var(--muted)]">{text}</span>;
}

export default function Home() {
  const [member, setMember] = useState<Member | null>(null);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [memberError, setMemberError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [groups, setGroups] = useState<GroupBuy[]>([]);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<Menu>("current");
  const [selectedGroup, setSelectedGroup] = useState<GroupDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [orderStep, setOrderStep] = useState<Step>("products");
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);

  async function loadGroups() {
    try {
      const response = await fetch("/api/group-buys", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setGroups(result.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders(currentMember = member) {
    if (!currentMember?.employeeId) {
      setMyOrders([]);
      return;
    }
    const response = await fetch(`/api/my-orders?employeeId=${encodeURIComponent(currentMember.employeeId)}`, { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setMyOrders(result.data ?? []);
  }

  useEffect(() => {
    const saved = localStorage.getItem("company-group-buy-member");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Member;
        setMember(parsed);
        setEmployeeId(parsed.employeeId);
        setName(parsed.name);
        loadOrders(parsed);
      } catch {
        localStorage.removeItem("company-group-buy-member");
      }
    }
    loadGroups();
  }, []);

  async function saveMember() {
    setMemberError("");
    const normalized = normalizeEmployeeId(employeeId);
    if (normalized.length !== 5) {
      setMemberError("請輸入工號，系統會自動補成 5 位數，例如 09279。");
      return;
    }
    if (!name.trim()) {
      setMemberError("請輸入姓名。");
      return;
    }
    setSavingMember(true);
    try {
      const response = await fetch("/api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: normalized, name: name.trim() }) });
      const result = await response.json();
      if (!response.ok) {
        setMemberError(result.error ?? "成員資料儲存失敗");
        return;
      }
      const next: Member = result.data;
      localStorage.setItem("company-group-buy-member", JSON.stringify(next));
      setMember(next);
      setEmployeeId(next.employeeId);
      setName(next.name);
      setShowMemberForm(false);
      await loadOrders(next);
    } catch {
      setMemberError("無法連線到伺服器，請稍後再試");
    } finally {
      setSavingMember(false);
    }
  }

  function openOrder(group: GroupBuy) {
    setOrderError("");
    setOrderStep("products");
    setQuantities({});
    fetch(`/api/group-buys/${group.id}/public`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "無法取得團購");
        setSelectedGroup(result.data);
      })
      .catch((error) => setOrderError(error instanceof Error ? error.message : "無法取得團購資料"));
  }

  function closeOrder() {
    setSelectedGroup(null);
    setOrderStep("products");
    setQuantities({});
    setOrderError("");
  }

  function setQuantity(productId: string, value: number, max: number | null) {
    const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    setQuantities((current) => ({ ...current, [productId]: max != null ? Math.min(safe, max) : safe }));
  }

  const selectedItems = useMemo(() => selectedGroup?.products.filter((product) => (quantities[product.id] ?? 0) > 0).map((product) => ({ product, quantity: quantities[product.id] ?? 0 })) ?? [], [selectedGroup, quantities]);
  const previewTotalQuantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const previewAmount = selectedGroup ? selectedItems.reduce((sum, item) => {
    const groupQuantity = getGroupQuantity(selectedGroup, item.product, selectedItems);
    return sum + item.quantity * getTierPrice(selectedGroup, item.product, groupQuantity);
  }, 0) : 0;

  async function confirmOrder() {
    if (!member?.id || !selectedGroup) return;
    if (!selectedItems.length) {
      setOrderError("請至少選擇一項商品。");
      setOrderStep("products");
      return;
    }
    setSavingOrder(true);
    setOrderError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: member.id, groupBuyId: selectedGroup.id, items: selectedItems.map((item) => ({ productId: item.product.id, quantity: item.quantity })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "訂單送出失敗");
      closeOrder();
      setActiveMenu("current");
      await loadOrders();
      await loadGroups();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "訂單送出失敗");
    } finally {
      setSavingOrder(false);
    }
  }

  async function adminLogin(event: React.FormEvent) {
    event.preventDefault();
    setAdminError("");
    setAdminLoggingIn(true);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: adminPassword }) });
      const result = await response.json();
      if (!response.ok) {
        setAdminError(result.error ?? "管理員密碼錯誤");
        return;
      }
      window.location.href = "/admin";
    } catch {
      setAdminError("無法連線到伺服器，請稍後再試");
    } finally {
      setAdminLoggingIn(false);
    }
  }

  const openGroups = groups.filter((group) => group.status === "open");
  const currentOrders = myOrders.filter((order) => order.group?.status === "open");
  const closedOrders = myOrders.filter((order) => order.group?.status === "closed" || order.group?.status === "reviewing");
  const historyOrders = myOrders.filter((order) => order.group?.status === "finalized" || order.isFinalized);
  const myHistoryOrders = myOrders.filter((order) => !order.id.startsWith("group-") && (order.group?.status === "finalized" || order.isFinalized));

  if (!member) {
    return <main className="min-h-screen px-5 py-10"><div className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-sm"><p className="text-sm font-medium text-[var(--accent)]">Company Group Buy</p><h1 className="mt-2 text-2xl font-bold">公司團購</h1><p className="mt-2 text-sm text-[var(--muted)]">第一次使用請輸入工號與姓名，之後此電腦會記住你的資料。</p><button onClick={() => { setMemberError(""); setEmployeeId(""); setName(""); setShowMemberForm(true); }} className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white">登入團購系統</button><div className="mt-6 text-center"><button onClick={() => setShowAdminLogin(true)} className="text-xs text-[var(--muted)] hover:underline">管理員入口</button></div></div>{showMemberForm && <MemberModal employeeId={employeeId} name={name} setEmployeeId={setEmployeeId} setName={setName} error={memberError} saving={savingMember} onCancel={() => setShowMemberForm(false)} onSave={saveMember} />}{showAdminLogin && <AdminModal password={adminPassword} setPassword={setAdminPassword} error={adminError} logging={adminLoggingIn} onCancel={() => setShowAdminLogin(false)} onSubmit={adminLogin} />}</main>;
  }

  const menuTitle: Record<Menu, string> = { current: "進行中的訂單", closed: "截止的訂單", history: "歷史訂單", myHistory: "我的歷史訂單" };
  const menuSubtitle: Record<Menu, string> = { current: "Member Dashboard", closed: "Closed Orders", history: "Order History", myHistory: "My Order History" };

  return <main className="min-h-screen bg-[#f7f8f5] md:flex">
    <aside className="w-full shrink-0 border-b border-[var(--border)] bg-white md:fixed md:inset-y-0 md:w-64 md:border-b-0 md:border-r"><div className="flex h-full flex-col p-5">
      <div className="mb-8"><p className="text-sm font-medium text-[var(--accent)]">Company Group Buy</p><h1 className="mt-1 text-xl font-bold">團購系統</h1></div>
      <div className="rounded-2xl bg-[#f4f5f1] p-4"><p className="font-semibold">{member.name}</p><p className="mt-1 text-xs text-[var(--muted)]">工號：{member.employeeId}</p></div>
      <nav className="mt-6 space-y-2">
        {(Object.keys(menuTitle) as Menu[]).map((menu) => <button key={menu} onClick={() => setActiveMenu(menu)} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold ${activeMenu === menu ? "bg-[var(--accent)] text-white" : "hover:bg-[#f4f5f1]"}`}>{menuTitle[menu]}</button>)}
      </nav>
      <div className="mt-auto space-y-2 pt-6"><button onClick={() => { setEmployeeId(member.employeeId); setName(member.name); setMemberError(""); setShowMemberForm(true); }} className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm">修改身分資料</button><button onClick={() => setShowAdminLogin(true)} className="w-full rounded-xl px-4 py-2.5 text-left text-xs text-[var(--muted)] hover:bg-[#f4f5f1]">管理員入口</button></div>
    </div></aside>

    <section className="w-full p-5 md:ml-64 md:p-10"><div className="mx-auto max-w-5xl">
      <header className="mb-8 flex items-center justify-between"><div><p className="text-sm text-[var(--muted)]">{menuSubtitle[activeMenu]}</p><h2 className="mt-1 text-3xl font-bold">{menuTitle[activeMenu]}</h2></div><button onClick={() => { loadGroups(); loadOrders(); }} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm">重新整理</button></header>

      {activeMenu === "current" && <>
        <section className="mb-10"><div className="mb-4"><h3 className="text-xl font-bold">我的訂單</h3><p className="mt-1 text-sm text-[var(--muted)]">目前仍在進行中的團購訂單。</p></div>{currentOrders.length ? <div className="space-y-3">{currentOrders.map((order) => <OrderCard key={order.id} order={order} />)}</div> : <Empty text="目前還沒有進行中的訂單。" />}</section>
        <section><div className="mb-4"><h3 className="text-xl font-bold">可參加的團購</h3><p className="mt-1 text-sm text-[var(--muted)]">點擊「進入團購」開始選購。</p></div>{loading ? <Empty text="正在讀取..." /> : openGroups.length ? <div className="grid gap-4 md:grid-cols-2">{openGroups.map((group) => <article key={group.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-bold">{group.name}</h4><p className="mt-1 text-sm text-[var(--muted)]">截止：{formatDate(group.end_at)}</p></div><StatusBadge status={group.status} /></div>{group.description && <p className="mt-3 text-sm text-[var(--muted)]">{group.description}</p>}<button onClick={() => openOrder(group)} className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white transition hover:opacity-90">進入團購</button></article>)}</div> : <Empty text="目前沒有進行中的團購。" />}</section>
      </>}

      {activeMenu === "closed" && <section><div className="mb-4"><h3 className="text-xl font-bold">截止的訂單</h3><p className="mt-1 text-sm text-[var(--muted)]">團購截止後會保留在這裡，等待管理員完成計算。</p></div>{closedOrders.length ? <div className="space-y-3">{closedOrders.map((order) => <OrderCard key={order.id} order={order} />)}</div> : <Empty text="目前沒有截止的訂單。" />}</section>}

      {activeMenu === "history" && <section><div className="mb-4"><h3 className="text-xl font-bold">歷史訂單</h3><p className="mt-1 text-sm text-[var(--muted)]">管理員發布計算完成後，訂單會移到這裡並顯示最終金額。</p></div>{historyOrders.length ? <div className="space-y-4">{historyOrders.map((order) => <HistoryOrderCard key={order.id} order={order} />)}</div> : <Empty text="目前還沒有歷史訂單。" />}</section>}

      {activeMenu === "myHistory" && <section><div className="mb-4"><h3 className="text-xl font-bold">我的歷史訂單</h3><p className="mt-1 text-sm text-[var(--muted)]">只顯示你本人曾經參加過、且管理員已發布計算完成的團購。</p></div>{myHistoryOrders.length ? <div className="space-y-4">{myHistoryOrders.map((order) => <HistoryOrderCard key={order.id} order={order} />)}</div> : <Empty text="你目前還沒有參加過已完成計算的團購。" />}</section>}
    </div></section>

    {showMemberForm && <MemberModal employeeId={employeeId} name={name} setEmployeeId={setEmployeeId} setName={setName} error={memberError} saving={savingMember} onCancel={() => setShowMemberForm(false)} onSave={saveMember} />}
    {showAdminLogin && <AdminModal password={adminPassword} setPassword={setAdminPassword} error={adminError} logging={adminLoggingIn} onCancel={() => setShowAdminLogin(false)} onSubmit={adminLogin} />}
    {selectedGroup && <OrderModal group={selectedGroup} quantities={quantities} setQuantity={setQuantity} step={orderStep} setStep={setOrderStep} selectedItems={selectedItems} totalQuantity={previewTotalQuantity} previewAmount={previewAmount} error={orderError} saving={savingOrder} onClose={closeOrder} onConfirm={confirmOrder} />}
  </main>;
}

function OrderCard({ order }: { order: MyOrder }) {
  return <article className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">{order.group?.name ?? "團購"}</h4><p className="mt-1 text-sm text-[var(--muted)]">下單時間：{formatDate(order.created_at)}</p></div>{order.group && <StatusBadge status={order.group.status} />}</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{order.items.map((item) => <div key={item.productId} className="rounded-xl bg-[#f7f8f5] px-4 py-3 text-sm"><span>{item.productName}</span><span className="float-right font-semibold">{item.quantity} {item.unit}</span></div>)}</div></article>;
}

function HistoryOrderCard({ order }: { order: MyOrder }) {
  const total = order.items.reduce((sum, item) => sum + (item.finalAmount ?? 0), 0);
  return <article className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold">{order.group?.name ?? "團購"}</h4><p className="mt-1 text-sm text-[var(--muted)]">下單時間：{formatDate(order.created_at)}</p></div><StatusBadge status="finalized" /></div><div className="mt-4 divide-y rounded-2xl border border-[var(--border)]">{order.items.map((item) => <div key={item.productId} className="flex items-center justify-between px-4 py-3 text-sm"><span>{item.productName} × {item.quantity} {item.unit}</span><span className="font-semibold">{item.finalAmount == null ? "待計算" : `$ ${formatMoney(item.finalAmount)}`}</span></div>)}</div><div className="mt-4 flex items-center justify-between rounded-2xl bg-[#f4f5f1] px-4 py-4"><span className="font-semibold">最終訂單金額</span><span className="text-xl font-bold text-[var(--accent)]">$ {formatMoney(total)}</span></div></article>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--muted)]">{text}</div>; }

function MemberModal({ employeeId, name, setEmployeeId, setName, error, saving, onCancel, onSave }: { employeeId: string; name: string; setEmployeeId: (v: string) => void; setName: (v: string) => void; error: string; saving: boolean; onCancel: () => void; onSave: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><h3 className="text-xl font-bold">登入團購系統</h3><p className="mt-1 text-sm text-[var(--muted)]">工號請輸入最多 5 位數字，系統會自動補 0。</p><label className="mt-5 block text-sm font-semibold">工號<input value={employeeId} onChange={(e) => setEmployeeId(e.target.value.replace(/\D/g, "").slice(0, 5))} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none" placeholder="例如 09279" inputMode="numeric" /></label><label className="mt-4 block text-sm font-semibold">姓名<input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none" placeholder="請輸入姓名" /></label>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button onClick={onCancel} className="rounded-xl border border-[var(--border)] px-5 py-2.5">取消</button><button onClick={onSave} disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? "處理中..." : "確認"}</button></div></div></div>;
}

function AdminModal({ password, setPassword, error, logging, onCancel, onSubmit }: { password: string; setPassword: (v: string) => void; error: string; logging: boolean; onCancel: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"><form onSubmit={onSubmit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"><h3 className="text-xl font-bold">管理員登入</h3><label className="mt-5 block text-sm font-semibold">管理員密碼<input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 outline-none" /></label>{error && <p className="mt-4 text-sm text-red-600">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded-xl border border-[var(--border)] px-5 py-2.5">取消</button><button type="submit" disabled={logging} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-50">{logging ? "登入中..." : "登入"}</button></div></form></div>;
}

function OrderModal({ group, quantities, setQuantity, step, setStep, selectedItems, totalQuantity, previewAmount, error, saving, onClose, onConfirm }: { group: GroupDetail; quantities: Record<string, number>; setQuantity: (id: string, value: number, max: number | null) => void; step: Step; setStep: (step: Step) => void; selectedItems: { product: Product; quantity: number }[]; totalQuantity: number; previewAmount: number; error: string; saving: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5"><div><p className="text-sm font-medium text-[var(--accent)]">{step === "products" ? "選擇商品" : "確認訂單"}</p><h3 className="mt-1 text-2xl font-bold">{group.name}</h3></div><button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2">關閉</button></div><div className="overflow-y-auto p-6">
    {step === "products" ? <div className="space-y-3">{group.products.map((product) => <div key={product.id} className="rounded-2xl border border-[var(--border)] p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{product.name}</p>{product.description && <p className="mt-1 text-sm text-[var(--muted)]">{product.description}</p>}<p className="mt-1 text-sm text-[var(--muted)]">單位：{product.unit ?? "個"}｜參考單價：$ {formatMoney(product.price)}</p></div><input type="number" min={0} max={product.max_quantity ?? undefined} value={quantities[product.id] ?? 0} onChange={(e) => setQuantity(product.id, Number(e.target.value), product.max_quantity)} className="w-28 rounded-xl border border-[var(--border)] px-3 py-2 text-center" /></div></div>)}</div> : <div><p className="text-sm text-[var(--muted)]">請確認以下訂購內容。按下確認後會正式送出訂單。</p><div className="mt-5 divide-y rounded-2xl border border-[var(--border)]">{selectedItems.map((item) => { const groupQuantity = getGroupQuantity(group, item.product, selectedItems); const price = getTierPrice(group, item.product, groupQuantity); return <div key={item.product.id} className="flex items-center justify-between px-4 py-4"><span>{item.product.name} × {item.quantity} {item.product.unit ?? "個"}</span><span className="font-bold">$ {formatMoney(item.quantity * price)}</span></div>; })}</div><div className="mt-5 rounded-2xl bg-[#f4f5f1] p-5"><div className="flex justify-between text-sm"><span>本次總數量</span><span>{totalQuantity}</span></div><div className="mt-2 flex justify-between"><span className="font-semibold">目前預估金額</span><span className="text-xl font-bold text-[var(--accent)]">$ {formatMoney(previewAmount)}</span></div><p className="mt-3 text-xs text-[var(--muted)]">最終單價會依團購截止後，所有員工合併的實際合計數量重新計算。</p></div></div>}
    {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
  </div><div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-5">{step === "products" ? <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-5 py-2.5">上一步</button> : <button onClick={() => setStep("products")} className="rounded-xl border border-[var(--border)] px-5 py-2.5">上一步</button>}{step === "products" ? <button onClick={() => { if (!selectedItems.length) return; setStep("confirm"); }} className="rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white">下一步</button> : <button onClick={onConfirm} disabled={saving} className="rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white disabled:opacity-50">{saving ? "送出中..." : "確認"}</button>}</div></div></div>;
}
