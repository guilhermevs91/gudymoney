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
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import type { Category, CategoryType } from '@/types'
import { Pencil, Trash2, Plus } from 'lucide-react'

interface CategoryForm {
  name: string
  color: string
  parent_id: string
  type: CategoryType
}

const emptyForm: CategoryForm = {
  name: '',
  color: '',
  parent_id: '',
  type: 'BOTH',
}

const NO_PARENT = '__none__'

const TYPE_LABELS: Record<CategoryType, string> = {
  INCOME: 'Receita',
  EXPENSE: 'Despesa',
  BOTH: 'Ambos',
}

const TYPE_BADGE_CLASS: Record<CategoryType, string> = {
  INCOME: 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400',
  EXPENSE: 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400',
  BOTH: 'bg-muted text-muted-foreground',
}

export default function CategoriesPage() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Category | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  async function loadCategories() {
    setLoading(true)
    try {
      const res = await api.get<{ data: Category[] }>('/categories?flat=true')
      setCategories(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar categorias.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  function openCreate() {
    setEditItem(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(category: Category) {
    setEditItem(category)
    setForm({
      name: category.name,
      color: category.color ?? '#6366f1',
      parent_id: category.parent_id ?? '',
      type: category.type ?? 'BOTH',
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
      toast({ variant: 'destructive', title: 'O nome da categoria é obrigatório.' })
      return
    }

    setSubmitting(true)
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      parent_id: form.parent_id && form.parent_id !== NO_PARENT ? form.parent_id : undefined,
      ...(form.color ? { color: form.color } : {}),
    }

    try {
      if (editItem) {
        await api.patch(`/categories/${editItem.id}`, payload)
        toast({ title: 'Categoria atualizada com sucesso.' })
      } else {
        await api.post('/categories', payload)
        toast({ title: 'Categoria criada com sucesso.' })
      }
      closeModal()
      await loadCategories()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar categoria.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await api.delete(`/categories/${deleteId}`)
      toast({ title: 'Categoria removida com sucesso.' })
      setDeleteId(null)
      await loadCategories()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover categoria.' })
    }
  }

  const parentOptions = categories.filter(
    (c) => !c.parent_id && (!editItem || c.id !== editItem.id)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias"
        description="Organize suas transações com categorias personalizadas."
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Categoria
          </Button>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria cadastrada"
          description="Crie categorias para organizar suas transações financeiras."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Categoria
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
                  <TableHead>Cor</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => {
                  const isSystem = category.is_system ?? false
                  const catType: CategoryType = category.type ?? 'BOTH'
                  return (
                    <TableRow key={category.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {category.parent_id && (
                            <span className="text-muted-foreground text-xs pl-2">↳</span>
                          )}
                          <span className="font-medium">{category.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded-full border border-border flex-shrink-0"
                            style={{ backgroundColor: category.color ?? '#6366f1' }}
                          />
                          <span className="text-xs text-muted-foreground">{category.color ?? '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isSystem ? (
                          <Badge variant="secondary">Sistema</Badge>
                        ) : (
                          <Badge variant="outline">Personalizada</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${TYPE_BADGE_CLASS[catType]}`}>
                          {TYPE_LABELS[catType]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(category)} aria-label="Editar categoria">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(category.id)} aria-label="Remover categoria">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {categories.map((category) => {
              const isSystem = category.is_system ?? false
              const catType: CategoryType = category.type ?? 'BOTH'
              return (
                <div key={category.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div
                        className="h-4 w-4 rounded-full border border-border flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: category.color ?? '#6366f1' }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {category.parent_id && <span className="text-muted-foreground mr-1">↳</span>}
                          {category.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${TYPE_BADGE_CLASS[catType]}`}>
                            {TYPE_LABELS[catType]}
                          </span>
                          {isSystem ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sistema</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Personalizada</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(category)} aria-label="Editar categoria" className="h-8 w-8">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(category.id)} aria-label="Remover categoria" className="h-8 w-8">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nome *</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Alimentação, Transporte"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-type">Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as CategoryType })}
              >
                <SelectTrigger id="cat-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="INCOME">Receita</SelectItem>
                  <SelectItem value="BOTH">Ambos (Receita e Despesa)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-color">Cor</Label>
              <div className="flex items-center gap-3">
                <input
                  id="cat-color"
                  type="color"
                  value={form.color || '#6366f1'}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded-md border border-input bg-transparent p-1"
                />
                <span className="text-sm text-muted-foreground">
                  {form.color || <span className="italic">automática</span>}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-parent">Categoria pai (opcional)</Label>
              <Select
                value={form.parent_id || NO_PARENT}
                onValueChange={(val) => {
                  if (val === NO_PARENT) {
                    setForm({ ...form, parent_id: '' });
                  } else {
                    const parent = categories.find((c) => c.id === val);
                    setForm({ ...form, parent_id: val, color: parent?.color ?? form.color });
                  }
                }}
              >
                <SelectTrigger id="cat-parent">
                  <SelectValue placeholder="Nenhuma (categoria raiz)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PARENT}>Nenhuma (categoria raiz)</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: c.color ?? '#6366f1' }}
                        />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Criar categoria'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        title="Remover categoria"
        description="Esta ação não pode ser desfeita. Deseja remover esta categoria?"
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
