import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  parseTemparioFile,
  type TemparioImportRow,
} from '@/lib/calculadora/tempario-import';
import type { ImportExcelResponse } from '@/services/import.service';

const BATCH_SIZE = 100;
const MAX_ERROR_SAMPLES = 30;

export interface TemparioImportProgress {
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
  row: TemparioImportRow,
  updatedBy: string,
  importBatchId: string | null
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    legacy_id: row.legacy_id,
    marca: row.marca,
    linea: row.linea || '',
    modelo: row.modelo,
    tipo_item: row.tipo_item,
    tipo_catalogo: row.tipo_catalogo,
    item: row.item,
    unidad_medida: row.unidad_medida || 'Unidad',
    cantidad: row.cantidad,
    frecuencia_horas: row.frecuencia_horas,
    frecuencia_grupo: row.frecuencia_grupo,
    aceite_homologado: row.aceite_homologado,
    referencia_genuina: row.referencia_genuina,
    ref_sap_dispel: row.ref_sap_dispel,
    ref_sap_original: row.ref_sap_original,
    referencia_stal: row.referencia_stal,
    referencia_fleetguard: row.referencia_fleetguard,
    referencia_donaldson: row.referencia_donaldson,
    tiempo_horas: row.tiempo_horas,
    procedimiento: row.procedimiento,
    avisos_claves: row.avisos_claves,
    created_by: row.created_by,
    updated_by: updatedBy || row.updated_by,
    activo: true,
    import_batch_id: importBatchId,
  };

  if (row.created_at) payload.created_at = row.created_at;
  if (row.updated_at) payload.updated_at = row.updated_at;
  else payload.updated_at = new Date().toISOString();

  return payload;
}

async function refreshSessionIfNeeded(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error(
      'Debe iniciar sesión con Supabase Auth (admin) para importar temparios a la base de datos.'
    );
  }
  const expiresAt = data.session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 120) {
    await supabase.auth.refreshSession();
  }
}

/**
 * Inserta/actualiza por lotes.
 * Filas con ID → upsert onConflict legacy_id.
 * Filas sin ID → insert por lotes (fallback fila a fila).
 */
async function upsertTemparioBatch(
  rows: TemparioImportRow[],
  updatedBy: string,
  importBatchId: string | null,
  onProgress?: (p: TemparioImportProgress) => void
): Promise<{ ok: number; updated: number; errors: Array<{ row: number; message: string }> }> {
  const supabase = getSupabaseClient();
  let ok = 0;
  let updated = 0;
  let processed = 0;
  const errors: Array<{ row: number; message: string }> = [];

  const withLegacy = rows.filter((r) => r.legacy_id != null);
  const withoutLegacy = rows.filter((r) => r.legacy_id == null);
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

  // ── Con ID: upsert por lotes (evita miles de HTTP requests) ──
  for (const batch of chunkArray(withLegacy, BATCH_SIZE)) {
    await refreshSessionIfNeeded();

    const legacyIds = batch.map((r) => r.legacy_id as number);
    const { data: existingRows, error: existingErr } = await supabase
      .from('temparios_mantenimiento')
      .select('legacy_id')
      .in('legacy_id', legacyIds);

    if (existingErr) {
      // No abortar todo el archivo: marcar lote y continuar con insert simple
      for (const row of batch) {
        errors.push({ row: row.legacy_id ?? 0, message: existingErr.message });
        processed += 1;
      }
      report();
      continue;
    }

    const existingSet = new Set(
      (existingRows ?? []).map((r) => Number(r.legacy_id)).filter((n) => Number.isFinite(n))
    );

    const payloads = batch.map((row) => toDbPayload(row, updatedBy, importBatchId));

    const { error: upsertErr } = await supabase.from('temparios_mantenimiento').upsert(payloads, {
      onConflict: 'legacy_id',
      ignoreDuplicates: false,
    });

    if (upsertErr) {
      // Fallback fila a fila dentro del lote
      for (const row of batch) {
        const payload = toDbPayload(row, updatedBy, importBatchId);
        const { error: rowErr } = await supabase
          .from('temparios_mantenimiento')
          .upsert(payload, { onConflict: 'legacy_id', ignoreDuplicates: false });

        if (rowErr) {
          // Último recurso: insert o update manual
          if (existingSet.has(row.legacy_id as number)) {
            const { legacy_id: _l, created_by: _c, created_at: _a, ...patch } = payload;
            const { error: updErr } = await supabase
              .from('temparios_mantenimiento')
              .update(patch)
              .eq('legacy_id', row.legacy_id);
            if (updErr) {
              errors.push({ row: row.legacy_id ?? 0, message: updErr.message });
            } else {
              ok += 1;
              updated += 1;
            }
          } else {
            const { error: insErr } = await supabase
              .from('temparios_mantenimiento')
              .insert(payload);
            if (insErr) {
              errors.push({ row: row.legacy_id ?? 0, message: insErr.message });
            } else {
              ok += 1;
            }
          }
        } else {
          ok += 1;
          if (existingSet.has(row.legacy_id as number)) updated += 1;
        }
        processed += 1;
      }
    } else {
      const batchUpdated = batch.filter((r) => existingSet.has(r.legacy_id as number)).length;
      ok += batch.length;
      updated += batchUpdated;
      processed += batch.length;
    }

    report();
  }

  // ── Sin ID: insert por lotes ──
  for (const batch of chunkArray(withoutLegacy, BATCH_SIZE)) {
    await refreshSessionIfNeeded();
    const payloads = batch.map((row) => {
      const p = toDbPayload(row, updatedBy, importBatchId);
      delete p.legacy_id;
      return p;
    });

    const { error } = await supabase.from('temparios_mantenimiento').insert(payloads);
    if (error) {
      for (const payload of payloads) {
        const { error: rowErr } = await supabase.from('temparios_mantenimiento').insert(payload);
        if (rowErr) {
          errors.push({ row: 0, message: rowErr.message });
        } else {
          ok += 1;
        }
        processed += 1;
      }
    } else {
      ok += batch.length;
      processed += batch.length;
    }
    report();
  }

  return { ok, updated, errors };
}

/**
 * Importación completa de temparios desde Excel/CSV en el frontend.
 */
export async function importTempariosFromFile(
  file: File,
  createdBy = 'admin',
  onProgress?: (p: TemparioImportProgress) => void
): Promise<ImportExcelResponse> {
  onProgress?.({ phase: 'parse', processed: 0, total: 0, ok: 0, updated: 0, errors: 0 });

  const parsed = await parseTemparioFile(file, createdBy);
  const parsedTotal = parsed.rows.length + parsed.errors.length;

  if (parsed.rows.length === 0 && parsed.errors.length > 0) {
    return {
      recordsOk: 0,
      recordsError: parsed.errors.length,
      duplicates: 0,
      total: parsedTotal,
      errors: parsed.errors.slice(0, MAX_ERROR_SAMPLES),
      error: parsed.errors[0]?.message,
    };
  }

  if (parsed.rows.length === 0) {
    return {
      recordsOk: 0,
      recordsError: 0,
      duplicates: 0,
      total: 0,
      error: 'El archivo no contiene filas de datos',
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      recordsOk: parsed.rows.length,
      recordsError: parsed.errors.length,
      duplicates: 0,
      total: parsedTotal,
      errors: parsed.errors.slice(0, MAX_ERROR_SAMPLES),
    };
  }

  await refreshSessionIfNeeded();

  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: importLog } = await supabase
    .from('importaciones')
    .insert({
      modulo: 'calculadora',
      nombre_archivo: file.name,
      tipo_archivo: file.name.split('.').pop() ?? 'xlsx',
      registros_ok: 0,
      registros_error: parsed.errors.length,
      user_id: session?.user.id ?? null,
      estado: 'procesando',
    })
    .select('id')
    .maybeSingle();

  const importBatchId = (importLog?.id as string | undefined) ?? null;

  onProgress?.({
    phase: 'upload',
    processed: 0,
    total: parsed.rows.length,
    ok: 0,
    updated: 0,
    errors: parsed.errors.length,
  });

  const result = await upsertTemparioBatch(
    parsed.rows,
    createdBy,
    importBatchId,
    onProgress
  );
  const recordsOk = result.ok;
  const recordsError = parsed.errors.length + result.errors.length;
  const allErrors = [...parsed.errors, ...result.errors].slice(0, MAX_ERROR_SAMPLES);

  onProgress?.({
    phase: 'done',
    processed: parsed.rows.length,
    total: parsed.rows.length,
    ok: recordsOk,
    updated: result.updated,
    errors: recordsError,
  });

  if (importBatchId) {
    try {
      await supabase
        .from('importaciones')
        .update({
          registros_total: parsedTotal,
          registros_ok: recordsOk,
          registros_error: recordsError,
          duplicados: result.updated,
          estado: resolveImportEstado(recordsOk, recordsError),
          errores_json: allErrors,
          completed_at: new Date().toISOString(),
        })
        .eq('id', importBatchId);
    } catch {
      // no bloquear
    }
  }

  return {
    recordsOk,
    recordsError,
    duplicates: result.updated,
    total: parsedTotal,
    errors: allErrors,
  };
}
