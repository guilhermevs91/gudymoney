'use client'

import { useEffect, useState } from 'react'
import { superadminApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { BarChart2, TrendingDown, Users, UserCheck, CreditCard } from 'lucide-react'

interface Metrics {
  mrr: number
  churn: number
  total_tenants: number
  active_tenants: number
  paid_tenants: number
}

export default function MetricsPage() {
  const { toast } = useToast()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await superadminApi.get<Metrics>('/superadmin/metrics')
        setMetrics(res)
      } catch {
        toast({ variant: 'destructive', title: 'Erro ao carregar métricas.' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const cards = [
    {
      title: 'MRR',
      value: metrics ? formatCurrency(metrics.mrr) : '—',
      icon: BarChart2,
      description: 'Receita mensal recorrente',
    },
    {
      title: 'Churn',
      value: metrics ? `${(metrics.churn * 100).toFixed(1)}%` : '—',
      icon: TrendingDown,
      description: 'Taxa de cancelamento',
    },
    {
      title: 'Total de Tenants',
      value: metrics ? String(metrics.total_tenants) : '—',
      icon: Users,
      description: 'Todos os workspaces',
    },
    {
      title: 'Tenants Ativos',
      value: metrics ? String(metrics.active_tenants) : '—',
      icon: UserCheck,
      description: 'Workspaces ativos',
    },
    {
      title: 'Pagantes',
      value: metrics ? String(metrics.paid_tenants) : '—',
      icon: CreditCard,
      description: 'Workspaces com plano pago',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Métricas da Plataforma</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão geral do desempenho do Gudy Money.</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
