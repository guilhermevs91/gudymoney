'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { Webhook } from '@/types'
import { Pencil, Plus, Trash2 } from 'lucide-react'

const ALL_EVENTS = [
  { key: 'transaction.created', label: 'Transação criada' },
  { key: 'transaction.updated', label: 'Transação atualizada' },
  { key: 'invoice.paid', label: 'Fatura paga' },
  { key: 'recurrence.generated', label: 'Recorrência gerada' },
]

interface WebhookForm {
  url: string
  events: string[]
  secret: string
}

const emptyForm: WebhookForm = { url: '', events: [], secret: '' }

export default function WebhooksPage() {
  const { toast } = useToast()

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Webhook | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<WebhookForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function loadWebhooks() {
    setLoading(true)
    try {
      const res = await api.get<{ data: Webhook[] }>('/webhooks')
      setWebhooks(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar webhooks.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWebhooks()
  }, [])

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(webhook: Webhook) {
    setEditItem(webhook)
    setForm({ url: webhook.url, events: webhook.events, secret: '' })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditItem(null)
    setForm(emptyForm)
  }

  function toggleEvent(eventKey: string) {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(eventKey)
        ? prev.events.filter((e) => e !== eventKey)
        : [...prev.events, eventKey],
    }))
  }

  async function handleToggleActive(webhook: Webhook) {
    try {
      await api.patch(`/webhooks/${webhook.id}`, { is_active: !webhook.is_active })
      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? { ...w, is_active: !w.is_active } : w))
      )
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao alterar status do webhook.' })
    }
  }

  async function handleSubmit() {
    if (!form.url.trim()) {
      toast({ variant: 'destructive', title: 'Informe a URL do webhook.' })
      return
    }
    if (form.events.length === 0) {
      toast({ variant: 'destructive', title: 'Selecione pelo menos um evento.' })
      return
    }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = { url: form.url.trim(), events: form.events }
      if (form.secret.trim()) payload.secret = form.secret.trim()

      if (editItem) {
        await api.patch(`/webhooks/${editItem.id}`, payload)
        toast({ title: 'Webhook atualizado.' })
      } else {
        await api.post('/webhooks', payload)
        toast({ title: 'Webhook criado.' })
      }
      closeModal()
      await loadWebhooks()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar webhook.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await api.delete(`/webhooks/${deleteId}`)
      toast({ title: 'Webhook removido.' })
      setDeleteId(null)
      await loadWebhooks()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover webhook.' })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Receba notificações em tempo real em outros sistemas."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Webhook
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : webhooks.length === 0 ? (
        <EmptyState
          title="Nenhum webhook configurado"
          description="Crie um webhook para integrar com outros sistemas."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Webhook
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Eventos</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooks.map((webhook) => (
              <TableRow key={webhook.id}>
                <TableCell className="font-mono text-sm max-w-xs truncate">{webhook.url}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {webhook.events.map((ev) => (
                      <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={webhook.is_active}
                    onCheckedChange={() => handleToggleActive(webhook)}
                  />
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(webhook)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(webhook.id)} aria-label="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Webhook' : 'Novo Webhook'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">URL *</Label>
              <Input
                id="wh-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://meusite.com/webhook"
              />
            </div>

            <div className="space-y-2">
              <Label>Eventos *</Label>
              {ALL_EVENTS.map((ev) => (
                <label key={ev.key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev.key)}
                    onChange={() => toggleEvent(ev.key)}
                    className="h-4 w-4 rounded border"
                  />
                  <span className="text-sm">{ev.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">({ev.key})</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-secret">Secret (opcional)</Label>
              <Input
                id="wh-secret"
                type="password"
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="Chave secreta para assinatura"
              />
              {editItem && (
                <p className="text-xs text-muted-foreground">Deixe em branco para manter o secret atual.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Criar Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Remover webhook"
        description="O webhook será removido permanentemente. Deseja continuar?"
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
