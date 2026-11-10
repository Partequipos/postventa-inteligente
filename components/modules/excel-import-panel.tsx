'use client';

import { useCallback, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { invokeImportExcel, type ImportModulo } from '@/services/import.service';
import {
  importTempariosFromFile,
  type TemparioImportProgress,
} from '@/services/tempario-import.service';
import {
  importTelemetriaFromFile,
  type TelemetriaImportProgress,
} from '@/services/telemetria-import.service';
import {
  importLccFromFile,
  type LccImportProgress,
} from '@/services/lcc-import.service';
import { useUserStore } from '@/store';

export interface ExcelImportResult {
  fileName: string;
  recordsOk: number;
  recordsError: number;
  duplicates: number;
  total: number;
  preview: readonly string[];
  errors?: Array<{ row: number; message: string }>;
}

interface ExcelImportPanelProps {
  readonly title: string;
  readonly description: string;
  readonly expectedColumns: readonly string[];
  readonly modulo: ImportModulo;
  readonly onImport: (result: ExcelImportResult) => void | Promise<void>;
  readonly className?: string;
  /** Si se define, muestra botón para descargar la plantilla Excel. */
  readonly onDownloadTemplate?: () => void | Promise<void>;
  readonly templateButtonLabel?: string;
}

type UploadProgress = TemparioImportProgress | TelemetriaImportProgress | LccImportProgress;

export function ExcelImportPanel({
  title,
  description,
  expectedColumns,
  modulo,
  onImport,
  className,
  onDownloadTemplate,
  templateButtonLabel = 'Descargar plantilla Excel',
}: ExcelImportPanelProps) {
  const { currentUser } = useUserStore();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const validExtensions = ['.xlsx', '.xls', '.csv'];

  const handleDownloadTemplate = async () => {
    if (!onDownloadTemplate || downloadingTemplate) return;
    setDownloadingTemplate(true);
    setError(null);
    try {
      await onDownloadTemplate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo descargar la plantilla Excel'
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const validateFile = (f: File): boolean => {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    return validExtensions.includes(ext);
  };

  const processFile = useCallback(
    async (f: File) => {
      setError(null);
      setRowErrors([]);
      setPreview([]);
      setProgress(null);
      setProcessing(true);

      try {
        let recordsOk = 0;
        let recordsError = 0;
        let duplicates = 0;
        let total = 0;
        let skipped = 0;
        let deduplicated = 0;
        let importResumen: import('@/services/import.service').TelemetriaImportResumen | undefined;
        let errors: Array<{ row: number; message: string }> = [];

        if (modulo === 'calculadora') {
          const response = await importTempariosFromFile(
            f,
            currentUser?.email ?? currentUser?.name ?? 'admin',
            (p) => setProgress({ ...p })
          );
          if (response.error && response.recordsOk === 0) {
            throw new Error(response.error);
          }
          recordsOk = response.recordsOk;
          recordsError = response.recordsError;
          duplicates = response.duplicates;
          total = response.total ?? recordsOk + recordsError;
          errors = response.errors ?? [];
        } else if (modulo === 'proyectados') {
          const response = await importTelemetriaFromFile(
            f,
            currentUser?.email ?? currentUser?.name ?? 'admin',
            (p) => setProgress({ ...p })
          );
          if (response.error && response.recordsOk === 0) {
            throw new Error(response.error);
          }
          recordsOk = response.recordsOk;
          recordsError = response.recordsError;
          duplicates = response.duplicates;
          total = response.total ?? recordsOk + recordsError;
          skipped = response.skipped ?? 0;
          deduplicated = response.deduplicated ?? 0;
          importResumen = response.resumen;
          errors = response.errors ?? [];
        } else if (modulo === 'lcc') {
          const response = await importLccFromFile(
            f,
            currentUser?.email ?? currentUser?.name ?? 'admin',
            (p) => setProgress({ ...p })
          );
          if (response.error && response.recordsOk === 0) {
            throw new Error(response.error);
          }
          recordsOk = response.recordsOk;
          recordsError = response.recordsError;
          duplicates = response.duplicates;
          total = response.total ?? recordsOk + recordsError;
          skipped = response.skipped ?? 0;
          errors = response.errors ?? [];
        } else if (isSupabaseConfigured()) {
          const response = await invokeImportExcel(modulo, f);
          recordsOk = response.recordsOk;
          recordsError = response.recordsError;
          duplicates = response.duplicates;
          total = response.total ?? recordsOk + recordsError;
          errors = response.errors ?? [];
        } else {
          await new Promise((r) => setTimeout(r, 800));
          recordsOk = 25;
          total = 25;
        }

        const updatedLabel =
          modulo === 'proyectados'
            ? `Registros agregados al historial: ${recordsOk} (no se borran meses anteriores)`
            : modulo === 'lcc'
              ? `Filas LCC cargadas/actualizadas: ${recordsOk}`
              : `Actualizados (mismo ID): ${duplicates}`;

        const accounted = recordsOk + recordsError + skipped;
        const previewLines = [
          `Archivo: ${f.name}`,
          `Filas leídas del Excel: ${total}`,
          ...(skipped > 0
            ? [
                modulo === 'lcc'
                  ? `Filas omitidas (vacías o incompletas, sin error): ${skipped}`
                  : `Filas omitidas (vacías / sin serie): ${skipped}`,
              ]
            : []),
          ...(modulo === 'proyectados'
            ? [
                'Modo: carga aditiva (histórico se conserva; cada mes suma filas nuevas)',
              ]
            : []),
          ...(modulo === 'lcc'
            ? ['Modo: se cargan todas las filas válidas; no se exige ID ni se rechazan repeticiones.']
            : []),
          ...(modulo === 'proyectados' && deduplicated > 0
            ? [`Máquinas sincronizadas (cliente/asesor/ubicación en historial): ${deduplicated}`]
            : []),
          ...(modulo === 'proyectados' && importResumen?.cambio_cliente
            ? [`Máquinas con cambio de cliente: ${importResumen.cambio_cliente}`]
            : []),
          ...(modulo === 'proyectados' && importResumen?.cambio_asesor
            ? [`Máquinas con cambio de asesor: ${importResumen.cambio_asesor}`]
            : []),
          ...(modulo === 'proyectados' && importResumen?.cambio_ubicacion
            ? [`Máquinas con cambio de ubicación: ${importResumen.cambio_ubicacion}`]
            : []),
          ...(modulo === 'proyectados' &&
          importResumen?.muestras &&
          importResumen.muestras.length > 0
            ? [
                `Ejemplos: ${importResumen.muestras
                  .slice(0, 3)
                  .map((m) => `${m.serie} (${m.campo})`)
                  .join(', ')}`,
              ]
            : []),
          ...(modulo !== 'proyectados' && deduplicated > 0
            ? [`Filas consolidadas (duplicado exacto en archivo): ${deduplicated}`]
            : []),
          `Registros cargados OK: ${recordsOk}`,
          updatedLabel,
          `Errores: ${recordsError}`,
          accounted < total
            ? `Diferencia vs archivo: ${total - accounted}`
            : 'Cobertura: 100% de filas con datos de equipo procesadas',
        ];
        setPreview(previewLines);
        setRowErrors(errors.slice(0, 12));
        setProgress(null);

        await onImport({
          fileName: f.name,
          recordsOk,
          recordsError,
          duplicates,
          total,
          preview: expectedColumns,
          errors,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al importar');
        setProgress(null);
      } finally {
        setProcessing(false);
      }
    },
    [currentUser?.email, currentUser?.name, expectedColumns, modulo, onImport]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (!validateFile(f)) {
        setError('Formato no válido. Use .xlsx, .xls o .csv');
        return;
      }
      setFile(f);
      void processFile(f);
    },
    [processFile]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!validateFile(f)) {
      setError('Formato no válido. Use .xlsx, .xls o .csv');
      return;
    }
    setFile(f);
    void processFile(f);
    e.target.value = '';
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <Card className={cn('border-[#50504f]/20', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#50504f]">
          <FileSpreadsheet className="h-4 w-4 text-[#cf1b22]" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {onDownloadTemplate ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              Descargue la plantilla (inicia en <strong>Marca</strong>), complete los datos y
              súbala a continuación.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 border-[#cf1b22]/30 text-[#cf1b22] hover:bg-[#cf1b22]/5"
              onClick={() => void handleDownloadTemplate()}
              disabled={processing || downloadingTemplate}
            >
              {downloadingTemplate ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              {templateButtonLabel}
            </Button>
          </div>
        ) : null}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
            dragOver ? 'border-[#cf1b22] bg-[#cf1b22]/5' : 'border-muted-foreground/25',
            processing && 'opacity-60 pointer-events-none'
          )}
        >
          {processing ? (
            <Loader2 className="h-8 w-8 mx-auto text-[#cf1b22] animate-spin" />
          ) : (
            <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          )}
          <p className="mt-2 text-sm font-medium">
            {processing
              ? progress?.phase === 'parse'
                ? 'Leyendo Excel…'
                : progress?.phase === 'relations'
                  ? 'Normalizando clientes / asesores / sedes / máquinas…'
                  : `Cargando en base de datos… ${progress?.processed ?? 0}/${progress?.total ?? '—'}`
              : 'Arrastre su archivo Excel o CSV aquí'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Formatos: .xlsx · .xls · .csv — archivos grandes se cargan por lotes
          </p>
          {processing && progress && progress.total > 0 && (
            <div className="mt-4 mx-auto max-w-sm text-left">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-[#cf1b22] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                {progressPct}% · OK {progress.ok} · Act. {progress.updated} · Err. {progress.errors}
              </p>
            </div>
          )}
          <label className="mt-4 inline-block">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileInput}
              disabled={processing}
            />
            <Button type="button" variant="outline" size="sm" className="mt-2" asChild>
              <span>Seleccionar archivo</span>
            </Button>
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {file && preview.length > 0 && !processing && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Carga finalizada — {file.name}
            </div>
            {preview.map((line) => (
              <p key={line} className="text-xs text-emerald-900/80 font-mono">
                {line}
              </p>
            ))}
            {rowErrors.length > 0 && (
              <div className="pt-2 border-t border-emerald-200/80 space-y-1">
                <p className="text-xs font-medium text-amber-800">
                  Detalle de errores (muestra):
                </p>
                {rowErrors.map((err) => (
                  <p
                    key={`${err.row}-${err.message}`}
                    className="text-[11px] text-muted-foreground font-mono"
                  >
                    Fila/ID {err.row || '—'}: {err.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="text-[11px] text-muted-foreground border-t pt-3">
          <strong>Columnas:</strong> {expectedColumns.join(' · ')}
        </div>
      </CardContent>
    </Card>
  );
}
