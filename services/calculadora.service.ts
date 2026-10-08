import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type {
  TemparioMantenimiento,
  TemparioUpdatePatch,
  PreventiveQuoteInput,
  PreventiveQuoteResult,
} from '@/types/database';
import { buildPreventiveQuote, normalizeEquipKey } from '@/lib/calculadora/build-quote';
import { resolveModelo2 } from '@/lib/calculadora/tempario-classify';
import {
  MOCK_TEMPARIOS,
  getMockMarcas,
  getMockModelos,
} from '@/lib/mock-temparios';

/** Copia mutable para modo demo (sin Supabase) */
let mockStore: TemparioMantenimiento[] = MOCK_TEMPARIOS.map((t) => ({ ...t }));

function mapTemparioRow(row: Record<string, unknown>): TemparioMantenimiento {
  const item = String(row.item ?? '');
  return {
    id: String(row.id),
    legacy_id: row.legacy_id as number | null,
    marca: String(row.marca ?? '').trim(),
    linea: row.linea as string | null,
    modelo: String(row.modelo ?? '').trim(),
    tipo_item: resolveModelo2(String(row.tipo_item ?? row.modelo2 ?? 'Repuesto')),
    item,
    unidad_medida: String(row.unidad_medida ?? 'Unidad'),
    cantidad: Number(row.cantidad ?? 1),
    frecuencia_horas: Number(row.frecuencia_horas) as TemparioMantenimiento['frecuencia_horas'],
    aceite_homologado: row.aceite_homologado as string | null,
    referencia_genuina: row.referencia_genuina as string | null,
    ref_sap_dispel: row.ref_sap_dispel as string | null,
    ref_sap_original: row.ref_sap_original as string | null,
    referencia_stal: row.referencia_stal as string | null,
    referencia_fleetguard: row.referencia_fleetguard as string | null,
    referencia_donaldson: row.referencia_donaldson as string | null,
    tiempo_horas: Number(row.tiempo_horas ?? 0),
    procedimiento: row.procedimiento as string | null,
    avisos_claves: row.avisos_claves as string | null,
    tipo_catalogo: (row.tipo_catalogo as string) ?? null,
    precio_unitario: Number(row.precio_unitario ?? 0),
    tarifa_mano_obra_h: Number(row.tarifa_mano_obra_h ?? 110000),
    activo: Boolean(row.activo ?? true),
    created_at: (row.created_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    updated_by: (row.updated_by as string) ?? null,
  };
}

function escapeIlike(value: string): string {
  return value.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface TempariosAdminQuery {
  marca?: string;
  modelo?: string;
  tipo?: string;
  search?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface TempariosAdminResult {
  rows: TemparioMantenimiento[];
  total: number;
}

function sortEs(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, 'es'));
}

export async function fetchMarcas(): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return getMockMarcas();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('v_temparios_marcas').select('marca');

  if (!error && data?.length) {
    return sortEs(
      Array.from(new Set(data.map((r) => String(r.marca).trim()).filter(Boolean)))
    );
  }

  // Fallback si la vista aún no existe: distinct vía tabla (paginado)
  const marcas = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data: page, error: pageErr } = await supabase
      .from('temparios_mantenimiento')
      .select('marca')
      .eq('activo', true)
      .range(from, from + pageSize - 1);

    if (pageErr) {
      return getMockMarcas();
    }
    if (!page?.length) break;
    page.forEach((r) => {
      const m = String(r.marca ?? '').trim();
      if (m) marcas.add(m);
    });
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return sortEs(Array.from(marcas));
}

export async function fetchModelos(marca: string): Promise<string[]> {
  const scopedMarca = marca?.trim() && marca !== 'all' ? marca.trim() : '';

  if (!isSupabaseConfigured()) {
    if (!scopedMarca) {
      return sortEs(
        Array.from(
          new Set(
            mockStore
              .filter((t) => t.activo)
              .map((t) => t.modelo.trim())
              .filter(Boolean)
          )
        )
      );
    }
    return getMockModelos(scopedMarca);
  }

  const supabase = getSupabaseClient();
  const fromView = new Set<string>();
  const viewPageSize = 1000;
  let viewFrom = 0;
  let viewFailed = false;
  for (;;) {
    let viewQuery = supabase.from('v_temparios_modelos').select('modelo');
    if (scopedMarca) {
      viewQuery = viewQuery.eq('marca', scopedMarca);
    }
    const { data, error } = await viewQuery.range(viewFrom, viewFrom + viewPageSize - 1);
    if (error) {
      viewFailed = true;
      break;
    }
    if (!data?.length) break;
    data.forEach((row) => {
      const modelo = String(row.modelo ?? '').trim();
      if (modelo) fromView.add(modelo);
    });
    if (data.length < viewPageSize) break;
    viewFrom += viewPageSize;
  }

  if (!viewFailed) {
    return sortEs(Array.from(fromView));
  }

  const modelos = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let pageQuery = supabase
      .from('temparios_mantenimiento')
      .select('modelo')
      .eq('activo', true);
    if (scopedMarca) {
      pageQuery = pageQuery.eq('marca', scopedMarca);
    }
    const { data: page, error: pageErr } = await pageQuery.range(from, from + pageSize - 1);

    if (pageErr) {
      return getMockModelos(marca);
    }
    if (!page?.length) break;
    page.forEach((r) => {
      const m = String(r.modelo ?? '').trim();
      if (m) modelos.add(m);
    });
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return sortEs(Array.from(modelos));
}

export async function fetchTiposItem(): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return sortEs(
      Array.from(new Set(mockStore.filter((t) => t.activo).map((t) => t.tipo_item)))
    );
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('v_temparios_tipos').select('tipo_item');

  if (!error && data?.length) {
    return sortEs(
      Array.from(new Set(data.map((r) => String(r.tipo_item).trim()).filter(Boolean)))
    );
  }

  const tipos = new Set<string>();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data: page, error: pageErr } = await supabase
      .from('temparios_mantenimiento')
      .select('tipo_item')
      .eq('activo', true)
      .range(from, from + pageSize - 1);

    if (pageErr) break;
    if (!page?.length) break;
    page.forEach((r) => {
      const t = String(r.tipo_item ?? '').trim();
      if (t) tipos.add(t);
    });
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return sortEs(Array.from(tipos));
}

export async function fetchTemparios(marca: string, modelo: string): Promise<TemparioMantenimiento[]> {
  if (!marca?.trim() || !modelo?.trim()) return [];

  if (!isSupabaseConfigured()) {
    return mockStore.filter(
      (t) =>
        t.activo &&
        normalizeEquipKey(t.marca) === normalizeEquipKey(marca) &&
        normalizeEquipKey(t.modelo) === normalizeEquipKey(modelo)
    );
  }

  const supabase = getSupabaseClient();
  const pageSize = 1000;
  const rows: TemparioMantenimiento[] = [];
  let from = 0;
  const marcaPattern = escapeIlike(marca);
  const modeloPattern = escapeIlike(modelo);

  // No filtrar solo activo=true: filas con activo NULL quedarían ocultas
  for (;;) {
    const { data, error } = await supabase
      .from('temparios_mantenimiento')
      .select('*')
      .ilike('marca', marcaPattern)
      .ilike('modelo', modeloPattern)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message || 'No se pudieron cargar temparios');
    }
    if (!data?.length) break;
    rows.push(...data.map(mapTemparioRow));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Refinar en cliente (espacios / guiones en modelo) + excluir inactivos explícitos
  return rows.filter(
    (t) =>
      t.activo !== false &&
      normalizeEquipKey(t.marca) === normalizeEquipKey(marca) &&
      normalizeEquipKey(t.modelo) === normalizeEquipKey(modelo)
  );
}

function filterMockAdmin(query: TempariosAdminQuery): TemparioMantenimiento[] {
  const search = (query.search ?? '').trim().toLowerCase();
  return mockStore.filter((t) => {
    if (!query.includeInactive && !t.activo) return false;
    if (query.marca && query.marca !== 'all' && t.marca.toLowerCase() !== query.marca.toLowerCase()) {
      return false;
    }
    if (
      query.modelo &&
      query.modelo !== 'all' &&
      t.modelo.toLowerCase() !== query.modelo.toLowerCase()
    ) {
      return false;
    }
    if (
      query.tipo &&
      query.tipo !== 'all' &&
      t.tipo_item.toLowerCase() !== query.tipo.toLowerCase()
    ) {
      return false;
    }
    if (!search) return true;
    return (
      t.item.toLowerCase().includes(search) ||
      t.marca.toLowerCase().includes(search) ||
      t.modelo.toLowerCase().includes(search) ||
      (t.referencia_genuina ?? '').toLowerCase().includes(search) ||
      (t.ref_sap_original ?? '').toLowerCase().includes(search) ||
      String(t.legacy_id ?? '').includes(search)
    );
  });
}

export async function fetchTempariosAdmin(
  query: TempariosAdminQuery = {}
): Promise<TempariosAdminResult> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(1000, Math.max(10, query.pageSize ?? 20));

  if (!isSupabaseConfigured()) {
    const filtered = filterMockAdmin(query);
    const start = (page - 1) * pageSize;
    return {
      rows: filtered.slice(start, start + pageSize),
      total: filtered.length,
    };
  }

  const supabase = getSupabaseClient();
  let q = supabase
    .from('temparios_mantenimiento')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false });

  if (!query.includeInactive) {
    q = q.eq('activo', true);
  }
  if (query.marca && query.marca !== 'all') {
    q = q.eq('marca', query.marca);
  }
  if (query.modelo && query.modelo !== 'all') {
    q = q.eq('modelo', query.modelo);
  }
  if (query.tipo && query.tipo !== 'all') {
    q = q.eq('tipo_item', query.tipo);
  }
  if (query.search?.trim()) {
    const s = escapeIlike(query.search);
    q = q.or(
      [
        `item.ilike.%${s}%`,
        `modelo.ilike.%${s}%`,
        `referencia_genuina.ilike.%${s}%`,
        `ref_sap_original.ilike.%${s}%`,
        `ref_sap_dispel.ilike.%${s}%`,
      ].join(',')
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await q.range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []).map(mapTemparioRow),
    total: count ?? 0,
  };
}

/** Todos los temparios que coinciden con el filtro de administración (sin paginar la UI). */
export async function fetchAllTempariosAdmin(
  query: Omit<TempariosAdminQuery, 'page' | 'pageSize'> = {}
): Promise<TemparioMantenimiento[]> {
  const pageSize = 1000;
  const collected: TemparioMantenimiento[] = [];
  let page = 1;

  for (;;) {
    const result = await fetchTempariosAdmin({ ...query, page, pageSize });
    collected.push(...result.rows);
    if (result.rows.length === 0 || collected.length >= result.total) break;
    page += 1;
    if (page > 40) break;
  }

  return collected;
}

export async function updateTempario(
  id: string,
  patch: TemparioUpdatePatch,
  updatedBy = 'admin'
): Promise<TemparioMantenimiento> {
  const payload = {
    ...patch,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const idx = mockStore.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error('Registro no encontrado');
    mockStore[idx] = { ...mockStore[idx], ...payload };
    return mockStore[idx];
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('temparios_mantenimiento')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapTemparioRow(data);
}

export async function deactivateTempario(
  id: string,
  updatedBy = 'admin'
): Promise<void> {
  await updateTempario(id, { activo: false }, updatedBy);
}

const BULK_UPDATE_CHUNK = 80;

/** Aplica el mismo parche a varios temparios. Solo deben enviarse campos a cambiar. */
export async function updateTempariosBulk(
  ids: string[],
  patch: TemparioUpdatePatch,
  updatedBy = 'admin'
): Promise<number> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;

  const payload = {
    ...patch,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    let updated = 0;
    for (const id of uniqueIds) {
      const idx = mockStore.findIndex((t) => t.id === id);
      if (idx < 0) continue;
      mockStore[idx] = { ...mockStore[idx], ...payload };
      updated += 1;
    }
    return updated;
  }

  const supabase = getSupabaseClient();
  let updated = 0;
  for (let offset = 0; offset < uniqueIds.length; offset += BULK_UPDATE_CHUNK) {
    const chunk = uniqueIds.slice(offset, offset + BULK_UPDATE_CHUNK);
    const { data, error } = await supabase
      .from('temparios_mantenimiento')
      .update(payload)
      .in('id', chunk)
      .select('id');
    if (error) throw new Error(error.message);
    updated += data?.length ?? 0;
  }
  return updated;
}

export async function calculatePreventiveMaintenance(
  input: PreventiveQuoteInput
): Promise<PreventiveQuoteResult> {
  const temparios = await fetchTemparios(input.marca, input.modelo);
  return buildPreventiveQuote(input, temparios);
}

export async function registerTemparioImport(
  fileName: string,
  recordsOk: number,
  recordsError: number
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseClient();
  await supabase.from('importaciones').insert({
    modulo: 'calculadora',
    nombre_archivo: fileName,
    tipo_archivo: fileName.split('.').pop() ?? 'xlsx',
    registros_total: recordsOk + recordsError,
    registros_ok: recordsOk,
    registros_error: recordsError,
    estado: recordsError > 0 ? 'parcial' : 'completado',
    completed_at: new Date().toISOString(),
  });
}
