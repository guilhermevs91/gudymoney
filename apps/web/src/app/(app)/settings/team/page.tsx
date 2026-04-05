'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/auth-context'
import { TenantMember, MemberRole } from '@/types'
import { Trash2, UserPlus } from 'lucide-react'

export default function TeamPage() {
  const { toast } = useToast()
  const { user } = useAuth()

  const [members, setMembers] = useState<TenantMember[]>([])
  const [loading, setLoading] = useState(true)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  async function loadMembers() {
    setLoading(true)
    try {
      const res = await api.get<{ data: TenantMember[] }>('/members')
      setMembers(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar membros.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast({ variant: 'destructive', title: 'Informe o e-mail.' })
      return
    }
    setInviting(true)
    try {
      await api.post('/invites', { email: inviteEmail.trim(), role: inviteRole })
      toast({ title: `Convite enviado para ${inviteEmail}.` })
      setInviteEmail('')
      setInviteRole('MEMBER')
      setInviteOpen(false)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao enviar convite.' })
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove() {
    if (!removeId) return
    try {
      await api.delete(`/members/${removeId}`)
      toast({ title: 'Membro removido.' })
      setRemoveId(null)
      await loadMembers()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover membro.' })
    }
  }

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        description="Gerencie os membros do seu time."
        action={
          isAdmin ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Convidar Membro
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              {isAdmin && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.user.name}</TableCell>
                <TableCell>{member.user.email}</TableCell>
                <TableCell>
                  <Badge variant={member.role === 'ADMIN' ? 'default' : 'secondary'}>
                    {member.role === 'ADMIN' ? 'Admin' : 'Membro'}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    {member.role === 'MEMBER' && member.user_id !== user?.userId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRemoveId(member.id)}
                        aria-label="Remover membro"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={inviteOpen} onOpenChange={(open) => { if (!open) setInviteOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">E-mail *</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="membro@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Papel</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Membro</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? 'Enviando...' : 'Enviar Convite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeId}
        title="Remover membro"
        description="O membro perderá acesso ao espaço. Deseja continuar?"
        confirmLabel="Remover"
        onConfirm={handleRemove}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  )
}
