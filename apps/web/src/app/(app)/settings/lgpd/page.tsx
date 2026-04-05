'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { AlertTriangle, Download, ShieldCheck } from 'lucide-react'

interface Consent {
  id: string
  purpose: string
  granted_at: string
  revoked_at?: string
}

interface MyData {
  personal: Record<string, unknown>
  financial: Record<string, unknown>
  consents: Consent[]
  data_categories: string[]
}

export default function LgpdPage() {
  const { toast } = useToast()

  const [myData, setMyData] = useState<MyData | null>(null)
  const [consents, setConsents] = useState<Consent[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [dataRes, consentsRes] = await Promise.all([
        api.get<MyData>('/lgpd/my-data'),
        api.get<{ data: Consent[] }>('/lgpd/consents'),
      ])
      setMyData(dataRes)
      setConsents(consentsRes.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar dados LGPD.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleExport() {
    setExporting(true)
    try {
      window.open('/lgpd/export', '_blank')
      toast({ title: 'Download iniciado.' })
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao exportar dados.' })
    } finally {
      setExporting(false)
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return
    try {
      await api.delete('/lgpd/consents', { purpose: revokeTarget })
      toast({ title: 'Consentimento revogado.' })
      setRevokeTarget(null)
      setConsents((prev) =>
        prev.map((c) =>
          c.purpose === revokeTarget ? { ...c, revoked_at: new Date().toISOString() } : c
        )
      )
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao revogar consentimento.' })
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'EXCLUIR MINHA CONTA') {
      toast({ variant: 'destructive', title: 'Texto de confirmação incorreto.' })
      return
    }
    if (!deletePassword) {
      toast({ variant: 'destructive', title: 'Informe sua senha.' })
      return
    }
    setDeleting(true)
    try {
      await api.delete('/lgpd/account', {
        confirmation: 'EXCLUIR MINHA CONTA',
        password: deletePassword,
      })
      toast({ title: 'Conta excluída. Você será desconectado.' })
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao excluir conta. Verifique sua senha.' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Privacidade e LGPD"
        description="Gerencie seus dados e consentimentos conforme a LGPD."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Meus Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Categorias de dados coletados:</p>
            <div className="flex flex-wrap gap-2">
              {(myData?.data_categories ?? []).map((cat) => (
                <Badge key={cat} variant="secondary">{cat}</Badge>
              ))}
              {(myData?.data_categories ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma categoria informada.</p>
              )}
            </div>
          </div>
          <Button onClick={handleExport} disabled={exporting} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar Dados (CSV)'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Consentimentos</CardTitle>
        </CardHeader>
        <CardContent>
          {consents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum consentimento registrado.</p>
          ) : (
            <div className="space-y-3">
              {consents.map((consent) => (
                <div
                  key={consent.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-md border"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{consent.purpose}</p>
                    <p className="text-xs text-muted-foreground">
                      Concedido em {formatDate(consent.granted_at)}
                    </p>
                    {consent.revoked_at && (
                      <p className="text-xs text-destructive">
                        Revogado em {formatDate(consent.revoked_at)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {consent.revoked_at ? (
                      <Badge variant="secondary">Revogado</Badge>
                    ) : (
                      <>
                        <Badge variant="default">Ativo</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokeTarget(consent.purpose)}
                        >
                          Revogar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive space-y-1">
            <p className="font-semibold">Atenção: esta ação é irreversível.</p>
            <p>
              Todos os seus dados financeiros, transações, contas e configurações serão
              permanentemente excluídos e não poderão ser recuperados.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Digite <span className="font-mono font-bold">EXCLUIR MINHA CONTA</span> para confirmar
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="EXCLUIR MINHA CONTA"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-password">Sua senha</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <Button
            variant="destructive"
            onClick={handleDeleteAccount}
            disabled={deleting || deleteConfirm !== 'EXCLUIR MINHA CONTA' || !deletePassword}
          >
            {deleting ? 'Excluindo...' : 'Excluir minha conta definitivamente'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!revokeTarget}
        title="Revogar consentimento"
        description={`Deseja revogar o consentimento para "${revokeTarget}"? Isso pode limitar algumas funcionalidades.`}
        confirmLabel="Revogar"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
