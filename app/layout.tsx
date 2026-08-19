import type { Metadata } from "next";
import "./globals.css";
import AdminSidebar from "./admin/AdminSidebar";

export const metadata: Metadata = {
  title: "公司團購",
  description: "公司內部團購管理系統",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body><AdminSidebar />{children}</body>
    </html>
  );
}
