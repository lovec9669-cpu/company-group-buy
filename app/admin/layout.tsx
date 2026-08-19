import AdminSidebar from "./AdminSidebar";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen md:pl-64">
      <AdminSidebar />
      {children}
    </div>
  );
}
