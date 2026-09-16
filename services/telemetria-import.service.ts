import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  parseTelemetriaFile,
  type TelemetriaMappedRow,
} from '@/lib/proyectados/telemetria-import';
import type { ImportExcelResponse, TelemetriaImportResumen } from '@/services/import.service';

/** Mismo tamaño de lote que temparios: evita saturar red/BD con ~5k filas. */
const BATCH_SIZE = 100;
const MAX_ERROR_SAMPLES = 40;
/** Pausa breve entre lotes para no saturar PostgREST. */
const BATCH_PAUSE_MS = 40;

export interface TelemetriaImportProgress {
  phase: 'parse' | 'relations' | 'upload' | 'done';
  processed: number;
  total: number;
  ok: number;
  updated: number;
  errors: number;
}

type ProgressCb = (p: TelemetriaImportProgress) => void;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function refreshSessionIfNeeded(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error(
      'Debe iniciar sesión con Supabase Auth (admin/coordinador) para importar telemetría.'
    );
  }
  const expiresAt = data.session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec < 120) {
    await supabase.auth.refreshSession();
  }
}

function asesorNombreFromEmail(email: string): string {
  const local = email.split('@')[0] || email;
  return local.replace(/[._]/g, ' ').trim() || email;
}

function clienteKey(row: Pick<TelemetriaMappedRow, 'nit' | 'titulo' | 'email'>): string | null {
  if (row.nit) return `nit:${row.nit}`;
  if (row.titulo?.trim()) return `titulo:${row.titulo.trim().toLowerCase()}`;
  if (row.email) return `email:${row.email.toLowerCase()}`;
  return null;
}

function buildLatestRowBySerie(rows: TelemetriaMappedRow[]): Map<string, TelemetriaMappedRow> {
  const bySerie = new Map<string, TelemetriaMappedRow>();
  for (const row of rows) {
    bySerie.set(row.serie, row);
  }
  return bySerie;
}

function resolveRowIds(
  row: TelemetriaMappedRow,
  maps: {
    clienteIds: Map<string, string>;
    asesorIds: Map<string, string>;
    sedeIds: Map<string, string>;
    maquinaIds: Map<string, string>;
    importBatchId: string | null;
  }
) {
  const ck = clienteKey(row);
  return {
    clienteId: ck ? maps.clienteIds.get(ck) ?? null : null,
    asesorId: row.asesor_email
      ? maps.asesorIds.get(row.asesor_email.toLowerCase()) ?? null
      : null,
    sedeId: row.sede ? maps.sedeIds.get(row.sede) ?? null : null,
    maquinaId: maps.maquinaIds.get(row.serie) ?? null,
    importBatchId: maps.importBatchId,
  };
}

/** Campos de máquina/cliente/asesor/ubicación que se propagan a todo el historial de la serie. */
function toMachineSnapshotPayload(
  row: TelemetriaMappedRow,
  ids: ReturnType<typeof resolveRowIds>
): Record<string, unknown> {
  return {
    titulo: row.titulo,
    email: row.email,
    nit: row.nit,
    telefono: row.telefono,
    ciudad: row.ciudad,
    latitud: row.latitud,
    longitud: row.longitud,
    ultima_fecha_comunicacion: row.ultima_fecha_comunicacion,
    sede: row.sede,
    asesor_email: row.asesor_email,
    asesor_secundario_email: row.asesor_secundario_email,
    marca: row.marca,
    modelo: row.modelo,
    numero_serie: row.numero_serie,
    tipo_maquina: row.tipo_maquina,
    cliente_id: ids.clienteId,
    asesor_id: ids.asesorId,
    sede_id: ids.sedeId,
    maquina_id: ids.maquinaId,
    updated_at: new Date().toISOString(),
  };
}

function stripOptionalFks(body: Record<string, unknown>): Record<string, unknown> {
  const next = { ...body };
  delete next.sede_id;
  delete next.maquina_id;
  return next;
}

const MAX_CHANGE_SAMPLES = 15;

interface ExistingMachineState {
  serie: string;
  clienteId: string | null;
  sedeId: string | null;
  marca: string;
  modelo: string;
  asesorEmail: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  sedeNombre: string | null;
}

function normEmail(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  return v || null;
}

function normLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function coordsChanged(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  return Math.abs(a - b) > 0.000001;
}

async function prefetchExistingMachineState(
  rows: TelemetriaMappedRow[]
): Promise<Map<string, ExistingMachineState>> {
  const supabase = getSupabaseClient();
  const series = Array.from(new Set(rows.map((row) => row.serie)));
  const bySerie = new Map<string, ExistingMachineState>();

  for (const batch of chunkArray(series, BATCH_SIZE)) {
    await refreshSessionIfNeeded();

    const [{ data: maquinas }, { data: telemetria }] = await Promise.all([
      supabase
        .from('maquinas')
        .select('serie, cliente_id, sede_id, marca, modelo')
        .in('serie', batch),
      supabase
        .from('telemetria_equipos')
        .select('serie, asesor_email, ciudad, latitud, longitud, sede, updated_at')
        .in('serie', batch)
        .order('updated_at', { ascending: false }),
    ]);

    for (const m of maquinas ?? []) {
      bySerie.set(String(m.serie), {
        serie: String(m.serie),
        clienteId: (m.cliente_id as string | null) ?? null,
        sedeId: (m.sede_id as string | null) ?? null,
        marca: String(m.marca ?? ''),
        modelo: String(m.modelo ?? ''),
        asesorEmail: null,
        ciudad: null,
        latitud: null,
        longitud: null,
        sedeNombre: null,
      });
    }

    for (const t of telemetria ?? []) {
      const serie = String(t.serie);
      const current = bySerie.get(serie);
      if (!current) continue;
      if (current.asesorEmail != null) continue;
      current.asesorEmail = (t.asesor_email as string | null) ?? null;
      current.ciudad = (t.ciudad as string | null) ?? null;
      current.latitud = t.latitud == null ? null : Number(t.latitud);
      current.longitud = t.longitud == null ? null : Number(t.longitud);
      current.sedeNombre = (t.sede as string | null) ?? null;
    }

    await sleep(BATCH_PAUSE_MS);
  }

  return bySerie;
}

function computeImportChangeSummary(
  rows: TelemetriaMappedRow[],
  existingBySerie: Map<string, ExistingMachineState>,
  clienteIds: Map<string, string>
): TelemetriaImportResumen {
  const bySerie = buildLatestRowBySerie(rows);
  let cambioCliente = 0;
  let cambioAsesor = 0;
  let cambioUbicacion = 0;
  const muestras: NonNullable<TelemetriaImportResumen['muestras']> = [];

  const pushSample = (
    serie: string,
    campo: 'cliente' | 'asesor' | 'ubicacion',
    antes: string,
    despues: string
  ) => {
    if (muestras.length >= MAX_CHANGE_SAMPLES) return;
    muestras.push({ serie, campo, antes, despues });
  };

  for (const [serie, row] of Array.from(bySerie.entries())) {
    const existing = existingBySerie.get(serie);
    if (!existing) continue;

    const ck = clienteKey(row);
    const newClienteId = ck ? clienteIds.get(ck) ?? null : null;
    if (existing.clienteId !== newClienteId) {
      cambioCliente += 1;
      pushSample(
        serie,
        'cliente',
        existing.clienteId ?? 'sin cliente',
        newClienteId ?? row.titulo ?? 'sin cliente'
      );
    }

    if (normEmail(existing.asesorEmail) !== normEmail(row.asesor_email)) {
      cambioAsesor += 1;
      pushSample(
        serie,
        'asesor',
        existing.asesorEmail ?? 'sin asesor',
        row.asesor_email ?? 'sin asesor'
      );
    }

    const ubicacionCambio =
      normLabel(existing.sedeNombre) !== normLabel(row.sede) ||
      normLabel(existing.ciudad) !== normLabel(row.ciudad) ||
      coordsChanged(existing.latitud, row.latitud) ||
      coordsChanged(existing.longitud, row.longitud);

    if (ubicacionCambio) {
      cambioUbicacion += 1;
      const antes = [existing.sedeNombre, existing.ciudad].filter(Boolean).join(' · ') || 'sin ubicación';
      const despues = [row.sede, row.ciudad].filter(Boolean).join(' · ') || 'sin ubicación';
      pushSample(serie, 'ubicacion', antes, despues);
    }
  }

  return {
    cambio_cliente: cambioCliente,
    cambio_asesor: cambioAsesor,
    cambio_ubicacion: cambioUbicacion,
    ...(muestras.length > 0 ? { muestras } : {}),
  };
}

function toTelemetriaPayload(
  row: TelemetriaMappedRow,
  ids: {
    clienteId: string | null;
    asesorId: string | null;
    sedeId: string | null;
    maquinaId: string | null;
    importBatchId: string | null;
  }
): Record<string, unknown> {
  return {
    titulo: row.titulo,
    email: row.email,
    nit: row.nit,
    telefono: row.telefono,
    serie: row.serie,
    modelo: row.modelo,
    horometro: row.horometro,
    promedio_h: row.promedio_h,
    ciudad: row.ciudad,
    ultima_fecha_comunicacion: row.ultima_fecha_comunicacion,
    latitud: row.latitud,
    longitud: row.longitud,
    dias_primer_mtto: row.dias_primer_mtto,
    proximo_primer_mtto: row.proximo_primer_mtto,
    dias_segundo_mtto: row.dias_segundo_mtto,
    proximo_segundo_mtto: row.proximo_segundo_mtto,
    dias_tercer_mtto: row.dias_tercer_mtto,
    proximo_tercer_mtto: row.proximo_tercer_mtto,
    fecha_primer_mtto: row.fecha_primer_mtto,
    fecha_segundo_mtto: row.fecha_segundo_mtto,
    fecha_tercer_mtto: row.fecha_tercer_mtto,
    distancia_bogota: row.distancia_bogota,
    distancia_medellin: row.distancia_medellin,
    distancia_barranquilla: row.distancia_barranquilla,
    distancia_monteria: row.distancia_monteria,
    distancia_cali: row.distancia_cali,
    distancia_bucaramanga: row.distancia_bucaramanga,
    distancia_ibague: row.distancia_ibague,
    distancia_istmina: row.distancia_istmina,
    distancia_caucasia: row.distancia_caucasia,
    distancia_villavicencio: row.distancia_villavicencio,
    distancia_minima: row.distancia_minima,
    sede: row.sede,
    asesor_email: row.asesor_email,
    asesor_secundario_email: row.asesor_secundario_email,
    marca: row.marca,
    tipo_mtto: row.tipo_mtto,
    numero_serie: row.numero_serie,
    tipo_oportunidad: row.tipo_oportunidad,
    estado: row.estado,
    estado2: row.estado2,
    detalle: row.detalle,
    observaciones: row.observaciones,
    reenviar_correo: row.reenviar_correo,
    mes_creado: row.mes_creado,
    correo_enviado: row.correo_enviado,
    anio: row.anio,
    tipo_maquina: row.tipo_maquina,
    cliente_id: ids.clienteId,
    asesor_id: ids.asesorId,
    sede_id: ids.sedeId,
    maquina_id: ids.maquinaId,
    import_batch_id: ids.importBatchId,
    created_by: row.created_by,
    updated_at: new Date().toISOString(),
  };
}

async function batchUpsertAsesores(
  rows: TelemetriaMappedRow[]
): Promise<Map<string, string>> {
  const supabase = getSupabaseClient();
  const byEmail = new Map<string, { email: string; sede: string | null }>();

  for (const row of rows) {
    // Solo Asesor2 (asesor_email) alimenta la tabla asesores / FK asesor_id
    if (row.asesor_email) {
      byEmail.set(row.asesor_email.toLowerCase(), {
        email: row.asesor_email,
        sede: row.sede,
      });
    }
  }

  const list = Array.from(byEmail.values());
  const idByEmail = new Map<string, string>();

  for (const batch of chunkArray(list, BATCH_SIZE)) {
    await refreshSessionIfNeeded();
    const payloads = batch.map((a) => ({
      email: a.email,
      nombre: asesorNombreFromEmail(a.email),
      sede: a.sede,
      activo: true,
    }));

    const { data, error } = await supabase
      .from('asesores')
      .upsert(payloads, { onConflict: 'email' })
      .select('id, email');

    if (error) {
      // Fallback fila a fila solo en el lote fallido
      for (const p of payloads) {
        const { data: one, error: oneErr } = await supabase
          .from('asesores')
          .upsert(p, { onConflict: 'email' })
          .select('id, email')
          .single();
        if (!oneErr && one) idByEmail.set(String(one.email).toLowerCase(), one.id as string);
      }
    } else {
      for (const row of data ?? []) {
        idByEmail.set(String(row.email).toLowerCase(), row.id as string);
      }
    }
    await sleep(BATCH_PAUSE_MS);
  }

  return idByEmail;
}

async function batchUpsertSedes(rows: TelemetriaMappedRow[]): Promise<Map<string, string>> {
  const supabase = getSupabaseClient();
  const nombres = Array.from(
    new Set(rows.map((r) => r.sede?.trim()).filter((s): s is string => Boolean(s)))
  );
  const idByNombre = new Map<string, string>();
  if (nombres.length === 0) return idByNombre;

  for (const batch of chunkArray(nombres, BATCH_SIZE)) {
    await refreshSessionIfNeeded();
    const payloads = batch.map((nombre) => ({
      nombre,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('sedes')
      .upsert(payloads, { onConflict: 'nombre' })
      .select('id, nombre');

    if (error) {
      // Tabla ausente (SQL 19) u otro error: no bloquear
      if (/sedes|relation|does not exist/i.test(error.message)) return idByNombre;
      for (const nombre of batch) {
        const { data: one } = await supabase
          .from('sedes')
          .upsert({ nombre, updated_at: new Date().toISOString() }, { onConflict: 'nombre' })
          .select('id, nombre')
          .maybeSingle();
        if (one?.id) idByNombre.set(String(one.nombre), one.id as string);
      }
    } else {
      for (const row of data ?? []) {
        idByNombre.set(String(row.nombre), row.id as string);
      }
    }
    await sleep(BATCH_PAUSE_MS);
  }

  return idByNombre;
}

async function batchResolveClientes(
  rows: TelemetriaMappedRow[]
): Promise<Map<string, string>> {
  const supabase = getSupabaseClient();
  const unique = new Map<string, TelemetriaMappedRow>();
  for (const row of rows) {
    const key = clienteKey(row);
    if (key && !unique.has(key)) unique.set(key, row);
  }

  const idByKey = new Map<string, string>();
  const entries = Array.from(unique.entries());
  if (entries.length === 0) return idByKey;

  const nits = entries
    .map(([, r]) => r.nit)
    .filter((n): n is string => Boolean(n));

  // Prefetch existentes por NIT
  for (const batch of chunkArray(nits, BATCH_SIZE)) {
    const { data } = await supabase.from('clientes').select('id, nit').in('nit', batch);
    for (const c of data ?? []) {
      if (c.nit) idByKey.set(`nit:${c.nit}`, c.id as string);
    }
  }

  // Prefetch por título (solo los que aún no tienen id)
  const missingTitles = entries
    .filter(([key, r]) => !idByKey.has(key) && r.titulo)
    .map(([, r]) => r.titulo as string);

  for (const batch of chunkArray(missingTitles, 50)) {
    const { data } = await supabase.from('clientes').select('id, titulo').in('titulo', batch);
    for (const c of data ?? []) {
      if (c.titulo) idByKey.set(`titulo:${String(c.titulo).toLowerCase()}`, c.id as string);
    }
  }

  // Insertar faltantes por lotes
  const toInsert: Array<{ key: string; payload: Record<string, unknown> }> = [];
  for (const [key, row] of entries) {
    if (idByKey.has(key)) continue;
    toInsert.push({
      key,
      payload: {
        titulo: row.titulo || row.nit || row.email || 'SIN NOMBRE',
        nit: row.nit,
        telefono: row.telefono,
        email: row.email,
        ciudad: row.ciudad,
        updated_at: new Date().toISOString(),
      },
    });
  }

  for (const batch of chunkArray(toInsert, BATCH_SIZE)) {
    await refreshSessionIfNeeded();
    const { data, error } = await supabase
      .from('clientes')
      .insert(batch.map((b) => b.payload))
      .select('id, nit, titulo, email');

    if (error) {
      for (const item of batch) {
        const { data: one, error: oneErr } = await supabase
          .from('clientes')
          .insert(item.payload)
          .select('id')
          .maybeSingle();
        if (!oneErr && one?.id) idByKey.set(item.key, one.id as string);
      }
    } else {
      for (let i = 0; i < (data ?? []).length; i++) {
        const row = data![i];
        const item = batch[i];
        if (item && row?.id) idByKey.set(item.key, row.id as string);
      }
      // Remap robusto por nit/titulo
      for (const row of data ?? []) {
        if (row.nit) idByKey.set(`nit:${row.nit}`, row.id as string);
        if (row.titulo) idByKey.set(`titulo:${String(row.titulo).toLowerCase()}`, row.id as string);
      }
    }
    await sleep(BATCH_PAUSE_MS);
  }

  // Actualizar datos de clientes ya existentes (por lotes de update individuales limitados)
  const toUpdate = entries.filter(([key]) => idByKey.has(key));
  for (const batch of chunkArray(toUpdate, BATCH_SIZE)) {
    await refreshSessionIfNeeded();
    await Promise.all(
      batch.map(async ([key, row]) => {
        const id = idByKey.get(key);
        if (!id) return;
        await supabase
          .from('clientes')
          .update({
            titulo: row.titulo || row.nit || row.email || 'SIN NOMBRE',
            nit: row.nit,
            telefono: row.telefono,
            email: row.email,
            ciudad: row.ciudad,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      })
    );
    await sleep(BATCH_PAUSE_MS);
  }

  return idByKey;
}

async function batchUpsertMaquinas(
  rows: TelemetriaMappedRow[],
  clienteIds: Map<string, string>,
  sedeIds: Map<string, string>
): Promise<Map<string, string>> {
  const supabase = getSupabaseClient();
  const bySerie = buildLatestRowBySerie(rows);

  const idBySerie = new Map<string, string>();
  const list = Array.from(bySerie.values());

  for (const batch of chunkArray(list, BATCH_SIZE)) {
    await refreshSessionIfNeeded();
    const payloads = batch.map((row) => {
      const ck = clienteKey(row);
      return {
        serie: row.serie,
        numero_serie: row.numero_serie ?? row.serie,
        marca: row.marca,
        modelo: row.modelo,
        tipo_maquina: row.tipo_maquina,
        cliente_id: ck ? clienteIds.get(ck) ?? null : null,
        sede_id: row.sede ? sedeIds.get(row.sede) ?? null : null,
        activo: true,
        updated_at: new Date().toISOString(),
      };
    });

    const { data, error } = await supabase
      .from('maquinas')
      .upsert(payloads, { onConflict: 'serie' })
      .select('id, serie');

    if (error) {
      if (/maquinas|relation|does not exist/i.test(error.message)) return idBySerie;
      for (const p of payloads) {
        const { data: one } = await supabase
          .from('maquinas')
          .upsert(p, { onConflict: 'serie' })
          .select('id, serie')
          .maybeSingle();
        if (one?.id) idBySerie.set(String(one.serie), one.id as string);
      }
    } else {
      for (const row of data ?? []) {
        idBySerie.set(String(row.serie), row.id as string);
      }
    }
    await sleep(BATCH_PAUSE_MS);
  }

  return idBySerie;
}

async function batchInsertTelemetria(
  rows: TelemetriaMappedRow[],
  maps: {
    clienteIds: Map<string, string>;
    asesorIds: Map<string, string>;
    sedeIds: Map<string, string>;
    maquinaIds: Map<string, string>;
    importBatchId: string | null;
  },
  onProgress?: ProgressCb
): Promise<{ ok: number; updated: number; errors: Array<{ row: number; message: string }> }> {
  const supabase = getSupabaseClient();
  let ok = 0;
  let processed = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const total = rows.length;

  const report = () => {
    onProgress?.({
      phase: 'upload',
      processed,
      total,
      ok,
      updated: 0,
      errors: errors.length,
    });
  };

  const formatRowError = (payload: Record<string, unknown>, message: string): string => {
    if (/idx_telemetria_oportunidad_uid|idx_telemetria_serie_periodo_tipo|telemetria_serie_mes_anio/i.test(message)) {
      return 'Ejecute en Supabase el script 27 (quita UNIQUE) y el 24 (varios MTTOs por mes).';
    }
    if (/numeric field overflow/i.test(message)) {
      return `Serie ${String(payload.serie)}: valor numérico fuera de rango (script 22_telemetria_widen_numerics.sql).`;
    }
    const tipoLabel =
      payload.tipo_mtto == null || payload.tipo_mtto === ''
        ? '—'
        : String(payload.tipo_mtto);
    return `Serie ${String(payload.serie)} (${payload.mes_creado}/${payload.anio}, tipo ${tipoLabel}): ${message}`;
  };

  for (const batch of chunkArray(rows, BATCH_SIZE)) {
    await refreshSessionIfNeeded();

    const payloads = batch.map((row) => {
      const ids = resolveRowIds(row, maps);
      return toTelemetriaPayload(row, {
        clienteId: ids.clienteId,
        asesorId: ids.asesorId,
        sedeId: ids.sedeId,
        maquinaId: ids.maquinaId,
        importBatchId: ids.importBatchId,
      });
    });

    let { error } = await supabase.from('telemetria_equipos').insert(payloads);
    if (error && /sede_id|maquina_id|column/i.test(error.message)) {
      ({ error } = await supabase.from('telemetria_equipos').insert(payloads.map(stripOptionalFks)));
    }

    if (error) {
      for (const payload of payloads) {
        const { error: rowErr } = await supabase
          .from('telemetria_equipos')
          .insert(stripOptionalFks(payload));
        if (rowErr) {
          errors.push({ row: 0, message: formatRowError(payload, rowErr.message) });
        } else {
          ok += 1;
        }
      }
    } else {
      ok += batch.length;
    }

    processed += batch.length;
    report();
    await sleep(BATCH_PAUSE_MS);
  }

  return { ok, updated: 0, errors };
}

/** Propaga cliente, asesor, ubicación y datos de máquina a todo el historial de cada serie importada. */
async function batchSyncTelemetriaMachineSnapshots(
  rows: TelemetriaMappedRow[],
  maps: {
    clienteIds: Map<string, string>;
    asesorIds: Map<string, string>;
    sedeIds: Map<string, string>;
    maquinaIds: Map<string, string>;
    importBatchId: string | null;
  }
): Promise<number> {
  const supabase = getSupabaseClient();
  const bySerie = buildLatestRowBySerie(rows);
  const entries = Array.from(bySerie.entries());
  let synced = 0;

  for (const batch of chunkArray(entries, 50)) {
    await refreshSessionIfNeeded();
    await Promise.all(
      batch.map(async ([serie, row]) => {
        const ids = resolveRowIds(row, maps);
        let payload = toMachineSnapshotPayload(row, ids);
        let { error } = await supabase.from('telemetria_equipos').update(payload).eq('serie', serie);
        if (error && /sede_id|maquina_id|column/i.test(error.message)) {
          payload = stripOptionalFks(payload);
          ({ error } = await supabase.from('telemetria_equipos').update(payload).eq('serie', serie));
        }
        if (!error) synced += 1;
      })
    );
    await sleep(BATCH_PAUSE_MS);
  }

  return synced;
}

/**
 * Carga masiva de telemetría (aditiva):
 * - 1.ª carga: histórico completo (~5k) desde la app anterior
 * - Cargas mensuales: ~300 filas nuevas → se INSERTAN; el historial crece (5153 + 300 + …)
 * - clientes / asesores / sedes / máquinas → upsert (sin duplicar maestros)
 * - Si en la carga nueva cambia cliente/asesor/ubicación → sincroniza historial de esa serie
 *
 * Nunca truncar telemetría en cargas mensuales. Script 28 solo recuperación puntual.
 */
export async function importTelemetriaFromFile(
  file: File,
  createdBy: string,
  onProgress?: ProgressCb
): Promise<ImportExcelResponse> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado');
  }

  await refreshSessionIfNeeded();

  onProgress?.({
    phase: 'parse',
    processed: 0,
    total: 0,
    ok: 0,
    updated: 0,
    errors: 0,
  });

  const parsed = await parseTelemetriaFile(file);
  const rows = parsed.rows.map((r) => ({ ...r, created_by: createdBy || r.created_by }));
  const parseErrors = [...parsed.errors];

  if (rows.length === 0) {
    return {
      recordsOk: 0,
      recordsError: parseErrors.length,
      duplicates: 0,
      total: parsed.rawTotal,
      skipped: parsed.skipped,
      deduplicated: 0,
      errors: parseErrors.slice(0, MAX_ERROR_SAMPLES),
      error: parseErrors[0]?.message ?? 'El archivo no contiene filas de datos',
    };
  }

  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: importLog } = await supabase
    .from('importaciones')
    .insert({
      modulo: 'proyectados',
      nombre_archivo: file.name,
      tipo_archivo: file.name.split('.').pop() ?? 'xlsx',
      registros_ok: 0,
      registros_error: parseErrors.length,
      user_id: user?.id ?? null,
      estado: 'procesando',
    })
    .select('id')
    .maybeSingle();

  const importBatchId = (importLog?.id as string | undefined) ?? null;

  onProgress?.({
    phase: 'relations',
    processed: 0,
    total: rows.length,
    ok: 0,
    updated: 0,
    errors: parseErrors.length,
  });

  const existingMachineState = await prefetchExistingMachineState(rows);

  const asesorIds = await batchUpsertAsesores(rows);
  const sedeIds = await batchUpsertSedes(rows);
  const clienteIds = await batchResolveClientes(rows);
  const changeSummary = computeImportChangeSummary(rows, existingMachineState, clienteIds);
  const maquinaIds = await batchUpsertMaquinas(rows, clienteIds, sedeIds);
  const relationMaps = { clienteIds, asesorIds, sedeIds, maquinaIds, importBatchId };

  onProgress?.({
    phase: 'upload',
    processed: 0,
    total: rows.length,
    ok: 0,
    updated: 0,
    errors: parseErrors.length,
  });

  const result = await batchInsertTelemetria(rows, relationMaps, onProgress);
  const syncedMachines = await batchSyncTelemetriaMachineSnapshots(rows, relationMaps);

  const recordsOk = result.ok;
  const recordsError = parseErrors.length + result.errors.length;
  const allErrors = [...parseErrors, ...result.errors].slice(0, MAX_ERROR_SAMPLES);

  const resumen: TelemetriaImportResumen = {
    ...changeSummary,
    maquinas_sincronizadas: syncedMachines,
    proyecciones_nuevas: result.ok,
    proyecciones_actualizadas: 0,
  };

  if (importBatchId) {
    await supabase
      .from('importaciones')
      .update({
        registros_ok: recordsOk,
        registros_error: recordsError,
        registros_total: parsed.rawTotal,
        duplicados: 0,
        resumen_json: resumen,
        completed_at: new Date().toISOString(),
        estado:
          recordsError > 0 && recordsOk === 0
            ? 'fallido'
            : recordsError > 0
              ? 'parcial'
              : 'completado',
      })
      .eq('id', importBatchId);
  }

  onProgress?.({
    phase: 'done',
    processed: rows.length,
    total: rows.length,
    ok: recordsOk,
    updated: 0,
    errors: recordsError,
  });

  return {
    recordsOk,
    recordsError,
    duplicates: 0,
    total: parsed.rawTotal,
    skipped: parsed.skipped,
    deduplicated: syncedMachines,
    resumen,
    errors: allErrors,
  };
}
