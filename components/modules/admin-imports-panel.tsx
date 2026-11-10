'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ProyectadosImportPanel } from '@/components/modules/proyectados-import-panel';
import { AdminDomainImportTables } from '@/components/modules/admin-domain-import-tables';
import { AdminTelemetriaRecordsTable } from '@/components/modules/admin-telemetria-records-table';
import { AdminEquipoRelacionesTable } from '@/components/modules/admin-equipo-relaciones-table';
import { CalculadoraAdminImport } from '@/components/modules/calculadora-admin-import';
import { LccAdminImport } from '@/components/modules/lcc-admin-import';
import {
  useAdminImportaciones,
  useDeleteTelemetriaImportBatch,
  useDeleteTemparioImportBatch,
} from '@/hooks/use-administration';
import {
  countTelemetriaByImportBatch,
  countTempariosByImportBatch,
} from '@/services/administration.service';
import { countLccByImportBatch } from '@/services/lcc.service';
import { useDeleteLccImportBatch } from '@/hooks/use-lcc';
import type { AdminImportRow } from '@/services/administration.service';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '@/store';

const IMPORT_TYPES = [
  'Cronograma / Telemetría',
  'Temparios',
  'LCC',
  'Relaciones Equipo · Cliente · Asesor',
  'Asesores',
  'Equipos',
  'Clientes',
] as const;

type ImportTypeOption = (typeof IMPORT_TYPES)[number];

function formatImportChanges(resumen: AdminImportRow['resumen']): string | null {
  if (!resumen) return null;
  const parts: string[] = [];
  if (resumen.cambio_cliente) parts.push(`Cliente: ${resumen.cambio_cliente}`);
  if (resumen.cambio_asesor) parts.push(`Asesor: ${resumen.cambio_asesor}`);
  if (resumen.cambio_ubicacion) parts.push(`Ubicación: ${resumen.cambio_ubicacion}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function isBatchRevertableModulo(modulo: string): boolean {
  return modulo === 'proyectados' || modulo === 'calculadora' || modulo === 'lcc';
}

function ImportStatusBadge({ status }: Readonly<{ status: string }>) {
  const map: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    reverted: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const labels: Record<string, string> = {
    success: 'Exitoso',
    error: 'Error',
    warning: 'Parcial',
    processing: 'Procesando',
    reverted: 'Revertido',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        map[status] ?? 'bg-gray-100 text-gray-600'
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}

export function AdminImportsPanel() {
  const { role } = useUserStore();
  const isAdmin = role === 'Administrator';
  const [importType, setImportType] = useState<ImportTypeOption>(IMPORT_TYPES[0]);
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: importaciones = [] as AdminImportRow[], isLoading: loadingImports, refetch } =
    useAdminImportaciones();
  const deleteTelemetriaBatch = useDeleteTelemetriaImportBatch();
  const deleteTemparioBatch = useDeleteTemparioImportBatch();
  const deleteLccBatch = useDeleteLccImportBatch();

  const invalidateDomain = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin'] });
    await queryClient.invalidateQueries({ queryKey: ['proyectados'] });
    await queryClient.invalidateQueries({ queryKey: ['calculadora'] });
    await queryClient.invalidateQueries({ queryKey: ['lcc'] });
    await refetch();
  };

  const domainKind =
    importType === 'Asesores' || importType === 'Equipos' || importType === 'Clientes'
      ? importType
      : null;

  const handleDeleteBatch = async (imp: AdminImportRow) => {
    if (!isAdmin || !isBatchRevertableModulo(imp.modulo) || imp.status === 'reverted') return;

    const isTemparios = imp.modulo === 'calculadora';
    const isLcc = imp.modulo === 'lcc';
    let linked = 0;
    try {
      if (isTemparios) linked = await countTempariosByImportBatch(imp.batchId);
      else if (isLcc) linked = await countLccByImportBatch(imp.batchId);
      else linked = await countTelemetriaByImportBatch(imp.batchId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo consultar el lote.');
      return;
    }

    const entityLabel = isTemparios ? 'temparios' : isLcc ? 'LCC' : 'telemetría';
    const ok = window.confirm(
      `¿Eliminar la carga masiva "${imp.file}" (${imp.id})?\n\n` +
        `Se borrarán ${linked.toLocaleString('es-CO')} registro(s) de ${entityLabel} de este lote.\n` +
        (isTemparios || isLcc
          ? 'No se eliminarán otras cargas ni cotizaciones.'
          : 'No se eliminarán maestros (clientes, asesores, equipos) ni otras cargas.')
    );
    if (!ok) return;

    setDeletingBatchId(imp.batchId);
    try {
      const result = isTemparios
        ? await deleteTemparioBatch.mutateAsync(imp.batchId)
        : isLcc
          ? await deleteLccBatch.mutateAsync(imp.batchId)
          : await deleteTelemetriaBatch.mutateAsync(imp.batchId);
      toast.success(
        `Carga revertida: ${result.deleted.toLocaleString('es-CO')} registro(s) eliminados.`
      );
      if (batchFilter === imp.batchId) setBatchFilter(null);
      await invalidateDomain();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el lote.');
    } finally {
      setDeletingBatchId(null);
    }
  };

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-border shadow-sm p-5"
      >
        <h2 className="text-sm font-semibold text-foreground mb-2">Importar Datos</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {importType === 'Temparios' ? (
            <>
              Carga masiva y edición de <strong>temparios de mantenimiento</strong> que alimentan la
              calculadora. Solo administradores.
            </>
          ) : importType === 'LCC' ? (
            <>
              Catálogo <strong>LCC</strong> (ciclo de vida de componentes): TipodeMaquina, Modelo,
              Componente, Horometro, Ndeparte, Descripcion, Qty, Grupo. Alimenta la página LCC para
              todos los usuarios.
            </>
          ) : (
            <>
              El Excel de telemetría alimenta <strong>asesores</strong>, <strong>clientes</strong>,{' '}
              <strong>equipos</strong> y el <strong>cronograma</strong> (
              <code className="text-[11px]">telemetria_equipos</code>). La primera carga puede ser el
              histórico completo; cada mes se <strong>agregan</strong> ~300 registros sin borrar lo
              anterior. Si cambian cliente/asesor/ubicación, se actualizan en maestros e historial.
            </>
          )}
        </p>

        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Tipo de importación
          </p>
          <div className="flex flex-wrap gap-2">
            {IMPORT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setImportType(type)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  importType === type
                    ? 'bg-[#cf1b22] text-white border-[#cf1b22] shadow-sm'
                    : 'bg-white text-muted-foreground border-border hover:border-[#cf1b22]/50 hover:text-foreground'
                )}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {importType === 'Cronograma / Telemetría' ? (
          <div className="space-y-6">
            <div>
              <ProyectadosImportPanel />
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => void invalidateDomain()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refrescar relaciones
                </Button>
              </div>
            </div>

            {isAdmin ? (
              <AdminTelemetriaRecordsTable
                canManage={isAdmin}
                batchId={batchFilter}
                onClearBatchFilter={() => setBatchFilter(null)}
              />
            ) : null}
          </div>
        ) : null}

        {importType === 'Temparios' && isAdmin ? <CalculadoraAdminImport /> : null}
        {importType === 'Temparios' && !isAdmin ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Solo administradores pueden gestionar temparios.
          </p>
        ) : null}

        {importType === 'LCC' && isAdmin ? <LccAdminImport /> : null}
        {importType === 'LCC' && !isAdmin ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Solo administradores pueden gestionar el catálogo LCC.
          </p>
        ) : null}

        {importType === 'Relaciones Equipo · Cliente · Asesor' ? (
          <AdminEquipoRelacionesTable canManage={isAdmin} />
        ) : null}

        {domainKind ? (
          <AdminDomainImportTables kind={domainKind} canManage={isAdmin} />
        ) : null}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-xl border border-border shadow-sm"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Historial de Importaciones</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              En cargas de telemetría y temparios puede ver el lote o eliminarlo sin borrar el resto
              de la BD.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Actualizar
          </Button>
        </div>
        <div className="overflow-x-auto">
          {loadingImports ? (
            <div className="p-5">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                  <th className="px-5 py-3 text-left">ID</th>
                  <th className="px-5 py-3 text-left">Tipo</th>
                  <th className="px-5 py-3 text-left">Archivo</th>
                  <th className="px-5 py-3 text-right">Filas OK</th>
                  <th className="px-5 py-3 text-left">Estado</th>
                  <th className="px-5 py-3 text-left">Cambios detectados</th>
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-left">Usuario</th>
                  {isAdmin ? <th className="px-5 py-3 text-right">Acciones</th> : null}
                </tr>
              </thead>
              <tbody>
                {importaciones.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 9 : 8}
                      className="px-5 py-6 text-center text-muted-foreground"
                    >
                      Sin importaciones registradas en Supabase.
                    </td>
                  </tr>
                ) : (
                  importaciones.map((imp: AdminImportRow) => {
                    const isTelemetria = imp.modulo === 'proyectados';
                    const canRevert =
                      isAdmin &&
                      isBatchRevertableModulo(imp.modulo) &&
                      imp.status !== 'reverted';
                    const changesLabel = isTelemetria ? formatImportChanges(imp.resumen) : null;
                    return (
                      <tr
                        key={imp.batchId}
                        className="border-b border-border/50 hover:bg-muted/20"
                      >
                        <td className="px-5 py-3 font-mono text-muted-foreground">{imp.id}</td>
                        <td className="px-5 py-3 font-medium text-foreground">{imp.typeLabel}</td>
                        <td className="px-5 py-3 text-muted-foreground">{imp.file}</td>
                        <td className="px-5 py-3 text-right font-medium">
                          {imp.rows.toLocaleString('es-CO')}
                        </td>
                        <td className="px-5 py-3">
                          <ImportStatusBadge status={imp.status} />
                        </td>
                        <td className="px-5 py-3 text-muted-foreground max-w-[220px]">
                          {changesLabel ? (
                            <span title={imp.resumen?.muestras?.map((m) => `${m.serie}: ${m.campo}`).join(', ')}>
                              {changesLabel}
                            </span>
                          ) : isTelemetria ? (
                            'Sin cambios en flota existente'
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{imp.date}</td>
                        <td className="px-5 py-3 text-muted-foreground">{imp.user}</td>
                        {isAdmin ? (
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              {isTelemetria ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  title="Ver registros de este lote"
                                  onClick={() => {
                                    setImportType('Cronograma / Telemetría');
                                    setBatchFilter(imp.batchId);
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  Ver
                                </Button>
                              ) : null}
                              {canRevert ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                                  disabled={deletingBatchId === imp.batchId}
                                  title="Eliminar solo esta carga masiva"
                                  onClick={() => void handleDeleteBatch(imp)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                                  Eliminar lote
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}
