'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/auth-context'

export default function ProfilePage() {
  const { toast } = useToast()
  const { user, refreshUser } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSaveProfile() {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'O nome não pode estar vazio.' })
      return
    }
    setSavingProfile(true)
    try {
      await api.patch('/auth/me', { name: name.trim() })
      toast({ title: 'Perfil atualizado com sucesso.' })
      refreshUser?.()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao atualizar perfil.' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos de senha.' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'As senhas não coincidem.' })
      return
    }
    if (newPassword.length < 8) {
      toast({ variant: 'destructive', title: 'A nova senha deve ter pelo menos 8 caracteres.' })
      return
    }
    setSavingPassword(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      toast({ title: 'Senha alterada com sucesso.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao alterar senha. Verifique a senha atual.' })
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Perfil" description="Gerencie suas informações pessoais." />

      <Card>
        <CardHeader>
          <CardTitle>Informações Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nome</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">E-mail</Label>
            <Input
              id="profile-email"
              value={user?.email ?? ''}
              readOnly
              disabled
              className="opacity-60 cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>
          </div>
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Alterar Senha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={savingPassword}>
            {savingPassword ? 'Alterando...' : 'Alterar Senha'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
