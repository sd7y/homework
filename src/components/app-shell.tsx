'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Camera,
  BookOpen,
  PencilLine,
  ChartPie,
  UserRound,
  BookOpenCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: '上传', icon: Camera },
  { href: '/mistakes', label: '错题本', icon: BookOpen },
  { href: '/practice', label: '练习', icon: PencilLine },
  { href: '/stats', label: '统计', icon: ChartPie },
  { href: '/profile', label: '我的', icon: UserRound },
];

/**
 * 应用外壳：移动端底部 Tab 导航（拇指可达），桌面端顶部导航条。
 * 复习/详情等子页面不使用外壳，独占页面。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-svh">
      {/* 桌面端顶部导航 */}
      <header className="sticky top-0 z-40 hidden border-b bg-card/80 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpenCheck className="size-5" />
            </span>
            <span className="text-base font-bold">错题集</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors',
                  isActive(item.href)
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* 移动端顶部标题栏 */}
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur md:hidden">
        <div className="flex h-12 items-center justify-center">
          <Link href="/" className="flex items-center gap-1.5">
            <BookOpenCheck className="size-5 text-primary" />
            <span className="text-base font-bold">错题集</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-4 md:pb-10 md:pt-6">
        {children}
      </main>

      {/* 移动端底部 Tab */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
                isActive(item.href) ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
