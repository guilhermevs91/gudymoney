'use client'

import { useEffect, useState } from 'react'
import { superadminApi } from '@/lib/api'
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
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { PlanFeature, PlanType } from '@/types'
import { Pencil, Plus, Trash2 } from 'lucide-react'

interface FeatureForm {
  plan: PlanType | ''
  feature_key: string
  feature_value: string
}

const emptyForm: FeatureForm = { plan: '', feature_key: '', feature_value: '' }

export default function FeaturesPage() {
  const { toast } = useToast()

  const [features, setFeatures] = useState<PlanFeature[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<PlanFeature | null>(null)
  const [form, setForm] = useState<FeatureForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function loadFeatures() {
    setLoading(true)
    try {
      const res = await superadminApi.get<{ data: PlanFeature[] }>('/superadmin/plan-features')
      setFeatures(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar features.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFeatures()
  }, [])

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(feature: PlanFeature) {
    setEditItem(feature)
    setForm({ plan: feature.plan, feature_key: feature.feature_key, feature_value: feature.feature_value })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditItem(null)
    setForm(emptyForm)
  }

  async function handleSubmit() {
    if (!form.feature_key.trim() || !form.feature_value.trim()) {
      toast({ variant: 'destructive', title: 'Preencha chave e valor.' })
      return
    }

    setSubmitting(true)
    try {
      if (editItem) {
        await superadminApi.patch(`/superadmin/plan-features/${editItem.id}`, {
          feature_value: form.feature_value.trim(),
        })
        toast({ title: 'Feature atualizada.' })
      } else {
        if (!form.plan) {
          toast({ variant: 'destructive', title: 'Selecione o plano.' })
          setSubmitting(false)
          return
        }
        await superadminApi.put('/superadmin/plan-features', {
          plan: form.plan,
          feature_key: form.feature_key.trim(),
          feature_value: form.feature_value.trim(),
        })
        toast({ title: 'Feature criada.' })
      }
      closeModal()
      await loadFeatures()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar feature.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await superadminApi.delete(`/superadmin/plan-features/${deleteId}`)
      toast({ title: 'Feature removida.' })
      setDeleteId(null)
      await loadFeatures()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover feature.' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Planos e Features</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure os limites e recursos de cada plano.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Feature
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plano</TableHead>
              <TableHead>Chave</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {features.map((feature) => (
              <TableRow key={feature.id}>
                <TableCell>
                  <Badge variant={feature.plan === 'PAID' ? 'default' : 'secondary'}>
                    {feature.plan}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">{feature.feature_key}</TableCell>
                <TableCell>{feature.feature_value}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(feature)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(feature.id)} aria-label="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {features.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Nenhuma feature configurada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Feature' : 'Nova Feature'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editItem && (
              <div className="space-y-1.5">
                <Label>Plano *</Label>
                <Select
                  value={form.plan}
                  onValueChange={(v) => setForm({ ...form, plan: v as PlanType })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FREE">FREE</SelectItem>
                    <SelectItem value="PAID">PAID</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="feat-key">Chave *</Label>
              <Input
                id="feat-key"
                value={form.feature_key}
                onChange={(e) => setForm({ ...form, feature_key: e.target.value })}
                placeholder="Ex: max_accounts"
                disabled={!!editItem}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feat-value">Valor *</Label>
              <Input
                id="feat-value"
                value={form.feature_value}
                onChange={(e) => setForm({ ...form, feature_value: e.target.value })}
                placeholder="Ex: 5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Criar Feature'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Remover feature"
        description="A feature será removida permanentemente. Deseja continuar?"
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
