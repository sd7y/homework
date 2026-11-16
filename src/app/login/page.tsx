'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpenCheck, Loader2, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSupabaseConfig } from '@/lib/supabase-config-inject';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { isLoading: configLoading, error: configError } = useSupabaseConfig();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // 已登录用户直接进首页
  useEffect(() => {
    if (configLoading || configError) {
      setCheckingSession(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/');
      } else {
        setCheckingSession(false);
      }
    });
  }, [configLoading, configError, router]);

  function validate(): string | null {
    if (!EMAIL_RE.test(email.trim())) return '请输入有效的邮箱地址';
    if (password.length < 6) return '密码长度至少 6 位';
    if (mode === 'register' && password !== confirmPassword) return '两次输入的密码不一致';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(translateAuthError(signInError.message));
          return;
        }
        router.replace('/');
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) {
          setError(translateRegisterError(signUpError));
          return;
        }
        toast.success('注册成功，已自动登录');
        router.replace('/');
      }
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession && !configError) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-accent/60 to-background px-4 py-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="items-center space-y-3 pb-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <BookOpenCheck className="size-8" />
          </span>
          <div>
            <h1 className="text-xl font-bold">错题集</h1>
            <CardDescription className="mt-1">
              拍照批改 · 智能整理 · 针对性练习
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as 'login' | 'register');
              setError(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11 pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting || !!configError}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="至少 6 位"
                  className="h-11 pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || !!configError}
                />
              </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">确认密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    className="h-11 pl-9"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={submitting || !!configError}
                  />
                </div>
              </div>
            )}

            {(error || configError) && (
              <Alert variant="destructive">
                <AlertDescription>{error ?? configError}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="h-11 w-full text-base"
              disabled={submitting || configLoading || !!configError}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {mode === 'login' ? '登录' : '注册'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return '邮箱或密码错误';
  if (lower.includes('email not confirmed')) return '邮箱尚未验证，请先完成验证';
  if (lower.includes('too many requests')) return '尝试次数过多，请稍后再试';
  return `登录失败：${message}`;
}

function translateRegisterError(error: { message: string; code?: string }): string {
  const lower = error.message.toLowerCase();
  if (lower.includes('user already registered') || error.code === 'user_already_exists') {
    return '该邮箱已注册，请直接登录';
  }
  if (lower.includes('password')) return '密码不符合要求，请使用至少 6 位密码';
  if (lower.includes('email')) return '邮箱格式不正确';
  return `注册失败：${error.message}`;
}
