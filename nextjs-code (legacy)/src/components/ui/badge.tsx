import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neutral-900',
  {
    variants: {
      variant: {
        default:
          'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700',
        success:
          'bg-[hsl(var(--color-price-up))]/15 text-[hsl(var(--color-price-up))] border-[hsl(var(--color-price-up))]/30',
        warning:
          'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-800/30 dark:text-amber-200 dark:border-amber-500/40',
        danger:
          'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
        info: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
        neutral:
          'bg-neutral-200 text-neutral-800 border-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:border-neutral-600',
      },
      tone: { solid: 'text-white', soft: '' },
    },
    compoundVariants: [
      {
        variant: 'success',
        tone: 'solid',
        className: 'bg-[hsl(var(--color-price-up))] text-white border-[hsl(var(--color-price-up))]',
      },
      { variant: 'danger', tone: 'solid', className: 'bg-red-600 text-white border-red-600' },
      { variant: 'warning', tone: 'solid', className: 'bg-amber-500 text-white border-amber-500' },
      { variant: 'info', tone: 'solid', className: 'bg-blue-600 text-white border-blue-600' },
      {
        variant: 'neutral',
        tone: 'solid',
        className: 'bg-neutral-500 text-white border-neutral-500',
      },
      {
        variant: 'default',
        tone: 'solid',
        className: 'bg-neutral-600 text-white border-neutral-600 dark:bg-neutral-500',
      },
    ],
    defaultVariants: { variant: 'default', tone: 'soft' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, tone, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant, tone }), className)} {...props} />
  )
);
Badge.displayName = 'Badge';

export { badgeVariants };
