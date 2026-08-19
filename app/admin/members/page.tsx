"use client";

import { useEffect, useState } from "react";

type Member = {
  id: string;
  employee_id: string;
  name: string;
  created_at: string;
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMembers() {
      try {
        const response = await fetch("/api/admin/members", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "無法讀取成員名單");
        setMembers(result.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "無法讀取成員名單");
      } finally {
        setLoading(false);
      }
    }
    loadMembers();
  }, []);

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-[var(--accent)]">Admin</p>
          <h1 className="mt-1 text-2xl font-bold">成員名單</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">顯示已完成團購登入的成員，僅顯示工號與姓名。</p>
        </header>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">正在讀取成員名單...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm font-medium text-red-600">{error}</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--muted)]">目前還沒有成員資料。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f4f5f1] text-[var(--muted)]">
                  <tr>
                    <th className="px-6 py-4 font-semibold">工號</th>
                    <th className="px-6 py-4 font-semibold">姓名</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-t border-[var(--border)]">
                      <td className="px-6 py-4 font-medium tracking-wide">{member.employee_id}</td>
                      <td className="px-6 py-4">{member.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
