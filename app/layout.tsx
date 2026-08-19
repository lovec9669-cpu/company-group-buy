import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "公司團購",
  description: "公司內部團購管理系統",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
