'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DualScrollContainer } from '@/components/ui/dual-scroll-container';
import { cn } from '@/lib/utils';

export const LCC_TABLE_PAGE_SIZE = 25;

interface LccScrollTableProps {
  readonly title: ReactNode;
  readonly filters: ReactNode;
  readonly children: ReactNode;
  readonly totalRows: number;
  readonly page: number;
  readonly onPageChange: (page: number) => void;
  readonly pageSize?: number;
  readonly className?: string;
  readonly tableMinWidthClassName?: string;
}

/**
 * Panel LCC: filtros fijos + cuerpo con altura limitada,
 * cabecera de tabla sticky y paginación.
 */
export function LccScrollTable({
  title,
  filters,
  children,
  totalRows,
  page,
  onPageChange,
  pageSize = LCC_TABLE_PAGE_SIZE,
  className,
  tableMinWidthClassName = 'min-w-[1100px]',
}: LccScrollTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalRows);

  return (
    <Card className={cn('shadow-sm overflow-hidden', className)}>
      <CardHeader className="space-y-3 border-b border-border bg-white py-3 shrink-0">
        {title}
        <div className="flex flex-wrap gap-2">{filters}</div>
      </CardHeader>
      <CardContent className="p-0">
        <DualScrollContainer
          topScrollClassName="h-3.5 bg-muted/50"
          contentClassName="max-h-[min(52vh,28rem)] overflow-y-auto overflow-x-auto overscroll-contain"
        >
          <div className={cn('w-max', tableMinWidthClassName)}>{children}</div>
        </DualScrollContainer>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5">
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {totalRows === 0
              ? 'Sin registros'
              : `Mostrando ${from.toLocaleString('es-CO')}–${to.toLocaleString('es-CO')} de ${totalRows.toLocaleString('es-CO')}`}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[4.5rem] text-center text-[11px] text-muted-foreground tabular-nums">
              {safePage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Clases para thead sticky dentro del scroll del panel LCC. */
export const lccStickyHeadClass =
  'sticky top-0 z-20 bg-muted text-xs shadow-[0_1px_0_0_hsl(var(--border))]';
