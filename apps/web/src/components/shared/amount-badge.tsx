import { cn, formatCurrency } from '@/lib/utils';

interface AmountBadgeProps {
  amount: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  className?: string;
}

export function AmountBadge({ amount, type, className }: AmountBadgeProps) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        type === 'INCOME' && 'text-green-600 dark:text-green-400',
        type === 'EXPENSE' && 'text-red-600 dark:text-red-400',
        type === 'TRANSFER' && 'text-blue-600 dark:text-blue-400',
        className,
      )}
    >
      {type === 'INCOME' ? '+' : type === 'EXPENSE' ? '-' : ''}
      {formatCurrency(amount)}
    </span>
  );
}
