'use client'

import { useEffect, useState } from 'react'
import { superadminApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Pagination } from '@/components/shared/pagination'
import { useToast } from '@/components/ui/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ShieldBan, ShieldCheck, Pencil } from 'lucide-react'

interface Tenant {
  id: string
  name: string
  plan: 'FREE' | 'PAID' | 'DEV'
  is_blocked: boolean
  blocked_reason?: string
  created_at: string
}

const PAGE_SIZE = 20

export default function TenantsPage() {
  const { toast } = useToast()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)

  const [blockTarget, setBlockTarget] = useState<Tenant | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)

  const [unblockTarget, setUnblockTarget] = useState<Tenant | null>(null)

  const [editTarget, setEditTarget] = useState<Tenant | null>(null)
  const [editPlan, setEditPlan] = useState<'FREE' | 'PAID' | 'DEV'>('FREE')
  const [editing, setEditing] = useState(false)

  async function loadTenants(p = page, s = search) {
    setLoading(true)
    try {
      const res = await superadminApi.get<{ data: Tenant[]; total: number }>(
        `/superadmin/tenants?page=${p}&pageSize=${PAGE_SIZE}&search=${encodeURIComponent(s)}`
      )
      setTenants(res.data)
      setTotal(res.total)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar tenants.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTenants(page, search)
  }, [page, search])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  async function handleBlock() {
    if (!blockTarget) return
    setBlocking(true)
    try {
      await superadminApi.post(`/superadmin/tenants/${blockTarget.id}/block`, { reason: blockReason })
      toast({ title: `Tenant "${blockTarget.name}" bloqueado.` })
      setBlockTarget(null)
      setBlockReason('')
      await loadTenants()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao bloquear tenant.' })
    } finally {
      setBlocking(false)
    }
  }

  async function handleEdit() {
    if (!editTarget) return
    setEditing(true)
    try {
      await superadminApi.patch(`/superadmin/tenants/${editTarget.id}`, { plan: editPlan })
      toast({ title: `Plano de "${editTarget.name}" atualizado para ${editPlan}.` })
      setEditTarget(null)
      await loadTenants()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao atualizar plano.' })
    } finally {
      setEditing(false)
    }
  }

  async function handleUnblock() {
    if (!unblockTarget) return
    try {
      await superadminApi.delete(`/superadmin/tenants/${unblockTarget.id}/block`)
      toast({ title: `Tenant "${unblockTarget.name}" desbloqueado.` })
      setUnblockTarget(null)
      await loadTenants()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao desbloquear tenant.' })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-muted-foreground text-sm mt-1">Gerencie todos os workspaces da plataforma.</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por nome..."
        />
        <Button type="submit" variant="outline" size="icon">
          <Search className="h-4 w-4" />
        </Button>
      </form>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>
                    <Badge variant={tenant.plan === 'PAID' ? 'default' : tenant.plan === 'DEV' ? 'outline' : 'secondary'}>
                      {tenant.plan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tenant.is_blocked ? (
                      <Badge variant="destructive">Bloqueado</Badge>
                    ) : (
                      <Badge variant="outline">Ativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(tenant.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditTarget(tenant); setEditPlan(tenant.plan) }}
                        className="gap-1"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Button>
                      {tenant.is_blocked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUnblockTarget(tenant)}
                          className="gap-1"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          Desbloquear
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => { setBlockTarget(tenant); setBlockReason('') }}
                          className="gap-1"
                        >
                          <ShieldBan className="h-4 w-4" />
                          Bloquear
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum tenant encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {total > PAGE_SIZE && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          )}
        </>
      )}

      <Dialog open={!!blockTarget} onOpenChange={(open) => { if (!open) setBlockTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bloquear Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Você está bloqueando <span className="font-semibold">{blockTarget?.name}</span>.
              O acesso será suspenso imediatamente.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="block-reason">Motivo</Label>
              <Input
                id="block-reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Informe o motivo do bloqueio"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockTarget(null)} disabled={blocking}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBlock} disabled={blocking}>
              {blocking ? 'Bloqueando...' : 'Confirmar Bloqueio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!unblockTarget}
        title="Desbloquear Tenant"
        description={`Deseja desbloquear o workspace "${unblockTarget?.name}"?`}
        confirmLabel="Desbloquear"
        onConfirm={handleUnblock}
        onCancel={() => setUnblockTarget(null)}
      />

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Editando <span className="font-semibold">{editTarget?.name}</span>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="edit-plan">Plano</Label>
              <Select value={editPlan} onValueChange={(v) => setEditPlan(v as 'FREE' | 'PAID' | 'DEV')}>
                <SelectTrigger id="edit-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FREE">FREE</SelectItem>
                  <SelectItem value="PAID">PAID</SelectItem>
                  <SelectItem value="DEV">DEV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
