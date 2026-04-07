'use client'

import { useEffect, useState, useCallback } from 'react'
import { superadminApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { RefreshCw, Shield, ShieldAlert, Search, Activity } from 'lucide-react'

interface SecurityLog {
  id: string
  created_at: string
  action: string
  entity_type: string
  entity_id: string
  ip_address: string | null
  user_agent: string | null
  tenant_id: string | null
  user_id: string | null
  after_data: Record<string, unknown> | null
}

interface TopIp {
  ip: string | null
  count: number
}

interface SecurityLogsResponse {
  data: SecurityLog[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
  summary: {
    period_hours: number
    total_events: number
    top_ips_by_login: TopIp[]
    suspicious_ips: TopIp[]
  }
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  CREATE: 'Criação',
  UPDATE: 'Atualização',
  DELETE: 'Exclusão',
}

const ACTION_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  LOGIN: 'default',
  CREATE: 'secondary',
  UPDATE: 'outline',
  DELETE: 'destructive',
}

export default function SecurityPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<SecurityLogsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [hours, setHours] = useState('24')
  const [action, setAction] = useState('all')
  const [ipFilter, setIpFilter] = useState('')
  const [ipSearch, setIpSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        page,
        limit: 50,
        hours: parseInt(hours),
      }
      if (action !== 'all') params['action'] = action
      if (ipSearch) params['ip_address'] = ipSearch

      const data = await superadminApi.get<SecurityLogsResponse>('/superadmin/security-logs', params)
      setResult(data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar logs de segurança.' })
    } finally {
      setLoading(false)
    }
  }, [page, hours, action, ipSearch, toast])

  useEffect(() => {
    void load()
  }, [load])

  function handleSearch() {
    setIpSearch(ipFilter)
    setPage(1)
  }

  function handleClearSearch() {
    setIpFilter('')
    setIpSearch('')
    setPage(1)
  }

  function formatDateTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
  }

  function truncate(str: string | null, len = 32) {
    if (!str) return '—'
    return str.length > len ? str.slice(0, len) + '…' : str
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Logs de Segurança
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento de acessos e tentativas de invasão
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Total de eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{result.summary.total_events}</p>
              <p className="text-xs text-muted-foreground">últimas {result.summary.period_hours}h</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Top IPs por login
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {result.summary.top_ips_by_login.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum login no período</p>
              ) : (
                result.summary.top_ips_by_login.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <button
                      className="font-mono text-xs text-primary hover:underline"
                      onClick={() => { setIpFilter(item.ip ?? ''); setIpSearch(item.ip ?? ''); setPage(1); }}
                    >
                      {item.ip ?? '—'}
                    </button>
                    <Badge variant="secondary">{item.count}x</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                IPs suspeitos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {result.summary.suspicious_ips.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma atividade suspeita</p>
              ) : (
                result.summary.suspicious_ips.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <button
                      className="font-mono text-xs text-destructive hover:underline"
                      onClick={() => { setIpFilter(item.ip ?? ''); setIpSearch(item.ip ?? ''); setPage(1); }}
                    >
                      {item.ip ?? '—'}
                    </button>
                    <Badge variant="destructive">{item.count}x</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Período</label>
          <Select value={hours} onValueChange={(v) => { setHours(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última 1h</SelectItem>
              <SelectItem value="6">Últimas 6h</SelectItem>
              <SelectItem value="24">Últimas 24h</SelectItem>
              <SelectItem value="72">Últimas 72h</SelectItem>
              <SelectItem value="168">Última semana</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Ação</label>
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="LOGIN">Login</SelectItem>
              <SelectItem value="CREATE">Criação</SelectItem>
              <SelectItem value="UPDATE">Atualização</SelectItem>
              <SelectItem value="DELETE">Exclusão</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Filtrar por IP</label>
          <div className="flex gap-2">
            <Input
              placeholder="ex: 192.168.1.1"
              value={ipFilter}
              onChange={(e) => setIpFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-44"
            />
            <Button size="sm" variant="outline" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
            {ipSearch && (
              <Button size="sm" variant="ghost" onClick={handleClearSearch}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>User Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : result?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  Nenhum evento encontrado no período.
                </TableCell>
              </TableRow>
            ) : (
              result?.data.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs whitespace-nowrap">{formatDateTime(log.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANTS[log.action] ?? 'outline'}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{log.entity_type}</TableCell>
                  <TableCell>
                    {log.ip_address ? (
                      <button
                        className="font-mono text-xs text-primary hover:underline"
                        onClick={() => { setIpFilter(log.ip_address!); setIpSearch(log.ip_address!); setPage(1); }}
                      >
                        {log.ip_address}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    {truncate(log.user_agent, 40)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {result && result.pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{result.pagination.total} eventos encontrados</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span className="px-3 py-1 border rounded text-sm">
              {page} / {result.pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === result.pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
