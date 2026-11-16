'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut, Mail, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AuthGuard } from '@/components/auth-guard';
import { AppShell } from '@/components/app-shell';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function ProfilePage() {
  return (
    <AuthGuard>
      <AppShell>
        <Profile />
      </AppShell>
    </AuthGuard>
  );
}

function Profile() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? '');
        setCreatedAt(data.user.created_at ?? '');
      }
    });
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      toast.success('已退出登录');
      router.replace('/login');
    } catch {
      toast.error('退出失败，请重试');
      setSigningOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-bold">我的</h1>

      <Card>
        <CardContent className="flex items-center gap-4 px-4 py-5">
          <Avatar className="size-14">
            <AvatarFallback className="bg-primary/10 text-primary">
              <UserRound className="size-7" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{email || '加载中…'}</p>
            {createdAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                注册于 {new Date(createdAt).toLocaleDateString('zh-CN')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">账号</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 px-2 pb-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm">
            <Mail className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">登录邮箱</span>
            <span className="ml-auto truncate">{email}</span>
          </div>
          <Separator />
          <Button
            variant="ghost"
            className="h-11 w-full justify-start gap-3 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
