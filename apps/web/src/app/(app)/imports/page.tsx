'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { useToast } from '@/components/ui/use-toast'
import { Import, ImportItem, Account, CreditCard } from '@/types'
import { Upload, FileText, CreditCard as CreditCardIcon, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types for Bradesco import wizard
// ---------------------------------------------------------------------------

interface BradescoPreviewCard {
  holder_name: string
  last_four: string
  transaction_count: number
  total_amount: number
  existing_card: { id: string; name: string; brand: string | null; parent_card_id: string | null } | null
  transactions: Array<{ date: string; description: string; amount: number; installment_index: number | null; installment_total: number | null }>
}

interface BradescoPreview {
  statement_date: string
  cards: BradescoPreviewCard[]
}

type CardAction = 'use_existing' | 'create_new' | 'skip'

interface CardMapping {
  action: CardAction
  credit_card_id: string | null
  create_card: {
    name: string
    brand: string
    limit_total: string
    closing_day: string
    due_day: string
    parent_card_id: string | null
  }
}

type TargetType = 'account' | 'credit_card' | ''

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ImportsPage() {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const bradescoFileRef = useRef<HTMLInputElement>(null)

  const [imports, setImports] = useState<Import[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImport, setSelectedImport] = useState<Import | null>(null)
  const [items, setItems] = useState<ImportItem[]>([])
  const [importTransactions, setImportTransactions] = useState<Transaction[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('imports')

  // Regular import dialog
  const [uploadOpen, setUploadOpen] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [targetType, setTargetType] = useState<TargetType>('')
  const [targetId, setTargetId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadFileExt, setUploadFileExt] = useState('')
  const [bankPreset, setBankPreset] = useState('nubank')

  // Bradesco wizard
  const [bradescoOpen, setBradescoOpen] = useState(false)
  const [bradescoStep, setBradescoStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [bradescoPreview, setBradescoPreview] = useState<BradescoPreview | null>(null)
  const [bradescoFile, setBradescoFile] = useState<File | null>(null)
  const [cardMappings, setCardMappings] = useState<Record<string, CardMapping>>({})
  const [bradescoLoading, setBradescoLoading] = useState(false)
  const [bradescoResult, setBradescoResult] = useState<{ imported: number; cards_resolved: number; errors: number; error_details: string[] } | null>(null)
  const [showErrorDetails, setShowErrorDetails] = useState(false)

  async function loadImports() {
    setLoading(true)
    try {
      const res = await api.get<{ data: Import[] }>('/imports')
      setImports(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar importações.' })
    } finally {
      setLoading(false)
    }
  }

  async function loadAccounts() {
    try {
      const [accRes, cardRes] = await Promise.all([
        api.get<{ data: Account[] }>('/accounts'),
        api.get<{ data: CreditCard[] }>('/credit-cards'),
      ])
      setAccounts(accRes.data.filter((a) => a.type !== 'INTERNAL'))
      setCards(cardRes.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar contas e cartões.' })
    }
  }

  async function loadItems(imp: Import) {
    setItemsLoading(true)
    setItems([])
    setImportTransactions([])
    try {
      const res = await api.get<{ data: ImportItem[] }>(`/imports/${imp.id}/items`)
      setItems(res.data)
      // For Bradesco-style imports (no import_items), load linked transactions
      if (res.data.length === 0) {
        try {
          const txRes = await api.get<{ data: Transaction[] }>(`/imports/${imp.id}/transactions`)
          setImportTransactions(txRes.data)
        } catch {
          // no transactions linked — that's fine
        }
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar itens da importação.' })
    } finally {
      setItemsLoading(false)
    }
  }

  useEffect(() => {
    loadImports()
    loadAccounts()
  }, [])

  function handleSelectImport(imp: Import) {
    setSelectedImport(imp)
    setActiveTab('items')
    loadItems(imp)
  }

  async function handleDeleteImport(imp: Import) {
    if (!confirm(`Excluir importação "${imp.filename}"?\n\nIsso apagará todas as transações criadas por esta importação.`)) return
    try {
      await api.delete(`/imports/${imp.id}`)
      toast({ title: 'Importação excluída.' })
      if (selectedImport?.id === imp.id) {
        setSelectedImport(null)
        setItems([])
        setImportTransactions([])
        setActiveTab('imports')
      }
      await loadImports()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao excluir importação.' })
    }
  }

  async function handleIgnoreItem(itemId: string) {
    if (!selectedImport) return
    try {
      await api.post(`/imports/${selectedImport.id}/items/${itemId}/ignore`, {})
      toast({ title: 'Item ignorado.' })
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: 'IGNORED' } : i))
      )
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao ignorar item.' })
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast({ variant: 'destructive', title: 'Selecione um arquivo.' }); return }
    if (!targetType || !targetId) { toast({ variant: 'destructive', title: 'Selecione uma conta ou cartão.' }); return }

    const form = new FormData()
    form.append('file', file)
    if (targetType === 'account') form.append('account_id', targetId)
    else form.append('credit_card_id', targetId)

    // For CSV files, include column_mapping preset
    const ext = file.name.toLowerCase()
    if (ext.endsWith('.csv') || ext.endsWith('.txt')) {
      form.append('column_mapping', JSON.stringify({ preset: bankPreset }))
    }

    setUploading(true)
    try {
      await api.postForm('/imports/upload', form)
      toast({ title: 'Arquivo enviado com sucesso.' })
      setUploadOpen(false)
      setTargetType('')
      setTargetId('')
      setBankPreset('nubank')
      setUploadFileExt('')
      if (fileRef.current) fileRef.current.value = ''
      await loadImports()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao enviar arquivo.' })
    } finally {
      setUploading(false)
    }
  }

  // ── Bradesco wizard ────────────────────────────────────────────────────────

  function openBradescoWizard() {
    setBradescoStep('upload')
    setBradescoPreview(null)
    setBradescoFile(null)
    setCardMappings({})
    setBradescoResult(null)
    setBradescoOpen(true)
  }

  async function handleBradescoPreview() {
    const file = bradescoFileRef.current?.files?.[0]
    if (!file) { toast({ variant: 'destructive', title: 'Selecione o arquivo da fatura.' }); return }

    setBradescoFile(file) // persist file reference before input unmounts

    const form = new FormData()
    form.append('file', file)

    setBradescoLoading(true)
    try {
      const preview = await api.postForm<BradescoPreview>('/imports/bradesco-invoice/preview', form)
      setBradescoPreview(preview)

      // Initialise mappings: auto-select existing card if found
      const initial: Record<string, CardMapping> = {}
      for (const card of preview.cards) {
        initial[card.last_four] = {
          action: card.existing_card ? 'use_existing' : 'create_new',
          credit_card_id: card.existing_card?.id ?? null,
          create_card: {
            name: `Bradesco ${card.last_four}`,
            brand: 'Mastercard',
            limit_total: '',
            closing_day: '8',
            due_day: '15',
            parent_card_id: null,
          },
        }
      }
      setCardMappings(initial)
      setBradescoStep('preview')
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Erro ao processar fatura.'
      toast({ variant: 'destructive', title: msg })
    } finally {
      setBradescoLoading(false)
    }
  }

  function updateMapping(last4: string, patch: Partial<CardMapping>) {
    setCardMappings((prev) => ({
      ...prev,
      [last4]: { ...prev[last4], ...patch },
    }))
  }

  function updateCreateCard(last4: string, patch: Partial<CardMapping['create_card']>) {
    setCardMappings((prev) => ({
      ...prev,
      [last4]: {
        ...prev[last4],
        create_card: { ...prev[last4].create_card, ...patch },
      },
    }))
  }

  async function handleBradescoImport() {
    const file = bradescoFile
    if (!file || !bradescoPreview) return

    // Validate
    for (const card of bradescoPreview.cards) {
      const m = cardMappings[card.last_four]
      if (!m) continue
      if (m.action === 'use_existing' && !m.credit_card_id) {
        toast({ variant: 'destructive', title: `Cartão ${card.last_four}: selecione um cartão existente.` }); return
      }
      if (m.action === 'create_new') {
        if (!m.create_card.name.trim()) {
          toast({ variant: 'destructive', title: `Cartão ${card.last_four}: informe o nome.` }); return
        }
        const isAdditional = !!m.create_card.parent_card_id
        if (!isAdditional && (!m.create_card.limit_total || isNaN(Number(m.create_card.limit_total)))) {
          toast({ variant: 'destructive', title: `Cartão ${card.last_four}: informe o limite.` }); return
        }
      }
    }

    // Build mappings payload
    const card_mappings = bradescoPreview.cards.map((card) => {
      const m = cardMappings[card.last_four]
      if (m.action === 'skip') return { last_four: card.last_four, skip: true }
      if (m.action === 'use_existing') return { last_four: card.last_four, credit_card_id: m.credit_card_id, skip: false }
      // create_new
      return {
        last_four: card.last_four,
        skip: false,
        create_card: {
          name: m.create_card.name,
          brand: m.create_card.brand || undefined,
          limit_total: Number(m.create_card.limit_total),
          closing_day: Number(m.create_card.closing_day),
          due_day: Number(m.create_card.due_day),
          parent_card_id: m.create_card.parent_card_id || null,
        },
      }
    })

    const form = new FormData()
    form.append('file', file)
    form.append('card_mappings', JSON.stringify(card_mappings))

    setBradescoLoading(true)
    try {
      setShowErrorDetails(false)
      const result = await api.postForm<{ imported: number; cards_resolved: number; errors: number; error_details: string[] }>(
        '/imports/bradesco-invoice/import',
        form,
      )
      setBradescoResult(result)
      setBradescoStep('done')
      await loadImports()
      await loadAccounts() // refresh cards list in case new ones were created
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Erro ao importar fatura.'
      toast({ variant: 'destructive', title: msg })
    } finally {
      setBradescoLoading(false)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function statusVariant(status: Import['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'COMPLETED') return 'default'
    if (status === 'FAILED') return 'destructive'
    if (status === 'PROCESSING') return 'secondary'
    return 'outline'
  }

  function statusLabel(status: Import['status']) {
    const map: Record<Import['status'], string> = {
      PENDING: 'Pendente', PROCESSING: 'Processando', COMPLETED: 'Concluído', FAILED: 'Falhou',
    }
    return map[status]
  }

  function itemStatusVariant(status: ImportItem['status']): 'default' | 'secondary' | 'outline' {
    if (status === 'MATCHED') return 'default'
    if (status === 'IGNORED') return 'secondary'
    return 'outline'
  }

  function itemStatusLabel(status: ImportItem['status']) {
    const map: Record<ImportItem['status'], string> = {
      PENDING: 'Pendente', MATCHED: 'Conciliado', IGNORED: 'Ignorado',
    }
    return map[status]
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importações"
        description="Importe extratos bancários e concilie transações."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openBradescoWizard}>
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Fatura Bradesco
            </Button>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importar Extrato
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="imports">Importações</TabsTrigger>
          <TabsTrigger value="items" disabled={!selectedImport}>
            Itens Pendentes{selectedImport ? ` — ${selectedImport.filename}` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="imports" className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : imports.length === 0 ? (
            <EmptyState
              title="Nenhuma importação"
              description="Envie um extrato bancário para começar."
              action={
                <Button onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Importar Extrato
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
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Formato</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Linhas</TableHead>
                      <TableHead>Conciliados</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map((imp) => (
                      <TableRow key={imp.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {imp.filename}
                          </div>
                        </TableCell>
                        <TableCell>{imp.format}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(imp.status)}>{statusLabel(imp.status)}</Badge>
                        </TableCell>
                        <TableCell>{imp.total_rows}</TableCell>
                        <TableCell>{imp.matched_rows}</TableCell>
                        <TableCell>{formatDate(imp.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleSelectImport(imp)}>Ver Itens</Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteImport(imp)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden space-y-2">
                {imports.map((imp) => (
                  <div key={imp.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <p className="text-sm font-medium truncate">{imp.filename}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                          <span>{imp.format}</span>
                          <span>·</span>
                          <span>{imp.total_rows} linhas</span>
                          <span>·</span>
                          <span>{imp.matched_rows} conciliados</span>
                          <span>·</span>
                          <span>{formatDate(imp.created_at)}</span>
                        </div>
                        <div className="mt-1.5">
                          <Badge variant={statusVariant(imp.status)} className="text-xs">{statusLabel(imp.status)}</Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => handleDeleteImport(imp)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 pt-2 border-t">
                      <Button variant="outline" size="sm" className="w-full" onClick={() => handleSelectImport(imp)}>
                        Ver Itens
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          {itemsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando itens...</div>
          ) : items.length > 0 ? (
            /* Import items (OFX/CSV or Bradesco) */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const raw = item.raw_data
                  const action = raw?.action
                  const errorMsg = raw?.error
                  return (
                    <TableRow key={item.id} className={item.status === 'PENDING' ? 'bg-destructive/5' : ''}>
                      <TableCell>{formatDate(item.date)}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={itemStatusVariant(item.status)}>{itemStatusLabel(item.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {item.status === 'PENDING' && errorMsg ? (
                          <span className="text-destructive" title={errorMsg}>{errorMsg}</span>
                        ) : action === 'repaired' ? (
                          'Fatura vinculada'
                        ) : action === 'duplicate' ? (
                          'Duplicata ignorada'
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'PENDING' && (
                          <Button variant="outline" size="sm" onClick={() => handleIgnoreItem(item.id)}>
                            Ignorar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : importTransactions.length > 0 ? (
            /* Bradesco invoice import — show linked transactions */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.category?.name ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'REALIZADO' ? 'default' : 'secondary'} className="text-xs">
                        {t.status === 'REALIZADO' ? 'Realizado' : t.status === 'PREVISTO' ? 'Previsto' : 'Cancelado'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="Nenhum item encontrado" description="Esta importação não possui itens." />
          )}
        </TabsContent>
      </Tabs>

      {/* ── Regular upload dialog ─────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) setUploadOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importar Extrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Vincular a</Label>
              <Select value={targetType} onValueChange={(v) => { setTargetType(v as TargetType); setTargetId('') }}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Conta</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targetType === 'account' && (
              <div className="space-y-1.5">
                <Label>Conta</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {targetType === 'credit_card' && (
              <div className="space-y-1.5">
                <Label>Cartão</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                  <SelectContent>
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="import-file">Arquivo *</Label>
              <input
                id="import-file"
                ref={fileRef}
                type="file"
                accept=".ofx,.csv,.txt"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                onChange={(e) => {
                  const name = e.target.files?.[0]?.name ?? ''
                  setUploadFileExt(name.toLowerCase().endsWith('.csv') || name.toLowerCase().endsWith('.txt') ? 'csv' : 'ofx')
                }}
              />
              <p className="text-xs text-muted-foreground">Formatos aceitos: .ofx, .csv, .txt</p>
            </div>

            {uploadFileExt === 'csv' && (
              <div className="space-y-1.5">
                <Label>Banco / Formato CSV</Label>
                <Select value={bankPreset} onValueChange={setBankPreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nubank">Nubank</SelectItem>
                    <SelectItem value="itau">Itaú</SelectItem>
                    <SelectItem value="bradesco">Bradesco (extrato de conta)</SelectItem>
                    <SelectItem value="santander">Santander</SelectItem>
                    <SelectItem value="bb">Banco do Brasil</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Para fatura de cartão Bradesco use o botão "Fatura Bradesco".
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={uploading}>{uploading ? 'Enviando...' : 'Enviar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bradesco invoice wizard ───────────────────────────────────────── */}
      <Dialog open={bradescoOpen} onOpenChange={(open) => { if (!open) setBradescoOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Fatura Bradesco</DialogTitle>
          </DialogHeader>

          {/* Step 1: Upload */}
          {bradescoStep === 'upload' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Exporte a fatura do site do Bradesco no formato CSV e selecione o arquivo abaixo. O sistema
                detectará automaticamente os cartões (principal, adicional e virtual).
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="bradesco-file">Arquivo da Fatura *</Label>
                <input
                  id="bradesco-file"
                  ref={bradescoFileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">Formato: CSV exportado do Bradesco Internet Banking</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBradescoOpen(false)}>Cancelar</Button>
                <Button onClick={handleBradescoPreview} disabled={bradescoLoading}>
                  {bradescoLoading ? 'Processando...' : 'Avançar'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Preview & map cards */}
          {bradescoStep === 'preview' && bradescoPreview && (
            <div className="space-y-5 py-2">
              <p className="text-sm text-muted-foreground">
                Fatura de <strong>{bradescoPreview.statement_date}</strong> — {bradescoPreview.cards.length} cartão(ões) encontrado(s).
                Para cada cartão, escolha se quer usar um cartão já cadastrado, criar um novo ou pular.
              </p>

              {bradescoPreview.cards.map((card) => {
                const m = cardMappings[card.last_four]
                if (!m) return null
                return (
                  <div key={card.last_four} className="border rounded-lg p-4 space-y-3">
                    {/* Card header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{card.holder_name} •••• {card.last_four}</p>
                        <p className="text-xs text-muted-foreground">
                          {card.transaction_count} lançamentos — {formatCurrency(card.total_amount)}
                        </p>
                      </div>
                      {card.existing_card ? (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Cartão encontrado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <AlertCircle className="mr-1 h-3 w-3" /> Não cadastrado
                        </Badge>
                      )}
                    </div>

                    {/* Sample transactions */}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {card.transactions.slice(0, 3).map((t, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="truncate max-w-[260px]">{t.date} — {t.description}{t.installment_index ? ` (${t.installment_index}/${t.installment_total})` : ''}</span>
                          <span className="ml-2 shrink-0">{formatCurrency(t.amount)}</span>
                        </div>
                      ))}
                      {card.transaction_count > 3 && (
                        <p className="text-xs italic">+ {card.transaction_count - 3} outros...</p>
                      )}
                    </div>

                    {/* Action selector */}
                    <div className="space-y-2">
                      <Select value={m.action} onValueChange={(v) => updateMapping(card.last_four, { action: v as CardAction, credit_card_id: null })}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="use_existing">Usar cartão existente</SelectItem>
                          <SelectItem value="create_new">Criar novo cartão</SelectItem>
                          <SelectItem value="skip">Pular (não importar)</SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Existing card selector */}
                      {m.action === 'use_existing' && (
                        <Select value={m.credit_card_id ?? ''} onValueChange={(v) => updateMapping(card.last_four, { credit_card_id: v })}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione o cartão" />
                          </SelectTrigger>
                          <SelectContent>
                            {cards.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name} {c.last_four ? `(${c.last_four})` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* New card form */}
                      {m.action === 'create_new' && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Nome do cartão</Label>
                            <Input
                              className="h-7 text-xs"
                              value={m.create_card.name}
                              onChange={(e) => updateCreateCard(card.last_four, { name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Bandeira</Label>
                            <Input
                              className="h-7 text-xs"
                              placeholder="Mastercard"
                              value={m.create_card.brand}
                              onChange={(e) => updateCreateCard(card.last_four, { brand: e.target.value })}
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Cartão pai (se adicional/virtual)</Label>
                            <Select
                              value={m.create_card.parent_card_id ?? 'none'}
                              onValueChange={(v) => updateCreateCard(card.last_four, { parent_card_id: v === 'none' ? null : v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Nenhum (cartão principal)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhum (cartão principal)</SelectItem>
                                {cards.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                                {bradescoPreview.cards
                                  .filter((pc) => pc.last_four !== card.last_four && cardMappings[pc.last_four]?.action === 'create_new')
                                  .map((pc) => (
                                    <SelectItem key={`new-${pc.last_four}`} value={`__new__${pc.last_four}`}>
                                      {cardMappings[pc.last_four]?.create_card.name ?? `Novo ${pc.last_four}`} (novo)
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Limit, closing day and due day only required for principal cards */}
                          {!m.create_card.parent_card_id && (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs">Limite (R$)</Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  placeholder="5000"
                                  value={m.create_card.limit_total}
                                  onChange={(e) => updateCreateCard(card.last_four, { limit_total: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1" />
                              <div className="space-y-1">
                                <Label className="text-xs">Dia fechamento</Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  min={1} max={28}
                                  value={m.create_card.closing_day}
                                  onChange={(e) => updateCreateCard(card.last_four, { closing_day: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Dia vencimento</Label>
                                <Input
                                  className="h-7 text-xs"
                                  type="number"
                                  min={1} max={28}
                                  value={m.create_card.due_day}
                                  onChange={(e) => updateCreateCard(card.last_four, { due_day: e.target.value })}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <DialogFooter>
                <Button variant="outline" onClick={() => setBradescoStep('upload')} disabled={bradescoLoading}>Voltar</Button>
                <Button onClick={handleBradescoImport} disabled={bradescoLoading}>
                  {bradescoLoading ? 'Importando...' : 'Confirmar Importação'}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Done */}
          {bradescoStep === 'done' && bradescoResult && (
            <div className="py-4 space-y-4">
              <div className="text-center space-y-2">
                <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold">Importação concluída!</p>
                <p className="text-sm text-muted-foreground">
                  {bradescoResult.imported} transaç{bradescoResult.imported === 1 ? 'ão importada' : 'ões importadas'} · {bradescoResult.cards_resolved} cartão(ões) resolvido(s)
                </p>
              </div>

              {bradescoResult.errors > 0 && (
                <div className="border border-destructive/40 rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
                    onClick={() => setShowErrorDetails((v) => !v)}
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {bradescoResult.errors} lançamento{bradescoResult.errors !== 1 ? 's' : ''} com erro
                    </span>
                    <span className="text-xs text-muted-foreground">{showErrorDetails ? '▲ ocultar' : '▼ ver detalhes'}</span>
                  </button>
                  {showErrorDetails && (
                    <div className="px-4 pb-3 space-y-1 border-t border-destructive/20 bg-destructive/5">
                      {bradescoResult.error_details.map((msg, i) => (
                        <p key={i} className="text-xs text-destructive font-mono break-all py-0.5">{msg}</p>
                      ))}
                      {bradescoResult.errors > bradescoResult.error_details.length && (
                        <p className="text-xs text-muted-foreground italic">
                          ... e mais {bradescoResult.errors - bradescoResult.error_details.length} erro(s) não exibidos.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button onClick={() => setBradescoOpen(false)}>Fechar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
