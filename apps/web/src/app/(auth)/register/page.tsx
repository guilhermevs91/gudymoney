'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@/contexts/auth-context';
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

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, googleLogin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ variant: 'destructive', title: 'As senhas não coincidem.' });
      return;
    }
    if (password.length < 8) {
      toast({ variant: 'destructive', title: 'A senha deve ter ao menos 8 caracteres.' });
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      router.replace('/dashboard');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao cadastrar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
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
        title: 'Erro ao cadastrar com Google',
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
        <CardTitle className="text-2xl">Criar conta</CardTitle>
        <CardDescription>Comece a organizar suas finanças gratuitamente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() =>
              toast({ variant: 'destructive', title: 'Falha no cadastro com Google.' })
            }
            locale="pt-BR"
            text="signup_with"
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
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
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
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar senha</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link href="/login" className="text-primary underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
