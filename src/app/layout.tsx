import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SupabaseConfigProvider } from "@/lib/supabase-config-inject";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "错题集 - 拍照批改，智能整理",
  description: "拍照上传作业，AI 自动批改识别错题，按知识点归档分析，生成针对性练习。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <SupabaseConfigProvider>
          {children}
          <Toaster position="top-center" richColors />
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}
