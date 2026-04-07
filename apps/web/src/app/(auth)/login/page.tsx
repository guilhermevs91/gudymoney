'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/contexts/auth-context';
import { superadminApi, setSuperAdminToken } from '@/lib/api';
import { SlideCaptcha } from '@/components/shared/slide-captcha';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const { login, googleLogin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      // Tenta login como superadmin antes de exibir erro
      try {
        const res = await superadminApi.post<{ data: { token: string } }>(
          '/superadmin/auth/login',
          { email, password },
        );
        setSuperAdminToken(res.data.token);
        router.replace('/superadmin/metrics');
        return;
      } catch {
        // não é superadmin — exibe erro original
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao entrar',
        description: err instanceof Error ? err.message : 'Credenciais inválidas.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      await googleLogin(credentialResponse.credential);
      router.replace('/dashboard');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao entrar com Google',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">G</span>
          </div>
          <span className="font-semibold">Gudy Money</span>
        </div>
        <CardTitle className="text-2xl">Entrar</CardTitle>
        <CardDescription>Acesse sua conta de gestão financeira</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() =>
              toast({ variant: 'destructive', title: 'Falha no login com Google.' })
            }
            locale="pt-BR"
            text="signin_with"
            shape="rectangular"
            width="100%"
          />
        </div>
        <div className="relative flex items-center">
          <Separator className="flex-1" />
          <span className="mx-2 text-xs text-muted-foreground">ou</span>
          <Separator className="flex-1" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <SlideCaptcha onVerified={() => setCaptchaVerified(true)} />
          <Button type="submit" className="w-full" disabled={loading || !captchaVerified}>
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          Não tem conta?{' '}
          <Link href="/register" className="text-primary underline underline-offset-4">
            Cadastre-se
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
