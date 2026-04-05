'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getSuperAdminToken, clearSuperAdminToken } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BarChart2, Building2, LayoutDashboard, LogOut, Sliders } from 'lucide-react'

const navLinks = [
  { href: '/superadmin/metrics', label: 'Métricas', icon: BarChart2 },
  { href: '/superadmin/tenants', label: 'Tenants', icon: Building2 },
  { href: '/superadmin/features', label: 'Planos', icon: Sliders },
]

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!getSuperAdminToken()) {
      router.replace('/superadmin/login')
    }
  }, [router])

  function handleLogout() {
    clearSuperAdminToken()
    router.push('/superadmin/login')
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 border-r flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-6 py-5 border-b">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <span className="font-bold text-lg">SuperAdmin</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                pathname === href ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
