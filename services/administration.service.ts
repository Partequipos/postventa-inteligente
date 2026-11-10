import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { mapDbRoleToApp, mapAppRoleToDb } from '@/lib/supabase/auth';
import type { UserRole } from '@/lib/mock-data';
import {
  cloneDefaultModuleAccess,
  enforceAdministratorFullAccess,
  normalizeModuleAccessMatrix,
  type ModuleAccessMatrix,
} from '@/lib/admin/module-access';
import type { TelemetriaImportResumen } from '@/services/import.service';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  dbRole: string;
  status: 'active' | 'inactive';
  lastLogin: string;
  avatar: string;
  sede: string | null;
  /** Si el email coincide con tabla asesores (telemetría). */
  linkedAsesorId: string | null;
  clientesRelacionados: number;
  equiposRelacionados: number;
}

export interface AdminClienteRow {
  id: string;
  titulo: string;
  nit: string | null;
  email: string | null;
  telefono: string | null;
  ciudad: string | null;
  equipos: number;
}

export interface AdminMaquinaRow {
  id: string;
  serie: string;
  marca: string;
  modelo: string;
  tipo_maquina: string | null;
  cliente: string | null;
  cliente_id: string | null;
  sede: string | null;
  sede_id: string | null;
  activo: boolean;
}

/** Relación equipo → cliente → asesor (vista unificada para administración). */
export interface AdminEquipoRelacionRow {
  id: string;
  serie: string;
  marca: string;
  modelo: string;
  cliente_id: string | null;
  cliente_titulo: string | null;
  cliente_nit: string | null;
  asesor_id: string | null;
  asesor_nombre: string | null;
  asesor_email: string | null;
  sede: string | null;
  telemetria_registros: number;
}

export interface AdminEquipoRelacionPage {
  rows: AdminEquipoRelacionRow[];
  total: number;
}

export interface AdminEquipoRelacionUpdateInput {
  maquinaId: string;
  serie: string;
  clienteId?: string | null;
  asesorId?: string | null;
}

export interface AdminSelectOption {
  id: string;
  label: string;
  sublabel?: string | null;
}

export interface AdminSedeOption {
  id: string;
  nombre: string;
}

export interface AsesorInput {
  nombre: string;
  email: string;
  sede?: string | null;
  activo?: boolean;
}

export interface ClienteInput {
  titulo: string;
  nit?: string | null;
  email?: string | null;
  telefono?: string | null;
  ciudad?: string | null;
}

export interface MaquinaInput {
  serie: string;
  marca: string;
  modelo: string;
  tipo_maquina?: string | null;
  cliente_id?: string | null;
  sede_id?: string | null;
  activo?: boolean;
}

export interface AdminAsesorRow {
  id: string;
  nombre: string;
  email: string;
  sede: string | null;
  activo: boolean;
  clientes: number;
  equipos: number;
  oportunidades: number;
}

export interface AdminImportRow {
  /** UUID corto solo para visualización. */
  id: string;
  /** UUID completo de importaciones (acciones de lote). */
  batchId: string;
  modulo: string;
  typeLabel: string;
  file: string;
  rows: number;
  status: 'success' | 'error' | 'warning' | 'processing' | 'reverted';
  date: string;
  user: string;
  /** Proyecciones actualizadas (mismo periodo/MTTO). */
  proyeccionesActualizadas?: number;
  /** Resumen de cambios detectados en la carga (telemetría). */
  resumen?: TelemetriaImportResumen;
}

export interface AdminDomainSummary {
  clientes: number;
  asesores: number;
  maquinas: number;
  telemetria: number;
  usuarios: number;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}

function moduloToTypeLabel(modulo: string): string {
  switch (modulo) {
    case 'proyectados':
      return 'Cronograma / Telemetría';
    case 'calculadora':
      return 'Temparios';
    case 'lcc':
      return 'LCC';
    case 'cpp':
      return 'Repuestos CPP';
    default:
      return modulo;
  }
}

function parseTelemetriaResumen(raw: unknown): TelemetriaImportResumen | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const resumen: TelemetriaImportResumen = {};
  if (typeof o.maquinas_sincronizadas === 'number') {
    resumen.maquinas_sincronizadas = o.maquinas_sincronizadas;
  }
  if (typeof o.proyecciones_nuevas === 'number') {
    resumen.proyecciones_nuevas = o.proyecciones_nuevas;
  }
  if (typeof o.proyecciones_actualizadas === 'number') {
    resumen.proyecciones_actualizadas = o.proyecciones_actualizadas;
  }
  if (typeof o.cambio_cliente === 'number') resumen.cambio_cliente = o.cambio_cliente;
  if (typeof o.cambio_asesor === 'number') resumen.cambio_asesor = o.cambio_asesor;
  if (typeof o.cambio_ubicacion === 'number') resumen.cambio_ubicacion = o.cambio_ubicacion;
  if (Array.isArray(o.muestras)) {
    resumen.muestras = o.muestras
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
      .map((m) => ({
        serie: String(m.serie ?? ''),
        campo: (m.campo === 'cliente' || m.campo === 'asesor' || m.campo === 'ubicacion'
          ? m.campo
          : 'cliente') as 'cliente' | 'asesor' | 'ubicacion',
        antes: String(m.antes ?? '—'),
        despues: String(m.despues ?? '—'),
      }))
      .filter((m) => m.serie.length > 0);
  }
  return Object.keys(resumen).length > 0 ? resumen : undefined;
}

function mapImportEstado(estado: string): AdminImportRow['status'] {
  switch (estado) {
    case 'completado':
    case 'ok':
      return 'success';
    case 'parcial':
      return 'warning';
    case 'procesando':
      return 'processing';
    case 'revertido':
      return 'reverted';
    default:
      return 'error';
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export async function fetchAdminDomainSummary(): Promise<AdminDomainSummary> {
  if (!isSupabaseConfigured()) {
    return { clientes: 0, asesores: 0, maquinas: 0, telemetria: 0, usuarios: 0 };
  }
  const supabase = getSupabaseClient();

  const [clientes, asesores, maquinas, telemetria, usuarios] = await Promise.all([
    supabase.from('clientes').select('id', { count: 'exact', head: true }),
    supabase.from('asesores').select('id', { count: 'exact', head: true }),
    supabase.from('maquinas').select('id', { count: 'exact', head: true }),
    supabase.from('telemetria_equipos').select('id', { count: 'exact', head: true }),
    supabase.from('perfiles').select('id', { count: 'exact', head: true }),
  ]);

  return {
    clientes: clientes.count ?? 0,
    asesores: asesores.count ?? 0,
    maquinas: maquinas.count ?? 0,
    telemetria: telemetria.count ?? 0,
    usuarios: usuarios.count ?? 0,
  };
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabaseClient();
  type PerfilAdminRow = {
    id: string;
    email: string;
    nombre: string;
    rol: string;
    sede: string | null;
    activo: boolean;
    updated_at: string;
    created_at: string;
    ultimo_acceso?: string | null;
  };

  let perfiles: PerfilAdminRow[] | null = null;
  const first = await supabase
    .from('perfiles')
    .select('id, email, nombre, rol, sede, activo, updated_at, created_at, ultimo_acceso')
    .order('nombre');

  if (first.error && /ultimo_acceso/i.test(first.error.message)) {
    const fallback = await supabase
      .from('perfiles')
      .select('id, email, nombre, rol, sede, activo, updated_at, created_at')
      .order('nombre');
    if (fallback.error) throw new Error(fallback.error.message);
    perfiles = (fallback.data ?? []) as PerfilAdminRow[];
  } else if (first.error) {
    throw new Error(first.error.message);
  } else {
    perfiles = (first.data ?? []) as PerfilAdminRow[];
  }

  const { data: asesores } = await supabase.from('asesores').select('id, email');
  const asesorByEmail = new Map(
    (asesores ?? []).map((a) => [String(a.email).toLowerCase(), a.id as string])
  );

  const { data: telemetria } = await supabase
    .from('telemetria_equipos')
    .select('asesor_email, cliente_id, serie');

  const clientesByAsesor = new Map<string, Set<string>>();
  const equiposByAsesor = new Map<string, Set<string>>();

  for (const t of telemetria ?? []) {
    const email = String(t.asesor_email ?? '').toLowerCase();
    if (!email) continue;
    if (!clientesByAsesor.has(email)) clientesByAsesor.set(email, new Set());
    if (!equiposByAsesor.has(email)) equiposByAsesor.set(email, new Set());
    if (t.cliente_id) clientesByAsesor.get(email)!.add(String(t.cliente_id));
    if (t.serie) equiposByAsesor.get(email)!.add(String(t.serie));
  }

  return (perfiles ?? []).map((p) => {
    const email = String(p.email ?? '').toLowerCase();
    const role = mapDbRoleToApp(p.rol);
    return {
      id: p.id as string,
      name: String(p.nombre ?? email),
      email: String(p.email ?? ''),
      role,
      dbRole: String(p.rol ?? 'visualizador'),
      status: p.activo === false ? 'inactive' : 'active',
      lastLogin: formatDateTime(
        (p.ultimo_acceso as string) ||
          (p.updated_at as string) ||
          (p.created_at as string)
      ),
      avatar: initials(String(p.nombre ?? email)),
      sede: (p.sede as string) ?? null,
      linkedAsesorId: asesorByEmail.get(email) ?? null,
      clientesRelacionados: clientesByAsesor.get(email)?.size ?? 0,
      equiposRelacionados: equiposByAsesor.get(email)?.size ?? 0,
    };
  });
}

export async function fetchAdminAsesores(): Promise<AdminAsesorRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();

  const { data: asesores, error } = await supabase
    .from('asesores')
    .select('id, nombre, email, sede, activo')
    .order('nombre');

  if (error) throw new Error(error.message);

  const { data: telemetria } = await supabase
    .from('telemetria_equipos')
    .select('asesor_email, cliente_id, serie, id');

  return (asesores ?? []).map((a) => {
    const email = String(a.email).toLowerCase();
    const rows = (telemetria ?? []).filter(
      (t) => String(t.asesor_email ?? '').toLowerCase() === email
    );
    const clientes = new Set(rows.map((r) => r.cliente_id).filter(Boolean));
    const equipos = new Set(rows.map((r) => r.serie).filter(Boolean));
    return {
      id: a.id as string,
      nombre: String(a.nombre),
      email: String(a.email),
      sede: (a.sede as string) ?? null,
      activo: a.activo !== false,
      clientes: clientes.size,
      equipos: equipos.size,
      oportunidades: rows.length,
    };
  });
}

export async function fetchAdminClientes(limit = 50): Promise<AdminClienteRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, titulo, nit, email, telefono, ciudad')
    .order('titulo')
    .limit(limit);

  if (error) throw new Error(error.message);

  const ids = (clientes ?? []).map((c) => c.id as string);
  const countByCliente = new Map<string, number>();

  if (ids.length > 0) {
    const { data: maquinas } = await supabase
      .from('maquinas')
      .select('cliente_id')
      .in('cliente_id', ids);

    for (const m of maquinas ?? []) {
      const cid = String(m.cliente_id ?? '');
      if (!cid) continue;
      countByCliente.set(cid, (countByCliente.get(cid) ?? 0) + 1);
    }
  }

  return (clientes ?? []).map((c) => ({
    id: c.id as string,
    titulo: String(c.titulo),
    nit: (c.nit as string) ?? null,
    email: (c.email as string) ?? null,
    telefono: (c.telefono as string) ?? null,
    ciudad: (c.ciudad as string) ?? null,
    equipos: countByCliente.get(c.id as string) ?? 0,
  }));
}

export async function fetchAdminMaquinas(limit = 50): Promise<AdminMaquinaRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('maquinas')
    .select('id, serie, marca, modelo, tipo_maquina, cliente_id, sede_id, activo, clientes(titulo), sedes(nombre)')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Join puede fallar si no existe tabla; fallback simple
    const { data: plain, error: plainErr } = await supabase
      .from('maquinas')
      .select('id, serie, marca, modelo, tipo_maquina, cliente_id, sede_id, activo')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (plainErr) throw new Error(plainErr.message);

    const clienteIds = Array.from(
      new Set((plain ?? []).map((m) => m.cliente_id).filter(Boolean))
    ) as string[];
    const tituloById = new Map<string, string>();
    if (clienteIds.length) {
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id, titulo')
        .in('id', clienteIds);
      for (const c of clientes ?? []) tituloById.set(c.id as string, String(c.titulo));
    }

    return (plain ?? []).map((m) => ({
      id: m.id as string,
      serie: String(m.serie),
      marca: String(m.marca),
      modelo: String(m.modelo),
      tipo_maquina: (m.tipo_maquina as string) ?? null,
      cliente: m.cliente_id ? tituloById.get(m.cliente_id as string) ?? null : null,
      cliente_id: (m.cliente_id as string) ?? null,
      sede: null,
      sede_id: null,
      activo: m.activo !== false,
    }));
  }

  return (data ?? []).map((m) => {
    const clienteJoin = m.clientes as { titulo?: string } | { titulo?: string }[] | null;
    const sedeJoin = m.sedes as { nombre?: string } | { nombre?: string }[] | null;
    const clienteTitulo = Array.isArray(clienteJoin)
      ? clienteJoin[0]?.titulo
      : clienteJoin?.titulo;
    const sedeNombre = Array.isArray(sedeJoin) ? sedeJoin[0]?.nombre : sedeJoin?.nombre;

    return {
      id: m.id as string,
      serie: String(m.serie),
      marca: String(m.marca),
      modelo: String(m.modelo),
      tipo_maquina: (m.tipo_maquina as string) ?? null,
      cliente: clienteTitulo ?? null,
      cliente_id: (m.cliente_id as string) ?? null,
      sede: sedeNombre ?? null,
      sede_id: (m.sede_id as string) ?? null,
      activo: m.activo !== false,
    };
  });
}

function resolveJoinLabel(
  join: { titulo?: string; nombre?: string } | { titulo?: string; nombre?: string }[] | null,
  field: 'titulo' | 'nombre'
): string | null {
  if (!join) return null;
  if (Array.isArray(join)) return join[0]?.[field] ?? null;
  return join[field] ?? null;
}

export async function fetchAdminClienteOptions(limit = 500): Promise<AdminSelectOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('clientes')
    .select('id, titulo, nit')
    .order('titulo')
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    label: String(c.titulo),
    sublabel: (c.nit as string | null) ?? null,
  }));
}

export async function fetchAdminAsesorOptions(): Promise<AdminSelectOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('asesores')
    .select('id, nombre, email')
    .eq('activo', true)
    .order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({
    id: a.id as string,
    label: String(a.nombre),
    sublabel: String(a.email),
  }));
}

export async function fetchAdminEquipoRelacionesPage(params: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<AdminEquipoRelacionPage> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0 };
  const supabase = getSupabaseClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('maquinas')
    .select(
      'id, serie, marca, modelo, cliente_id, clientes(id, titulo, nit), sedes(nombre)',
      { count: 'exact' }
    )
    .eq('activo', true)
    .order('serie', { ascending: true })
    .range(from, to);

  const search = params.search?.trim();
  if (search) {
    const safe = search.replace(/[%_,]/g, '');
    query = query.or(`serie.ilike.%${safe}%,marca.ilike.%${safe}%,modelo.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const maquinas = data ?? [];
  const series = maquinas.map((m) => String(m.serie));
  const asesorBySerie = new Map<
    string,
    { asesor_id: string | null; asesor_email: string | null }
  >();
  const telemetriaCountBySerie = new Map<string, number>();

  if (series.length > 0) {
    const { data: telemetria } = await supabase
      .from('telemetria_equipos')
      .select('serie, asesor_id, asesor_email, updated_at')
      .in('serie', series)
      .order('updated_at', { ascending: false });

    for (const row of telemetria ?? []) {
      const serie = String(row.serie);
      telemetriaCountBySerie.set(serie, (telemetriaCountBySerie.get(serie) ?? 0) + 1);
      if (!asesorBySerie.has(serie)) {
        asesorBySerie.set(serie, {
          asesor_id: (row.asesor_id as string | null) ?? null,
          asesor_email: (row.asesor_email as string | null) ?? null,
        });
      }
    }
  }

  const asesorIds = Array.from(
    new Set(
      Array.from(asesorBySerie.values())
        .map((a) => a.asesor_id)
        .filter(Boolean)
    )
  ) as string[];
  const asesorNameById = new Map<string, string>();
  if (asesorIds.length > 0) {
    const { data: asesores } = await supabase
      .from('asesores')
      .select('id, nombre')
      .in('id', asesorIds);
    for (const a of asesores ?? []) {
      asesorNameById.set(a.id as string, String(a.nombre));
    }
  }

  const emailToAsesorId = new Map<string, string>();
  if (series.length > 0) {
    const emails = Array.from(
      new Set(
        Array.from(asesorBySerie.values())
          .map((a) => a.asesor_email?.trim().toLowerCase())
          .filter(Boolean)
      )
    ) as string[];
    if (emails.length > 0) {
      const { data: asesoresByEmail } = await supabase
        .from('asesores')
        .select('id, email')
        .in('email', emails);
      for (const a of asesoresByEmail ?? []) {
        emailToAsesorId.set(String(a.email).toLowerCase(), a.id as string);
      }
    }
  }

  const rows: AdminEquipoRelacionRow[] = maquinas.map((m) => {
    const serie = String(m.serie);
    const clienteJoin = m.clientes as { id?: string; titulo?: string; nit?: string } | null;
    const asesorSnap = asesorBySerie.get(serie);
    let asesorId = asesorSnap?.asesor_id ?? null;
    if (!asesorId && asesorSnap?.asesor_email) {
      asesorId = emailToAsesorId.get(asesorSnap.asesor_email.toLowerCase()) ?? null;
    }

    return {
      id: m.id as string,
      serie,
      marca: String(m.marca),
      modelo: String(m.modelo),
      cliente_id: (m.cliente_id as string | null) ?? null,
      cliente_titulo: clienteJoin?.titulo ?? null,
      cliente_nit: clienteJoin?.nit ?? null,
      asesor_id: asesorId,
      asesor_nombre: asesorId ? asesorNameById.get(asesorId) ?? null : null,
      asesor_email: asesorSnap?.asesor_email ?? null,
      sede: resolveJoinLabel(m.sedes as { nombre?: string } | { nombre?: string }[] | null, 'nombre'),
      telemetria_registros: telemetriaCountBySerie.get(serie) ?? 0,
    };
  });

  return { rows, total: count ?? 0 };
}

export async function updateAdminEquipoRelacion(
  input: AdminEquipoRelacionUpdateInput
): Promise<{ telemetriaActualizados: number }> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado.');
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const serie = input.serie.trim();
  const telePayload: Record<string, unknown> = {
    updated_at: now,
    maquina_id: input.maquinaId,
  };
  const maquinaPayload: Record<string, unknown> = { updated_at: now };

  if (input.clienteId !== undefined) {
    maquinaPayload.cliente_id = input.clienteId;
    telePayload.cliente_id = input.clienteId;
    if (input.clienteId) {
      const { data: cliente } = await supabase
        .from('clientes')
        .select('titulo, nit, email, telefono, ciudad')
        .eq('id', input.clienteId)
        .maybeSingle();
      if (cliente) {
        telePayload.titulo = cliente.titulo;
        telePayload.nit = cliente.nit;
        telePayload.email = cliente.email;
        telePayload.telefono = cliente.telefono;
        telePayload.ciudad = cliente.ciudad;
      }
    } else {
      telePayload.titulo = null;
      telePayload.nit = null;
      telePayload.email = null;
      telePayload.telefono = null;
      telePayload.ciudad = null;
    }
  }

  if (input.asesorId !== undefined) {
    telePayload.asesor_id = input.asesorId;
    if (input.asesorId) {
      const { data: asesor } = await supabase
        .from('asesores')
        .select('email, sede')
        .eq('id', input.asesorId)
        .maybeSingle();
      telePayload.asesor_email = asesor?.email ?? null;
      if (asesor?.sede) telePayload.sede = asesor.sede;
    } else {
      telePayload.asesor_email = null;
    }
  }

  if (Object.keys(maquinaPayload).length > 1) {
    const { error: maquinaErr } = await supabase
      .from('maquinas')
      .update(maquinaPayload)
      .eq('id', input.maquinaId);
    if (maquinaErr) throw new Error(maquinaErr.message);
  }

  const { data: updatedRows, error: teleErr } = await supabase
    .from('telemetria_equipos')
    .update(telePayload)
    .eq('serie', serie)
    .select('id');
  if (teleErr) throw new Error(teleErr.message);

  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Updated',
    entidad: 'maquinas',
    entidadId: input.maquinaId,
    detalle: {
      serie,
      ...telePayload,
      telemetria_actualizados: updatedRows?.length ?? 0,
    },
  });

  return { telemetriaActualizados: updatedRows?.length ?? 0 };
}

export async function fetchAdminSedes(): Promise<AdminSedeOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('sedes').select('id, nombre').order('nombre');
  if (error) {
    if (/sedes|relation|does not exist/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((s) => ({ id: s.id as string, nombre: String(s.nombre) }));
}

export async function createAsesor(input: AsesorInput): Promise<string> {
  const supabase = getSupabaseClient();
  const email = input.email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('asesores')
    .insert({
      nombre: input.nombre.trim(),
      email,
      sede: input.sede?.trim() || null,
      activo: input.activo !== false,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Created',
    entidad: 'asesores',
    entidadId: id,
    detalle: { email },
  });
  return id;
}

export async function updateAsesor(id: string, input: Partial<AsesorInput>): Promise<void> {
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {};
  if (input.nombre != null) payload.nombre = input.nombre.trim();
  if (input.email != null) payload.email = input.email.trim().toLowerCase();
  if (input.sede !== undefined) payload.sede = input.sede?.trim() || null;
  if (input.activo != null) payload.activo = input.activo;

  const { error } = await supabase.from('asesores').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Updated',
    entidad: 'asesores',
    entidadId: id,
    detalle: payload,
  });
}

export async function createCliente(input: ClienteInput): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      titulo: input.titulo.trim(),
      nit: input.nit?.trim() || null,
      email: input.email?.trim() || null,
      telefono: input.telefono?.trim() || null,
      ciudad: input.ciudad?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Created',
    entidad: 'clientes',
    entidadId: id,
    detalle: { titulo: input.titulo },
  });
  return id;
}

export async function updateCliente(id: string, input: Partial<ClienteInput>): Promise<void> {
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {};
  if (input.titulo != null) payload.titulo = input.titulo.trim();
  if (input.nit !== undefined) payload.nit = input.nit?.trim() || null;
  if (input.email !== undefined) payload.email = input.email?.trim() || null;
  if (input.telefono !== undefined) payload.telefono = input.telefono?.trim() || null;
  if (input.ciudad !== undefined) payload.ciudad = input.ciudad?.trim() || null;

  const { error } = await supabase.from('clientes').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Updated',
    entidad: 'clientes',
    entidadId: id,
    detalle: payload,
  });
}

export async function createMaquina(input: MaquinaInput): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('maquinas')
    .insert({
      serie: input.serie.trim(),
      marca: input.marca.trim(),
      modelo: input.modelo.trim(),
      tipo_maquina: input.tipo_maquina?.trim() || null,
      cliente_id: input.cliente_id || null,
      sede_id: input.sede_id || null,
      activo: input.activo !== false,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Created',
    entidad: 'maquinas',
    entidadId: id,
    detalle: { serie: input.serie },
  });
  return id;
}

export async function updateMaquina(id: string, input: Partial<MaquinaInput>): Promise<void> {
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {};
  if (input.serie != null) payload.serie = input.serie.trim();
  if (input.marca != null) payload.marca = input.marca.trim();
  if (input.modelo != null) payload.modelo = input.modelo.trim();
  if (input.tipo_maquina !== undefined) payload.tipo_maquina = input.tipo_maquina?.trim() || null;
  if (input.cliente_id !== undefined) payload.cliente_id = input.cliente_id || null;
  if (input.sede_id !== undefined) payload.sede_id = input.sede_id || null;
  if (input.activo != null) payload.activo = input.activo;

  const { error } = await supabase.from('maquinas').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Updated',
    entidad: 'maquinas',
    entidadId: id,
    detalle: payload,
  });
}

export async function fetchAdminImportaciones(limit = 30): Promise<AdminImportRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('importaciones')
    .select(
      'id, modulo, nombre_archivo, registros_ok, registros_total, duplicados, resumen_json, estado, created_at, user_id'
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const userIds = Array.from(
    new Set((data ?? []).map((r) => r.user_id).filter(Boolean))
  ) as string[];

  const nameById = new Map<string, string>();
  if (userIds.length) {
    const { data: perfiles } = await supabase
      .from('perfiles')
      .select('id, nombre, email')
      .in('id', userIds);
    for (const p of perfiles ?? []) {
      nameById.set(p.id as string, String(p.nombre || p.email));
    }
  }

  return (data ?? []).map((r) => {
    const fullId = String(r.id);
    const resumen = parseTelemetriaResumen(r.resumen_json);
    return {
      id: fullId.slice(0, 8).toUpperCase(),
      batchId: fullId,
      modulo: String(r.modulo),
      typeLabel: moduloToTypeLabel(String(r.modulo)),
      file: String(r.nombre_archivo),
      rows: Number(r.registros_ok ?? r.registros_total ?? 0),
      status: mapImportEstado(String(r.estado)),
      date: formatDateTime(r.created_at as string),
      user: r.user_id ? nameById.get(r.user_id as string) ?? '—' : '—',
      proyeccionesActualizadas: Number(r.duplicados ?? resumen?.proyecciones_actualizadas ?? 0) || undefined,
      resumen,
    };
  });
}

export async function setPerfilActivo(id: string, activo: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('perfiles').update({ activo }).eq('id', id);
  if (error) throw new Error(error.message);
  await writeAudit({
    modulo: 'Usuarios',
    accion: activo ? 'Updated' : 'Updated',
    entidad: 'perfiles',
    entidadId: id,
    detalle: { campo: 'activo', valor: activo },
  });
}

export interface AdminPerfilUpdate {
  nombre?: string;
  rol?: UserRole;
  sede?: string | null;
  activo?: boolean;
}

export interface CreateAdminUserInput {
  email: string;
  password: string;
  nombre: string;
  rol: UserRole;
  sede?: string | null;
}

export async function createAdminUser(input: CreateAdminUserInput): Promise<{ id: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no configurado.');
  }

  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Sesión no válida. Inicie sesión nuevamente.');
  }

  const body = {
    email: input.email.trim(),
    password: input.password,
    nombre: input.nombre.trim(),
    rol: input.rol,
    sede: input.sede?.trim() || null,
  };

  const { data, error } = await supabase.functions.invoke('create-admin-user', { body });

  if (!error) {
    const payload = data as { error?: string; id?: string };
    if (payload.error) {
      throw new Error(payload.error);
    }
    if (payload.id) {
      return { id: payload.id };
    }
  }

  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string; id?: string };

  if (!response.ok) {
    const edgeMessage = error?.message;
    const apiMessage = payload.error ?? 'No se pudo crear el usuario.';
    if (edgeMessage && response.status === 503) {
      throw new Error(
        `${apiMessage} Despliegue la Edge Function create-admin-user en Supabase (supabase functions deploy create-admin-user).`
      );
    }
    throw new Error(apiMessage);
  }

  return { id: payload.id ?? '' };
}

export async function updatePerfil(id: string, patch: AdminPerfilUpdate): Promise<void> {
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {};
  if (patch.nombre != null) payload.nombre = patch.nombre.trim();
  if (patch.sede !== undefined) payload.sede = patch.sede;
  if (patch.activo != null) payload.activo = patch.activo;
  if (patch.rol) {
    payload.rol = mapAppRoleToDb(patch.rol);
  }

  const { error } = await supabase.from('perfiles').update(payload).eq('id', id);
  if (error) throw new Error(error.message);

  await writeAudit({
    modulo: 'Usuarios',
    accion: 'Updated',
    entidad: 'perfiles',
    entidadId: id,
    detalle: payload,
  });
}

export interface AdminRoleSummary {
  id: string;
  dbRole: string;
  appRole: UserRole;
  name: string;
  description: string;
  userCount: number;
  capabilities: string[];
}

export async function fetchModuleAccessMatrix(): Promise<ModuleAccessMatrix> {
  if (!isSupabaseConfigured()) return cloneDefaultModuleAccess();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .select('module_access')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    if (/module_access|column|does not exist/i.test(error.message)) {
      return cloneDefaultModuleAccess();
    }
    throw new Error(error.message);
  }

  if (!data?.module_access) return cloneDefaultModuleAccess();
  return normalizeModuleAccessMatrix(data.module_access);
}

export async function saveModuleAccessMatrix(matrix: ModuleAccessMatrix): Promise<void> {
  const normalized = enforceAdministratorFullAccess(normalizeModuleAccessMatrix(matrix));
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('configuracion_sistema')
    .update({
      module_access: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) throw new Error(error.message);

  await writeAudit({
    modulo: 'Permisos',
    accion: 'Updated',
    entidad: 'configuracion_sistema',
    entidadId: 'module_access',
    detalle: { modules: Object.keys(normalized) },
  });
}

export async function fetchAdminRoleSummaries(): Promise<AdminRoleSummary[]> {
  const { ROLE_CATALOG, PERM_CAPABILITIES } = await import('@/lib/admin/role-catalog');

  if (!isSupabaseConfigured()) {
    return ROLE_CATALOG.map((r) => ({
      ...r,
      userCount: 0,
      capabilities: PERM_CAPABILITIES[r.appRole],
    }));
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('perfiles').select('rol');
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const rol = String(row.rol ?? 'visualizador');
    counts.set(rol, (counts.get(rol) ?? 0) + 1);
  }

  return ROLE_CATALOG.map((r) => ({
    ...r,
    userCount: counts.get(r.dbRole) ?? 0,
    capabilities: PERM_CAPABILITIES[r.appRole],
  }));
}

export interface SystemConfig {
  empresa_nombre: string;
  nit: string;
  telefono: string;
  direccion: string;
  email_corporativo: string;
  moneda: string;
  idioma: string;
  zona_horaria: string;
  iva_porcentaje: number;
  dias_credito: number;
}

const DEFAULT_CONFIG: SystemConfig = {
  empresa_nombre: 'PARTEQUIPOS MAQUINARIA',
  nit: '900.123.456-7',
  telefono: '+57 601 234 5678',
  direccion: 'Cra. 7 #32-16, Bogotá D.C., Colombia',
  email_corporativo: 'info@partequipos.com',
  moneda: 'COP',
  idioma: 'es',
  zona_horaria: 'America/Bogota',
  iva_porcentaje: 19,
  dias_credito: 30,
};

export async function fetchSystemConfig(): Promise<SystemConfig> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_CONFIG };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('configuracion_sistema')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    // Tabla aún no creada (SQL 20): devolver defaults
    return { ...DEFAULT_CONFIG };
  }

  return {
    empresa_nombre: String(data.empresa_nombre ?? DEFAULT_CONFIG.empresa_nombre),
    nit: String(data.nit ?? DEFAULT_CONFIG.nit),
    telefono: String(data.telefono ?? DEFAULT_CONFIG.telefono),
    direccion: String(data.direccion ?? DEFAULT_CONFIG.direccion),
    email_corporativo: String(data.email_corporativo ?? DEFAULT_CONFIG.email_corporativo),
    moneda: String(data.moneda ?? DEFAULT_CONFIG.moneda),
    idioma: String(data.idioma ?? DEFAULT_CONFIG.idioma),
    zona_horaria: String(data.zona_horaria ?? DEFAULT_CONFIG.zona_horaria),
    iva_porcentaje: Number(data.iva_porcentaje ?? DEFAULT_CONFIG.iva_porcentaje),
    dias_credito: Number(data.dias_credito ?? DEFAULT_CONFIG.dias_credito),
  };
}

export async function saveSystemConfig(
  config: SystemConfig,
  updatedBy: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('configuracion_sistema').upsert(
    {
      id: 1,
      ...config,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(error.message);

  await writeAudit({
    modulo: 'Configuración',
    accion: 'Updated',
    entidad: 'configuracion_sistema',
    entidadId: '1',
    detalle: { ...config },
  });
}

export interface AdminAuditRow {
  id: string;
  timestamp: string;
  user: string;
  action: 'Created' | 'Updated' | 'Deleted' | string;
  module: string;
  record: string;
  fields: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  ip: string;
}

export interface AuditQuery {
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

function inferLevel(accion: string): AdminAuditRow['level'] {
  const a = accion.toLowerCase();
  if (a.includes('delete') || a.includes('elimin') || a.includes('error')) return 'ERROR';
  if (a.includes('update') || a.includes('warn') || a.includes('desactiv')) return 'WARN';
  return 'INFO';
}

function detailToFields(detalle: unknown): string {
  if (detalle == null) return '—';
  if (typeof detalle === 'string') return detalle;
  try {
    return JSON.stringify(detalle);
  } catch {
    return '—';
  }
}

export async function fetchAuditoria(query: AuditQuery = {}): Promise<AdminAuditRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = getSupabaseClient();
  let q = supabase
    .from('auditoria')
    .select('id, user_id, modulo, accion, entidad, entidad_id, detalle, ip_address, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(200, query.limit ?? 100));

  if (query.from) q = q.gte('created_at', `${query.from}T00:00:00`);
  if (query.to) q = q.lte('created_at', `${query.to}T23:59:59`);

  const { data, error } = await q;
  if (error) {
    // Tabla sin RLS o vacía
    if (/auditoria|permission|policy/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  const userIds = Array.from(
    new Set((data ?? []).map((r) => r.user_id).filter(Boolean))
  ) as string[];
  const nameById = new Map<string, string>();
  if (userIds.length) {
    const { data: perfiles } = await supabase
      .from('perfiles')
      .select('id, nombre, email')
      .in('id', userIds);
    for (const p of perfiles ?? []) {
      nameById.set(p.id as string, String(p.nombre || p.email));
    }
  }

  const search = (query.search ?? '').trim().toLowerCase();

  return (data ?? [])
    .map((r) => {
      const action = String(r.accion || 'Updated');
      const row: AdminAuditRow = {
        id: String(r.id).slice(0, 8).toUpperCase(),
        timestamp: formatDateTime(r.created_at as string),
        user: r.user_id ? nameById.get(r.user_id as string) ?? '—' : 'sistema',
        action,
        module: String(r.modulo ?? '—'),
        record: String(r.entidad_id || r.entidad || '—'),
        fields: detailToFields(r.detalle),
        level: inferLevel(action),
        ip: r.ip_address ? String(r.ip_address) : '—',
      };
      return row;
    })
    .filter((row) => {
      if (!search) return true;
      return [row.user, row.module, row.record, row.fields, row.action]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
}

export interface AdminTelemetriaRow {
  id: string;
  titulo: string | null;
  serie: string;
  marca: string;
  modelo: string;
  horometro: number;
  sede: string | null;
  ciudad: string | null;
  asesor_email: string | null;
  estado: string | null;
  fecha_primer_mtto: string | null;
  mes_creado: string | null;
  anio: number | null;
  observaciones: string | null;
  import_batch_id: string | null;
  created_at: string | null;
}

export interface AdminTelemetriaUpdateInput {
  titulo?: string | null;
  serie?: string;
  marca?: string;
  modelo?: string;
  horometro?: number;
  sede?: string | null;
  ciudad?: string | null;
  asesor_email?: string | null;
  estado?: string | null;
  fecha_primer_mtto?: string | null;
  mes_creado?: string | null;
  anio?: number | null;
  observaciones?: string | null;
}

export interface AdminTelemetriaPage {
  rows: AdminTelemetriaRow[];
  total: number;
}

function mapAdminTelemetriaRow(row: Record<string, unknown>): AdminTelemetriaRow {
  return {
    id: String(row.id),
    titulo: (row.titulo as string | null) ?? null,
    serie: String(row.serie ?? ''),
    marca: String(row.marca ?? ''),
    modelo: String(row.modelo ?? ''),
    horometro: Number(row.horometro ?? 0),
    sede: (row.sede as string | null) ?? null,
    ciudad: (row.ciudad as string | null) ?? null,
    asesor_email: (row.asesor_email as string | null) ?? null,
    estado: (row.estado as string | null) ?? null,
    fecha_primer_mtto: (row.fecha_primer_mtto as string | null) ?? null,
    mes_creado: (row.mes_creado as string | null) ?? null,
    anio: row.anio == null ? null : Number(row.anio),
    observaciones: (row.observaciones as string | null) ?? null,
    import_batch_id: (row.import_batch_id as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

export async function fetchAdminTelemetriaPage(params: {
  search?: string;
  batchId?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<AdminTelemetriaPage> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0 };
  const supabase = getSupabaseClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('telemetria_equipos')
    .select(
      'id, titulo, serie, marca, modelo, horometro, sede, ciudad, asesor_email, estado, fecha_primer_mtto, mes_creado, anio, observaciones, import_batch_id, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.batchId?.trim()) {
    query = query.eq('import_batch_id', params.batchId.trim());
  }

  const search = params.search?.trim();
  if (search) {
    const safe = search.replace(/[%_,]/g, '');
    query = query.or(
      `serie.ilike.%${safe}%,marca.ilike.%${safe}%,modelo.ilike.%${safe}%,titulo.ilike.%${safe}%,sede.ilike.%${safe}%,asesor_email.ilike.%${safe}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    rows: (data ?? []).map((r) => mapAdminTelemetriaRow(r as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function updateAdminTelemetriaEquipo(
  id: string,
  input: AdminTelemetriaUpdateInput
): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado.');
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.titulo !== undefined) payload.titulo = input.titulo?.trim() || null;
  if (input.serie !== undefined) payload.serie = input.serie.trim();
  if (input.marca !== undefined) payload.marca = input.marca.trim();
  if (input.modelo !== undefined) payload.modelo = input.modelo.trim();
  if (input.horometro !== undefined) payload.horometro = input.horometro;
  if (input.sede !== undefined) payload.sede = input.sede?.trim() || null;
  if (input.ciudad !== undefined) payload.ciudad = input.ciudad?.trim() || null;
  if (input.asesor_email !== undefined) payload.asesor_email = input.asesor_email?.trim() || null;
  if (input.estado !== undefined) payload.estado = input.estado?.trim() || null;
  if (input.fecha_primer_mtto !== undefined) {
    payload.fecha_primer_mtto = input.fecha_primer_mtto?.trim() || null;
  }
  if (input.mes_creado !== undefined) payload.mes_creado = input.mes_creado?.trim() || null;
  if (input.anio !== undefined) payload.anio = input.anio;
  if (input.observaciones !== undefined) {
    payload.observaciones = input.observaciones?.trim() || null;
  }

  const { error } = await supabase.from('telemetria_equipos').update(payload).eq('id', id);
  if (error) throw new Error(error.message);

  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Updated',
    entidad: 'telemetria_equipos',
    entidadId: id,
    detalle: payload,
  });
}

export async function deleteAdminTelemetriaEquipo(id: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado.');
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('telemetria_equipos').delete().eq('id', id);
  if (error) throw new Error(error.message);

  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Deleted',
    entidad: 'telemetria_equipos',
    entidadId: id,
    detalle: { scope: 'single' },
  });
}

export async function countTelemetriaByImportBatch(batchId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('telemetria_equipos')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Elimina solo las filas de telemetría de una carga masiva (import_batch_id).
 * No borra maestros (clientes, asesores, máquinas, sedes).
 */
export async function deleteTelemetriaImportBatch(
  batchId: string
): Promise<{ deleted: number }> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado.');
  const supabase = getSupabaseClient();

  const { data: log } = await supabase
    .from('importaciones')
    .select('id, modulo')
    .eq('id', batchId)
    .maybeSingle();

  if (!log) throw new Error('Carga masiva no encontrada.');
  if (String(log.modulo) !== 'proyectados') {
    throw new Error('Solo se pueden revertir cargas de Cronograma / Telemetría.');
  }

  const before = await countTelemetriaByImportBatch(batchId);

  const { error: delError } = await supabase
    .from('telemetria_equipos')
    .delete()
    .eq('import_batch_id', batchId);

  if (delError) throw new Error(delError.message);

  await supabase
    .from('importaciones')
    .update({
      estado: 'revertido',
      resumen_json: {
        reverted: true,
        deleted_rows: before,
        reverted_at: new Date().toISOString(),
      },
    })
    .eq('id', batchId);

  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Deleted',
    entidad: 'importaciones',
    entidadId: batchId,
    detalle: { scope: 'batch', deleted_rows: before, modulo: 'proyectados' },
  });

  return { deleted: before };
}

export async function countTempariosByImportBatch(batchId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('temparios_mantenimiento')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Elimina solo las filas de temparios de una carga masiva (import_batch_id).
 * No borra otras cargas ni cotizaciones.
 */
export async function deleteTemparioImportBatch(
  batchId: string
): Promise<{ deleted: number }> {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado.');
  const supabase = getSupabaseClient();

  const { data: log } = await supabase
    .from('importaciones')
    .select('id, modulo')
    .eq('id', batchId)
    .maybeSingle();

  if (!log) throw new Error('Carga masiva no encontrada.');
  if (String(log.modulo) !== 'calculadora') {
    throw new Error('Solo se pueden revertir cargas de Temparios (calculadora).');
  }

  const before = await countTempariosByImportBatch(batchId);

  const { error: delError } = await supabase
    .from('temparios_mantenimiento')
    .delete()
    .eq('import_batch_id', batchId);

  if (delError) throw new Error(delError.message);

  await supabase
    .from('importaciones')
    .update({
      estado: 'revertido',
      resumen_json: {
        reverted: true,
        deleted_rows: before,
        reverted_at: new Date().toISOString(),
      },
    })
    .eq('id', batchId);

  await writeAudit({
    modulo: 'Importaciones',
    accion: 'Deleted',
    entidad: 'importaciones',
    entidadId: batchId,
    detalle: { scope: 'batch', deleted_rows: before, modulo: 'calculadora' },
  });

  return { deleted: before };
}

export async function writeAudit(input: {
  modulo: string;
  accion: string;
  entidad?: string;
  entidadId?: string;
  detalle?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from('auditoria').insert({
      user_id: user?.id ?? null,
      modulo: input.modulo,
      accion: input.accion,
      entidad: input.entidad ?? null,
      entidad_id: input.entidadId ?? null,
      detalle: input.detalle ?? {},
    });
  } catch {
    // No bloquear flujo de negocio si falla auditoría
  }
}
