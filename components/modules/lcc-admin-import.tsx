'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, RefreshCw, Search } from 'lucide-react';
import { ExcelImportPanel } from '@/components/modules/excel-import-panel';
import { useLccCatalog } from '@/hooks/use-lcc';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DualScrollContainer } from '@/components/ui/dual-scroll-container';
import { LCC_EXCEL_COLUMNS } from '@/lib/lcc/lcc-import';
import { downloadLccCatalogExcel, downloadLccExcelTemplate } from '@/lib/lcc/lcc-template';
import type { LccComponente } from '@/types/database';

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
}

export function LccAdminImport() {
  const queryClient = useQueryClient();
  const { data: catalogData, isLoading, isFetching, refetch } = useLccCatalog(true);
  const catalog: LccComponente[] = catalogData ?? [];
  const [tipo, setTipo] = useState('all');
  const [modelo, setModelo] = useState('all');
  const [grupo, setGrupo] = useState('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const tipos = useMemo(
    () => uniqueSorted(catalog.map((row) => row.tipo_maquina)),
    [catalog]
  );
  const modelos = useMemo(() => {
    const source =
      tipo === 'all' ? catalog : catalog.filter((row) => row.tipo_maquina === tipo);
    return uniqueSorted(source.map((row) => row.modelo));
  }, [catalog, tipo]);
  const grupos = useMemo(() => uniqueSorted(catalog.map((row) => row.grupo ?? '')), [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((row) => {
      if (tipo !== 'all' && row.tipo_maquina !== tipo) return false;
      if (modelo !== 'all' && row.modelo !== modelo) return false;
      if (grupo !== 'all' && (row.grupo ?? '') !== grupo) return false;
      if (!q) return true;
      const haystack = [
        row.tipo_maquina,
        row.modelo,
        row.componente,
        row.n_parte,
        row.descripcion,
        row.grupo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [catalog, tipo, modelo, grupo, search]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadLccCatalogExcel(filtered.length > 0 ? filtered : catalog);
      toast.success('Excel LCC descargado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo descargar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ExcelImportPanel
        title="Importar catálogo LCC"
        description="Cargue el Excel del fabricante (TipodeMaquina, Modelo, Componente, Horometro, Ndeparte, Descripcion, Qty, Grupo). Se actualiza por clave única."
        expectedColumns={[...LCC_EXCEL_COLUMNS]}
        modulo="lcc"
        onDownloadTemplate={() => downloadLccExcelTemplate()}
        onImport={async (result) => {
          await queryClient.invalidateQueries({ queryKey: ['lcc'] });
          await queryClient.invalidateQueries({ queryKey: ['admin'] });
          if (result.recordsOk > 0) {
            toast.success('Carga LCC finalizada', {
              description: `${result.recordsOk} registros OK · errores ${result.recordsError}`,
            });
          } else {
            toast.error('No se importaron registros LCC');
          }
        }}
      />

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm">Gestionar registros LCC</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {filtered.length.toLocaleString('es-CO')} de {catalog.length.toLocaleString('es-CO')}{' '}
                filas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="h-8 w-44 pl-8 text-xs"
                />
              </div>
              <Select
                value={tipo}
                onValueChange={(v) => {
                  setTipo(v);
                  setModelo('all');
                }}
              >
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {tipos.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={modelo} onValueChange={setModelo}>
                <SelectTrigger className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los modelos</SelectItem>
                  {modelos.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={grupo} onValueChange={setGrupo}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grupos</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={exporting || catalog.length === 0}
                onClick={() => void handleExport()}
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Descargar Excel
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={() => void refetch()}
                aria-label="Actualizar"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DualScrollContainer topScrollClassName="h-3.5 bg-muted/50" contentClassName="pb-1">
            <Table noScrollWrapper className="w-max min-w-[1100px]">
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Modelo</TableHead>
                  <TableHead className="text-xs">Componente</TableHead>
                  <TableHead className="text-xs text-right">Horómetro</TableHead>
                  <TableHead className="text-xs">N° parte</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs">Grupo</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      No hay registros LCC. Importe el Excel del fabricante.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, 200).map((row: LccComponente) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">{row.tipo_maquina}</TableCell>
                      <TableCell className="text-xs font-medium">{row.modelo}</TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={row.componente}>
                        {row.componente}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {row.horometro_horas.toLocaleString('es-CO')} h
                      </TableCell>
                      <TableCell className="text-xs font-mono">{row.n_parte || '—'}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {row.cantidad ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs">{row.grupo || '—'}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={
                            row.activo
                              ? 'text-[10px] border-emerald-200 text-emerald-700'
                              : 'text-[10px] border-slate-200 text-slate-500'
                          }
                        >
                          {row.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </DualScrollContainer>
          {filtered.length > 200 ? (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
              Mostrando 200 de {filtered.length.toLocaleString('es-CO')}. Use filtros o descargue el
              Excel completo.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
