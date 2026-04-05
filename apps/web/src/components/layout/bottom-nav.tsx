'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowLeftRight, CreditCard, Wallet, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const bottomItems = [
  { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transações', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Contas', icon: Wallet },
  { href: '/credit-cards', label: 'Cartões', icon: CreditCard },
  { href: '/budgets', label: 'Orçamento', icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t flex items-stretch h-16">
      {bottomItems.map((item) => {
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
