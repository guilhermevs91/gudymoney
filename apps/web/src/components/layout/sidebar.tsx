'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  Wallet,
  Tag,
  BarChart3,
  RefreshCw,
  Upload,
  Bell,
  Settings,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChangelogModal } from '@/components/shared/changelog-modal';

export const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transações', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Contas', icon: Wallet },
  { href: '/credit-cards', label: 'Cartões', icon: CreditCard },
  { href: '/categories', label: 'Categorias', icon: Tag },
  { href: '/budgets', label: 'Orçamento', icon: BarChart3 },
  { href: '/recurrences', label: 'Recorrências', icon: RefreshCw },
  { href: '/imports', label: 'Importar', icon: Upload },
  { href: '/notifications', label: 'Notificações', icon: Bell },
];

const settingsItems = [
  { href: '/settings/profile', label: 'Perfil' },
  { href: '/settings/team', label: 'Equipe' },
  { href: '/settings/plan', label: 'Plano' },
  { href: '/settings/webhooks', label: 'Webhooks' },
  { href: '/settings/lgpd', label: 'Privacidade' },
];

interface SidebarContentProps {
  pathname: string;
  appVersion: string;
  collapsed: boolean;
  onChangelogOpen: () => void;
  onNavClick?: () => void;
  onToggleCollapse?: () => void;
}

function SidebarContent({ pathname, appVersion, collapsed, onChangelogOpen, onNavClick, onToggleCollapse }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo + collapse button */}
      <div className={cn('flex items-center h-14 border-b shrink-0', collapsed ? 'justify-center px-2' : 'px-4 gap-2')}>
        {!collapsed && (
          <>
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-xs">G</span>
            </div>
            <span className="font-semibold text-sm flex-1">Gudy Money</span>
          </>
        )}
        {collapsed && (
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">G</span>
          </div>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              collapsed && 'mt-0',
            )}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform duration-200', collapsed && 'rotate-180')} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'gap-3',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}

        {/* Settings group */}
        <div className="pt-4">
          {!collapsed && (
            <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Configurações
            </p>
          )}
          {collapsed && <div className="border-t mx-2 mb-2" />}
          {settingsItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavClick}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2' : 'gap-3',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    {item.label}
                    <ChevronRight className="ml-auto h-3 w-3 opacity-50" />
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer — versão */}
      {!collapsed && (
        <div className="shrink-0 px-4 py-3 border-t">
          <button
            onClick={onChangelogOpen}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 group-hover:bg-primary transition-colors" />
            v{appVersion}
            <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
              — ver novidades
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const COLLAPSED_KEY = 'gm_sidebar_collapsed';

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('...');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then((d) => setAppVersion(d.version))
      .catch(() => setAppVersion('—'));
    // Restore collapsed state
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true');
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  }

  // Close drawer on route change (use ref to avoid closing on every render)
  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => { onMobileCloseRef.current = onMobileClose; });
  useEffect(() => {
    onMobileCloseRef.current();
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden md:flex flex-col min-h-screen border-r bg-card transition-all duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}>
        <SidebarContent
          pathname={pathname}
          appVersion={appVersion}
          collapsed={collapsed}
          onChangelogOpen={() => setChangelogOpen(true)}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col shadow-xl">
            <button
              onClick={onMobileClose}
              className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              appVersion={appVersion}
              collapsed={false}
              onChangelogOpen={() => { setChangelogOpen(true); onMobileClose(); }}
              onNavClick={onMobileClose}
            />
          </aside>
        </div>
      )}

      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        currentVersion={appVersion}
      />
    </>
  );
}
