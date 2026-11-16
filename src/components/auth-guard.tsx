'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabaseConfig } from '@/lib/supabase-config-inject';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { BookOpenCheck } from 'lucide-react';

/** 登录态守卫：无 session 时跳转登录页 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isLoading: configLoading, error: configError } = useSupabaseConfig();
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (configLoading || configError) return;
    let cancelled = false;

    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          setAuthed(true);
        } else {
          router.replace('/login');
        }
        setChecking(false);
      })
      .catch(() => {
        if (cancelled) return;
        router.replace('/login');
        setChecking(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) {
        router.replace('/login');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configLoading, configError, router]);

  if (configLoading || checking) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-muted-foreground">
        <BookOpenCheck className="size-10 animate-pulse text-primary" />
        <p className="text-sm">加载中…</p>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-destructive">{configError}</p>
        <p className="text-xs text-muted-foreground">请刷新页面重试</p>
      </div>
    );
  }

  if (!authed) return null;
  return <>{children}</>;
}
