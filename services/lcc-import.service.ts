import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { parseLccFile, type LccImportRow } from '@/lib/lcc/lcc-import';
import type { ImportExcelResponse } from '@/services/import.service';

const BATCH_SIZE = 100;
const MAX_ERROR_SAMPLES = 30;

export interface LccImportProgress {
  phase: 'parse' | 'upload' | 'done';
  processed: number;
  total: number;
  ok: number;
  updated: number;
  errors: number;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function resolveImportEstado(recordsOk: number, recordsError: number): string {
  if (recordsError <= 0) return 'completado';
  return recordsOk > 0 ? 'parcial' : 'fallido';
}

function toDbPayload(
  row: LccImportRow,
  updatedBy: string,
  importBatchId: string | null
): Record<string, unknown> {
  return {
    clave: row.clave,
    tipo_maquina: row.tipo_maquina,
    modelo: row.modelo,
    componente: row.componente,
    horometro_horas: row.horometro_horas,
    n_parte: row.n_parte,
    descripcion: row.descripcion,
    cantidad: row.cantidad,
    grupo: row.grupo,
    activo: true,
    import_batch_id: importBatchId,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
    created_by: updatedBy,
  };
}

async function refreshSessionIfNeeded(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error('Debe iniciar sesión como administrador para importar LCC.');
  }
  const expiresAt = data.session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 120) {
    await supabase.auth.refreshSession();
  }
}

async function upsertLccBatch(
  rows: LccImportRow[],
  updatedBy: string,
  importBatchId: string | null,
  onProgress?: (p: LccImportProgress) => void
): Promise<{ ok: number; updated: number; errors: Array<{ row: number; message: string }> }> {
  const supabase = getSupabaseClient();
  let ok = 0;
  let updated = 0;
  let processed = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const total = rows.length;

  const report = () => {
    onProgress?.({
      phase: 'upload',
      processed,
      total,
      ok,
      updated,
      errors: errors.length,
    });
  };

  for (const batch of chunkArray(rows, BATCH_SIZE)) {
    const payload = batch.map((row) => toDbPayload(row, updatedBy, importBatchId));
    const { data, error } = await supabase
      .from('lcc_componentes')
      .upsert(payload, { onConflict: 'clave' })
      .select('id');

    processed += batch.length;
    if (error) {
      for (const row of batch) {
        if (errors.length >= MAX_ERROR_SAMPLES) break;
        errors.push({ row: row.excelRow, message: error.message });
      }
    } else {
      ok += data?.length ?? batch.length;
      updated += batch.length;
    }
    report();
  }

  return { ok, updated, errors };
}

export async function importLccFromFile(
  file: File,
  updatedBy: string,
  onProgress?: (p: LccImportProgress) => void
): Promise<ImportExcelResponse> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado.');
  }

  onProgress?.({ phase: 'parse', processed: 0, total: 0, ok: 0, updated: 0, errors: 0 });
  const parsed = await parseLccFile(file);
  if (parsed.rows.length === 0) {
    return {
      recordsOk: 0,
      recordsError: parsed.errors.length,
      duplicates: 0,
      total: parsed.errors.length,
      errors: parsed.errors,
      error: parsed.errors[0]?.message ?? 'No se encontraron filas LCC válidas.',
    };
  }

  await refreshSessionIfNeeded();
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : 'xlsx';

  const { data: importRow, error: importError } = await supabase
    .from('importaciones')
    .insert({
      modulo: 'lcc',
      nombre_archivo: file.name,
      tipo_archivo: ext,
      registros_total: parsed.rows.length,
      registros_ok: 0,
      registros_error: parsed.errors.length,
      duplicados: 0,
      estado: 'procesando',
      user_id: user?.id ?? null,
    })
    .select('id')
    .single();

  if (importError) {
    throw new Error(importError.message);
  }

  const batchId = importRow.id as string;
  const result = await upsertLccBatch(parsed.rows, updatedBy, batchId, onProgress);
  const recordsOk = result.ok;
  const recordsError = result.errors.length + parsed.errors.length;

  await supabase
    .from('importaciones')
    .update({
      registros_ok: recordsOk,
      registros_error: recordsError,
      duplicados: result.updated,
      estado: resolveImportEstado(recordsOk, recordsError),
    })
    .eq('id', batchId);

  onProgress?.({
    phase: 'done',
    processed: parsed.rows.length,
    total: parsed.rows.length,
    ok: recordsOk,
    updated: result.updated,
    errors: recordsError,
  });

  return {
    importId: batchId,
    recordsOk,
    recordsError,
    duplicates: result.updated,
    total: parsed.rows.length + parsed.errors.length,
    errors: [...parsed.errors, ...result.errors].slice(0, MAX_ERROR_SAMPLES),
  };
}
