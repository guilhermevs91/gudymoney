'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowLeftRight, CreditCard, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickTransactionButton } from '@/components/shared/quick-transaction-button';

const leftItems = [
  { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transações', icon: ArrowLeftRight },
];

const rightItems = [
  { href: '/credit-cards', label: 'Cartões', icon: CreditCard },
  { href: '/budgets', label: 'Orçamento', icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t flex items-stretch h-16">
      {/* Itens da esquerda */}
      {leftItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <item.icon className={cn('h-5 w-5', active && 'text-primary')} />
            <span>{item.label}</span>
          </Link>
        );
      })}

      {/* Botão central + */}
      <div className="flex items-center justify-center px-1">
        <QuickTransactionButton centerFab />
      </div>

      {/* Itens da direita */}
      {rightItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <item.icon className={cn('h-5 w-5', active && 'text-primary')} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
