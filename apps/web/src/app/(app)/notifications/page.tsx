'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { useToast } from '@/components/ui/use-toast'
import { Notification } from '@/types'
import { Trash2, BellOff } from 'lucide-react'

export default function NotificationsPage() {
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  async function loadNotifications() {
    setLoading(true)
    try {
      const res = await api.get<{ data: Notification[] }>('/notifications?page=1&pageSize=50')
      setNotifications(res.data)
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao carregar notificações.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  async function handleMarkRead(notification: Notification) {
    if (notification.read_at) return
    try {
      await api.patch(`/notifications/${notification.id}/read`, {})
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n
        )
      )
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao marcar como lida.' })
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true)
    try {
      await api.patch('/notifications/read-all', {})
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
      )
      toast({ title: 'Todas as notificações foram marcadas como lidas.' })
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao marcar todas como lidas.' })
    } finally {
      setMarkingAll(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await api.delete(`/notifications/${id}`)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      toast({ title: 'Notificação removida.' })
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover notificação.' })
    }
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description={unreadCount > 0 ? `${unreadCount} não lida(s)` : 'Todas lidas'}
        action={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={handleMarkAllRead} disabled={markingAll}>
              {markingAll ? 'Marcando...' : 'Marcar todas como lidas'}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Sem notificações"
          description="Você não tem nenhuma notificação no momento."
          icon={<BellOff className="h-10 w-10 text-muted-foreground" />}
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleMarkRead(notification)}
              className={cn(
                'flex items-start justify-between gap-4 rounded-lg border p-4 cursor-pointer transition-colors hover:bg-muted/50',
                !notification.read_at && 'bg-muted/30 border-primary/20'
              )}
            >
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{notification.title}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {notification.type}
                  </Badge>
                  {!notification.read_at && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{notification.body}</p>
                <p className="text-xs text-muted-foreground">{formatDate(notification.created_at)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => handleDelete(notification.id, e)}
                aria-label="Remover notificação"
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
