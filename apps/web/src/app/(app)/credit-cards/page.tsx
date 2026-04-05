'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { cn, formatCurrency, invoiceStatusLabel, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { CreditCard } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Pencil, Trash2, Plus, CreditCard as CreditCardIcon, ChevronRight } from 'lucide-react'

interface CardForm {
  name: string
  limit_total: string
  closing_day: string
  due_day: string
  brand: string
  color: string
}

const emptyForm: CardForm = {
  name: '',
  limit_total: '',
  closing_day: '',
  due_day: '',
  brand: '',
  color: '#ef4444',
}

export default function CreditCardsPage() {
  const { toast } = useToast()
  const [cards, setCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<CreditCard | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<CardForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function loadCards() {
    setLoading(true)
    try {
      const res = await api.get<{ data: CreditCard[] }>('/credit-cards')
      setCards(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar cartões.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCards()
  }, [])

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(card: CreditCard) {
    setEditItem(card)
    setForm({
      name: card.name,
      limit_total: String(card.limit_total),
      closing_day: String(card.closing_day),
      due_day: String(card.due_day),
      brand: card.brand ?? '',
      color: card.color ?? '#ef4444',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditItem(null)
    setForm(emptyForm)
  }

  async function handleSubmit() {
    const isAdditional = !!editItem?.parent_card_id
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'O nome do cartão é obrigatório.' })
      return
    }
    if (!isAdditional && (!form.limit_total || parseFloat(form.limit_total) <= 0)) {
      toast({ variant: 'destructive', title: 'Informe um limite válido.' })
      return
    }
    const closing = parseInt(form.closing_day)
    const due = parseInt(form.due_day)
    if (!closing || closing < 1 || closing > 31) {
      toast({ variant: 'destructive', title: 'Dia de fechamento deve ser entre 1 e 31.' })
      return
    }
    if (!due || due < 1 || due > 31) {
      toast({ variant: 'destructive', title: 'Dia de vencimento deve ser entre 1 e 31.' })
      return
    }

    setSubmitting(true)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      closing_day: closing,
      due_day: due,
      brand: form.brand.trim() || undefined,
      color: form.color || undefined,
    }
    if (!isAdditional) {
      payload.limit_total = parseFloat(form.limit_total)
    }

    try {
      if (editItem) {
        await api.patch(`/credit-cards/${editItem.id}`, payload)
        toast({ title: 'Cartão atualizado com sucesso.' })
      } else {
        await api.post('/credit-cards', payload)
        toast({ title: 'Cartão criado com sucesso.' })
      }
      closeModal()
      await loadCards()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar cartão.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await api.delete(`/credit-cards/${deleteId}`)
      toast({ title: 'Cartão removido com sucesso.' })
      setDeleteId(null)
      await loadCards()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover cartão.' })
    }
  }

  function getLimitUsed(card: CreditCard): number {
    return Number(card.limit_used ?? 0)
  }

  function getLimitAvailable(card: CreditCard): number {
    return Number(card.limit_total) - getLimitUsed(card)
  }

  function getUsagePercent(card: CreditCard): number {
    const total = Number(card.limit_total)
    if (total === 0) return 0
    return Math.min(100, (getLimitUsed(card) / total) * 100)
  }

  function getProgressColor(percent: number): string {
    if (percent >= 90) return 'bg-destructive'
    if (percent >= 70) return 'bg-yellow-500'
    return 'bg-emerald-500'
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartões de Crédito"
        description="Gerencie seus cartões e acompanhe os limites."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cartão
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : cards.length === 0 ? (
        <EmptyState
          title="Nenhum cartão cadastrado"
          description="Adicione seu primeiro cartão de crédito para controlar faturas e limites."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Cartão
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const usedPercent = getUsagePercent(card)
            const limitUsed = getLimitUsed(card)
            const limitAvailable = getLimitAvailable(card)

            return (
              <Card key={card.id} className="relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 w-1 h-full"
                  style={{ backgroundColor: card.color ?? '#ef4444' }}
                />

                <CardHeader className="pb-2 pl-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <CardTitle className="text-base">{card.name}</CardTitle>
                        {card.brand && (
                          <CardDescription className="text-xs">{card.brand}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(card)}
                        aria-label="Editar cartão"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setDeleteId(card.id)}
                        aria-label="Remover cartão"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pl-5 space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Usado: {formatCurrency(limitUsed)}</span>
                      <span>{usedPercent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', getProgressColor(usedPercent))}
                        style={{ width: `${usedPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Disponível: <span className="text-foreground font-medium">{formatCurrency(limitAvailable)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Limite: <span className="text-foreground font-medium">{formatCurrency(Number(card.limit_total))}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fechamento: dia {card.closing_day}</span>
                    <span>Vencimento: dia {card.due_day}</span>
                  </div>

                  {card.current_invoice && (
                    <div className="rounded-md bg-muted/50 px-2.5 py-2 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Fatura aberta</span>
                        <Badge variant="default" className="text-[10px] h-4 px-1.5">
                          {invoiceStatusLabel(card.current_invoice.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          {formatCurrency(Number(card.current_invoice.total_amount))}
                        </span>
                        <span className="text-muted-foreground">
                          Vence {formatDate(card.current_invoice.due_date)}
                        </span>
                      </div>
                    </div>
                  )}

                  <Link
                    href={`/credit-cards/${card.id}`}
                    className="flex items-center justify-between w-full rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    Ver faturas
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Cartão' : 'Novo Cartão'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="card-name">Nome *</Label>
              <Input
                id="card-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Nubank Roxinho"
              />
            </div>

            {!editItem?.parent_card_id && (
              <div className="space-y-1.5">
                <Label htmlFor="card-limit">Limite total (R$) *</Label>
                <Input
                  id="card-limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.limit_total}
                  onChange={(e) => setForm({ ...form, limit_total: e.target.value })}
                  placeholder="Ex: 5000.00"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-closing">Dia de fechamento *</Label>
                <Input
                  id="card-closing"
                  type="number"
                  min="1"
                  max="31"
                  value={form.closing_day}
                  onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
                  placeholder="Ex: 25"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-due">Dia de vencimento *</Label>
                <Input
                  id="card-due"
                  type="number"
                  min="1"
                  max="31"
                  value={form.due_day}
                  onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                  placeholder="Ex: 2"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="card-brand">Bandeira (opcional)</Label>
              <Input
                id="card-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Ex: Visa, Mastercard, Elo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="card-color">Cor (opcional)</Label>
              <div className="flex items-center gap-3">
                <input
                  id="card-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                />
                <span className="text-sm text-muted-foreground">{form.color}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Criar cartão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Remover cartão"
        description="Esta ação não pode ser desfeita. Deseja remover este cartão?"
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
