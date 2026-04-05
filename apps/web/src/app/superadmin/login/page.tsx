'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { superadminApi, setSuperAdminToken } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ShieldAlert } from 'lucide-react'

export default function SuperAdminLoginPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      toast({ variant: 'destructive', title: 'Preencha e-mail e senha.' })
      return
    }
    setLoading(true)
    try {
      const res = await superadminApi.post<{ data: { token: string } }>(
        '/superadmin/auth/login',
        { email, password }
      )
      setSuperAdminToken(res.data.token)
      router.push('/superadmin/metrics')
    } catch {
      toast({ variant: 'destructive', title: 'Credenciais inválidas.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <ShieldAlert className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">SuperAdmin</CardTitle>
          <p className="text-sm text-muted-foreground">Acesso restrito à administração da plataforma.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sa-email">E-mail</Label>
              <Input
                id="sa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@gudymoney.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sa-password">Senha</Label>
              <Input
                id="sa-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
