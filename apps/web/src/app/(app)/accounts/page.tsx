'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { CurrencyInput } from '@/components/shared/currency-input'
import { cn, formatCurrency, accountTypeLabel } from '@/lib/utils'
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
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { Account, AccountType } from '@/types'
import { Pencil, Trash2, Plus } from 'lucide-react'

interface AccountForm {
  name: string
  type: AccountType | ''
  initial_balance: string
  bank_name: string
  currency: string
}

const emptyForm: AccountForm = {
  name: '',
  type: '',
  initial_balance: '0',
  bank_name: '',
  currency: 'BRL',
}

export default function AccountsPage() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Account | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function loadAccounts() {
    setLoading(true)
    try {
      const res = await api.get<{ data: Account[] }>('/accounts')
      setAccounts(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar contas.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(account: Account) {
    setEditItem(account)
    setForm({
      name: account.name,
      type: account.type,
      initial_balance: String(account.initial_balance ?? 0),
      bank_name: account.bank_name ?? '',
      currency: account.currency ?? 'BRL',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditItem(null)
    setForm(emptyForm)
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'O nome da conta é obrigatório.' })
      return
    }
    if (!form.type) {
      toast({ variant: 'destructive', title: 'Selecione o tipo de conta.' })
      return
    }

    setSubmitting(true)
    const payload = {
      name: form.name.trim(),
      type: form.type as AccountType,
      initial_balance: parseFloat(form.initial_balance) || 0,
      bank_name: form.bank_name.trim() || undefined,
      currency: form.currency || 'BRL',
    }

    try {
      if (editItem) {
        await api.patch(`/accounts/${editItem.id}`, payload)
        toast({ title: 'Conta atualizada com sucesso.' })
      } else {
        await api.post('/accounts', payload)
        toast({ title: 'Conta criada com sucesso.' })
      }
      closeModal()
      await loadAccounts()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar conta.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await api.delete(`/accounts/${deleteId}`)
      toast({ title: 'Conta removida com sucesso.' })
      setDeleteId(null)
      await loadAccounts()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover conta.' })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas"
        description="Gerencie suas contas bancárias e carteiras."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Conta
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Crie sua primeira conta para começar a registrar transações."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Conta
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{accountTypeLabel(account.type)}</TableCell>
                    <TableCell>{account.bank_name ?? '—'}</TableCell>
                    <TableCell>{account.currency ?? 'BRL'}</TableCell>
                    <TableCell>
                      {account.deleted_at ? (
                        <Badge variant="secondary">Inativa</Badge>
                      ) : (
                        <Badge variant="default">Ativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(account)}
                        aria-label="Editar conta"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(account.id)}
                        aria-label="Remover conta"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{account.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{accountTypeLabel(account.type)}</span>
                      {account.bank_name && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{account.bank_name}</span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{account.currency ?? 'BRL'}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {account.deleted_at ? (
                        <Badge variant="secondary" className="text-xs">Inativa</Badge>
                      ) : (
                        <Badge variant="default" className="text-xs">Ativa</Badge>
                      )}
                      {account.balance && (
                        <span className={cn('text-sm font-semibold tabular-nums', Number(account.balance.realized) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500')}>
                          {formatCurrency(Number(account.balance.realized))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(account)} aria-label="Editar conta" className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(account.id)} aria-label="Remover conta" className="h-8 w-8">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Conta' : 'Nova Conta'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Nome *</Label>
              <Input
                id="acc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Conta Corrente Nubank"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-type">Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm({ ...form, type: val as AccountType })}
              >
                <SelectTrigger id="acc-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECKING">Conta Corrente</SelectItem>
                  <SelectItem value="SAVINGS">Poupança</SelectItem>
                  <SelectItem value="WALLET">Carteira</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-balance">Saldo inicial</Label>
              <CurrencyInput
                value={form.initial_balance}
                onChange={(v) => setForm({ ...form, initial_balance: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-bank">Banco (opcional)</Label>
              <Input
                id="acc-bank"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                placeholder="Ex: Nubank, Itaú, Bradesco"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-currency">Moeda</Label>
              <Select
                value={form.currency}
                onValueChange={(val) => setForm({ ...form, currency: val })}
              >
                <SelectTrigger id="acc-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL — Real Brasileiro</SelectItem>
                  <SelectItem value="USD">USD — Dólar Americano</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Criar conta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Remover conta"
        description="Esta ação não pode ser desfeita. Deseja remover esta conta?"
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
