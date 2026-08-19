"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "新建團購" },
  { href: "/admin/closed", label: "截止團購" },
  { href: "/admin/history", label: "歷史團購" },
  { href: "/admin/members", label: "成員名單" },
  { href: "/admin/member-history", label: "成員團購歷史明細" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--border)] bg-white md:flex md:flex-col">
      <div className="border-b border-[var(--border)] px-6 py-6">
        <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
        <h2 className="mt-1 text-xl font-bold">團購管理後台</h2>
      </div>
      <nav className="space-y-2 p-4">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return <Link key={item.href} href={item.href} className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${active ? "bg-[var(--accent)] text-white" : "text-[var(--text)] hover:bg-[#f4f5f1]"}`}>{item.label}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-[var(--border)] p-4"><Link href="/" className="block rounded-xl border border-[var(--border)] px-4 py-3 text-center text-sm font-medium text-[var(--text)] transition hover:bg-[#f4f5f1]">回首頁</Link></div>
    </aside>
  );
}
