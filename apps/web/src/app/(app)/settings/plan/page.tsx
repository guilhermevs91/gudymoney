'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PageHeader } from '@/components/shared/page-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/ui/use-toast'
import { CheckCircle } from 'lucide-react'

interface BillingInfo {
  plan: 'FREE' | 'PAID'
  plan_expires_at?: string
  asaas_customer_id?: string
}

interface PlanDetails {
  monthly_price?: number
  annual_price?: number
  features?: { key: string; value: string }[]
}

interface PlansData {
  FREE: PlanDetails
  PAID: PlanDetails
}

export default function PlanPage() {
  const { toast } = useToast()

  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null)
  const [plans, setPlans] = useState<PlansData | null>(null)
  const [loading, setLoading] = useState(true)

  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO'>('PIX')
  const [subscribing, setSubscribing] = useState(false)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [_canceling, setCanceling] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [infoRes, plansRes] = await Promise.all([
        api.get<BillingInfo>('/billing/info'),
        api.get<PlansData>('/billing/plans'),
      ])
      setBillingInfo(infoRes)
      setPlans(plansRes)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar informações de plano.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSubscribe() {
    setSubscribing(true)
    try {
      await api.post('/billing/subscribe', { plan: period, payment_method: paymentMethod })
      toast({ title: 'Assinatura realizada com sucesso.' })
      setSubscribeOpen(false)
      await loadData()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao processar assinatura.' })
    } finally {
      setSubscribing(false)
    }
  }

  async function handleCancel() {
    setCanceling(true)
    try {
      await api.delete('/billing/subscribe')
      toast({ title: 'Assinatura cancelada.' })
      setCancelOpen(false)
      await loadData()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao cancelar assinatura.' })
    } finally {
      setCanceling(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando...</div>
  }

  const isPaid = billingInfo?.plan === 'PAID'
  const paidFeatures = plans?.PAID?.features ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Plano e Assinatura"
        description="Gerencie seu plano e forma de pagamento."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Plano atual
            <Badge variant={isPaid ? 'default' : 'secondary'}>
              {isPaid ? 'PAGO' : 'GRATUITO'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isPaid && billingInfo?.plan_expires_at && (
            <p className="text-sm text-muted-foreground">
              Expira em: <span className="font-medium">{formatDate(billingInfo.plan_expires_at)}</span>
            </p>
          )}
          {!isPaid && (
            <p className="text-sm text-muted-foreground">
              Você está no plano gratuito com recursos limitados.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Gratuito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold">R$ 0</div>
            <p className="text-sm text-muted-foreground">Para uso pessoal básico</p>
            <Separator />
            <ul className="space-y-2 text-sm">
              {(plans?.FREE?.features ?? []).map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{f.key}: {f.value}</span>
                </li>
              ))}
              {(plans?.FREE?.features ?? []).length === 0 && (
                <>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Recursos básicos</span>
                  </li>
                </>
              )}
            </ul>
            {!isPaid && (
              <Badge variant="outline" className="w-full justify-center py-1">
                Plano atual
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className={`border-2 ${!isPaid ? 'border-primary' : ''}`}>
          <CardHeader>
            <CardTitle>Pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold">
              {plans?.PAID?.monthly_price
                ? formatCurrency(plans.PAID.monthly_price)
                : '—'}
              <span className="text-base font-normal text-muted-foreground">/mês</span>
            </div>
            {plans?.PAID?.annual_price && (
              <p className="text-sm text-muted-foreground">
                ou {formatCurrency(plans.PAID.annual_price)}/ano
              </p>
            )}
            <Separator />
            <ul className="space-y-2 text-sm">
              {paidFeatures.map((f) => (
                <li key={f.key} className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                  <span>{f.key}: {f.value}</span>
                </li>
              ))}
              {paidFeatures.length === 0 && (
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                  <span>Todos os recursos</span>
                </li>
              )}
            </ul>
            {isPaid ? (
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setCancelOpen(true)}
              >
                Cancelar assinatura
              </Button>
            ) : (
              <Button className="w-full" onClick={() => setSubscribeOpen(true)}>
                Assinar agora
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={subscribeOpen} onOpenChange={(open) => { if (!open) setSubscribeOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assinar Plano Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as 'monthly' | 'annual')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">
                    Mensal {plans?.PAID?.monthly_price ? `— ${formatCurrency(plans.PAID.monthly_price)}/mês` : ''}
                  </SelectItem>
                  <SelectItem value="annual">
                    Anual {plans?.PAID?.annual_price ? `— ${formatCurrency(plans.PAID.annual_price)}/ano` : ''}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de Pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as 'PIX' | 'BOLETO')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="BOLETO">Boleto Bancário</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscribeOpen(false)} disabled={subscribing}>
              Cancelar
            </Button>
            <Button onClick={handleSubscribe} disabled={subscribing}>
              {subscribing ? 'Processando...' : 'Confirmar Assinatura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancelar assinatura"
        description="Você perderá acesso aos recursos pagos ao fim do período atual. Deseja cancelar?"
        confirmLabel="Cancelar assinatura"
        onConfirm={handleCancel}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  )
}
