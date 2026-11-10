import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { pickLatestTelemetriaPerSerie, fetchTelemetriaEquipos } from '@/services/projected-maintenance.service';
import { buildLccAlertas, topCountBy } from '@/lib/lcc/lcc-match';
import type { LccAlertaComponente, LccComponente } from '@/types/database';

function mapLccRow(row: Record<string, unknown>): LccComponente {
  return {
    id: String(row.id),
    clave: String(row.clave ?? ''),
    tipo_maquina: String(row.tipo_maquina ?? ''),
    modelo: String(row.modelo ?? ''),
    componente: String(row.componente ?? ''),
    horometro_horas: Number(row.horometro_horas) || 0,
    n_parte: (row.n_parte as string | null) ?? null,
    descripcion: (row.descripcion as string | null) ?? null,
    cantidad: row.cantidad == null ? null : Number(row.cantidad),
    grupo: (row.grupo as string | null) ?? null,
    activo: row.activo !== false,
    import_batch_id: (row.import_batch_id as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

export async function fetchLccCatalog(includeInactive = false): Promise<LccComponente[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabaseClient();
  const pageSize = 1000;
  const all: LccComponente[] = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from('lcc_componentes')
      .select('*')
      .order('tipo_maquina', { ascending: true })
      .order('modelo', { ascending: true })
      .range(from, from + pageSize - 1);

    if (!includeInactive) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || 'No se pudo cargar el catálogo LCC.');
    }
    if (!data?.length) break;
    all.push(...data.map((row) => mapLccRow(row as Record<string, unknown>)));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

export interface LccDashboardData {
  alertas: LccAlertaComponente[];
  catalogo: LccComponente[];
  maquinasActivas: number;
  topMaquinas: Array<{ name: string; total: number }>;
  topGrupos: Array<{ name: string; total: number }>;
  topComponentes: Array<{ name: string; total: number }>;
}

function isTelemetriaActiva(estado: string | null | undefined): boolean {
  const value = (estado ?? '').trim().toLowerCase();
  if (!value) return true;
  return !['inactivo', 'inactive', 'cancelado', 'anulado', 'baja'].includes(value);
}

export async function fetchLccDashboard(): Promise<LccDashboardData> {
  const [catalogo, telemetria] = await Promise.all([
    fetchLccCatalog(false),
    fetchTelemetriaEquipos(),
  ]);

  const maquinas = pickLatestTelemetriaPerSerie(telemetria).filter((m) =>
    isTelemetriaActiva(m.estado)
  );
  const alertas = buildLccAlertas(maquinas, catalogo);

  return {
    alertas,
    catalogo,
    maquinasActivas: maquinas.length,
    topMaquinas: topCountBy(alertas, (a) => `${a.serie} · ${a.modelo}`),
    topGrupos: topCountBy(alertas, (a) => a.grupo),
    topComponentes: topCountBy(alertas, (a) => a.componente),
  };
}

export async function countLccByImportBatch(batchId: string): Promise<number> {
  if (!isSupabaseConfigured() || !batchId) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('lcc_componentes')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteLccImportBatch(batchId: string): Promise<{ deleted: number }> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado');
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('lcc_componentes')
    .delete()
    .eq('import_batch_id', batchId)
    .select('id');
  if (error) throw new Error(error.message);

  await supabase
    .from('importaciones')
    .update({ estado: 'revertido' })
    .eq('id', batchId);

  return { deleted: data?.length ?? 0 };
}
