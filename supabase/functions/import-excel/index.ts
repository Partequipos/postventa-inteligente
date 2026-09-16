/**
 * Edge Function: import-excel
 * Procesa CSV y Excel (.xlsx / .xls) e inserta en tablas según módulo.
 *
 * Deploy (desde la carpeta del proyecto):
 *   supabase functions deploy import-excel
 *
 * Invoke: POST /functions/v1/import-excel
 * Body: { modulo, fileName, contentBase64, contentType? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Modulo = 'calculadora' | 'proyectados' | 'cpp';

interface ImportRequest {
  modulo: Modulo;
  fileName: string;
  contentBase64: string;
  contentType?: string;
}

function decodeBase64ToBytes(content: string): Uint8Array {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Fechas seriales de Excel (aprox. 30000–60000)
    if (value > 20000 && value < 80000) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    return String(value);
  }
  return String(value).trim();
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseExcel(bytes: Uint8Array): Record<string, string>[] {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  return json.map((row) => {
    const out: Record<string, string> = {};
    Object.entries(row).forEach(([key, value]) => {
      out[String(key).trim()] = cellToString(value);
    });
    return out;
  });
}

function parseFile(fileName: string, contentBase64: string): Record<string, string>[] {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const bytes = decodeBase64ToBytes(contentBase64);

  if (ext === 'csv' || ext === 'txt') {
    const text = new TextDecoder('utf-8').decode(bytes);
    return parseCsv(text);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(bytes);
  }

  throw new Error('Formato no soportado. Use .xlsx, .xls o .csv');
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  const entries = Object.entries(row);
  for (const key of keys) {
    const found = entries.find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (found?.[1]) return found[1];
  }
  return '';
}

function toNumber(value: string, fallback = 0): number {
  if (!value) return fallback;
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function mapTempario(row: Record<string, string>, createdBy: string) {
  // SOLO Modelo2 = tipo. TipoItem es catálogo (Filtro/Aceite), no el tipo.
  const tipoRaw =
    getField(row, 'Modelo2', 'modelo2', 'Modelo 2', 'MODELO2') ||
    (() => {
      for (const [k, v] of Object.entries(row)) {
        const nk = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (nk === 'modelo2' && String(v).trim()) return String(v).trim();
      }
      return '';
    })();

  if (!tipoRaw) {
    throw new Error('Falta columna Modelo2 (Actividad/Repuesto/Fluido/Observacion)');
  }

  const itemName = getField(row, 'Item', 'item', 'Nombre');
  const tipoNorm = tipoRaw.trim().toLowerCase();
  let tipo = 'Repuesto';
  if (tipoNorm.startsWith('fluido') || tipoNorm === 'fluid') tipo = 'Fluido';
  else if (tipoNorm.startsWith('consum')) tipo = 'Consumible';
  else if (tipoNorm.startsWith('activ')) tipo = 'Actividad';
  else if (tipoNorm.startsWith('serv')) tipo = 'Servicio';
  else if (tipoNorm.startsWith('observ')) tipo = 'Observacion';
  else if (tipoNorm.startsWith('repues')) tipo = 'Repuesto';
  else if (
    ['Repuesto', 'Consumible', 'Fluido', 'Actividad', 'Servicio', 'Observacion'].includes(tipoRaw)
  ) {
    tipo = tipoRaw;
  }

  // tipo_catalogo desde Modelo2: Repuesto→Filtro, Fluido→Aceite, Actividad, Observacion
  let tipoCatalogo = 'Filtro';
  if (tipo === 'Fluido' || tipo === 'Consumible') tipoCatalogo = 'Aceite';
  else if (tipo === 'Actividad' || tipo === 'Servicio') tipoCatalogo = 'Actividad';
  else if (tipo === 'Observacion') tipoCatalogo = 'Observacion';
  else if (tipo === 'Repuesto') tipoCatalogo = 'Filtro';

  const hasGalones = Object.keys(row).some((k) =>
    k.trim().toLowerCase().replace(/\s+/g, ' ').includes('cantidad (galones)')
  );
  const cantCol = getField(row, 'Cantidad', 'cantidad');
  const galCol = getField(row, 'Cantidad (Galones)', 'Cantidad Galones');
  const unidadLegacy = getField(row, 'Unidad de medida', 'unidad_medida');
  let unidad = 'Unidad';
  let cantidad = 1;
  if (hasGalones) {
    unidad = cantCol && !/^n\/?a$/i.test(cantCol) ? cantCol : unidadLegacy || 'Unidad';
    cantidad = toNumber(galCol, 0);
  } else {
    unidad = unidadLegacy || 'Unidad';
    cantidad = toNumber(cantCol, 1);
  }

  const freq = toNumber(getField(row, 'Frecuencia', 'Frecuencia (horas)', 'frecuencia_horas'), 250);
  const frecuencia = [250, 1000, 2000, 4000, 5000].includes(freq) ? freq : 250;
  const legacyRaw = getField(row, 'ID', 'Id', 'legacy_id', 'id_legacy');
  const legacyId = legacyRaw ? Math.trunc(toNumber(legacyRaw, 0)) || null : null;
  const creadoPor =
    getField(row, 'Creado por', 'created_by', 'Creado Por') || createdBy;
  const modificadoPor =
    getField(row, 'Modificado por', 'updated_by', 'Modificado Por') || createdBy;

  const creadoRaw = getField(row, 'Creado', 'created_at');
  const modificadoRaw = getField(row, 'Modificado', 'updated_at');
  const parseDate = (v: string): string | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  return {
    legacy_id: legacyId,
    marca: getField(row, 'Marca', 'marca'),
    linea: getField(row, 'Linea', 'linea') || '',
    modelo: getField(row, 'Modelo', 'modelo'),
    tipo_item: tipo,
    tipo_catalogo: tipoCatalogo || null,
    item: itemName,
    unidad_medida: unidad,
    cantidad,
    frecuencia_horas: frecuencia,
    aceite_homologado: getField(row, 'Aceite Homologado', 'aceite_homologado') || null,
    referencia_genuina: getField(row, 'Referencia Genuina', 'referencia_genuina') || null,
    ref_sap_dispel: getField(row, 'REF SAP DISPEL', 'ref_sap_dispel') || null,
    ref_sap_original:
      getField(row, 'REF SAP ORIGINAl', 'REF SAP ORIGINAL', 'ref_sap_original') || null,
    referencia_stal: getField(row, 'Referencia Stal', 'referencia_stal') || null,
    referencia_fleetguard: getField(row, 'Referencia Fleetguard', 'referencia_fleetguard') || null,
    referencia_donaldson:
      getField(row, 'Referencia Donalson', 'Referencia Donaldson', 'referencia_donaldson') || null,
    tiempo_horas: toNumber(getField(row, 'Tiempo', 'Tiempo (horas)', 'tiempo_horas'), 0),
    procedimiento: getField(row, 'Procedimiento', 'procedimiento') || null,
    avisos_claves:
      getField(row, 'Observaciones', 'Avisos Claves', 'avisos_claves') || null,
    created_at: parseDate(creadoRaw),
    updated_at: parseDate(modificadoRaw) ?? parseDate(creadoRaw),
    created_by: creadoPor,
    updated_by: modificadoPor,
    activo: true,
  };
}

function mapTelemetria(row: Record<string, string>, createdBy: string) {
  const clean = (v: string) => {
    const t = (v || '').trim();
    if (!t) return '';
    const u = t.toUpperCase();
    if (u === '#N/D' || u === 'N/D' || u === 'ND') return '';
    return t;
  };

  const get = (...aliases: string[]) => clean(getField(row, ...aliases));
  const num = (raw: string) => {
    if (!raw) return null;
    const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const parseDate = (raw: string) => {
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return null;
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  };

  const serie = get('Serie.', 'Serie', 'serie', 'N° serie', 'numero_serie');
  // Correo del asesor de servicio = Asesor2 / ASESOR 2 (no la columna ASESOR)
  const asesor2 = get('Asesor2', 'ASESOR 2', 'Asesor 2', 'ASESOR2');
  const asesorCol = get('ASESOR', 'Asesor');
  const emailCliente = get('email', 'Email');
  const correo = get('Correo');

  const monthAliases: Record<string, string> = {
    january: 'January',
    enero: 'January',
    february: 'February',
    febrero: 'February',
    march: 'March',
    marzo: 'March',
    april: 'April',
    abril: 'April',
    may: 'May',
    mayo: 'May',
    june: 'June',
    junio: 'June',
    july: 'July',
    julio: 'July',
    august: 'August',
    agosto: 'August',
    september: 'September',
    septiembre: 'September',
    setiembre: 'September',
    october: 'October',
    octubre: 'October',
    november: 'November',
    noviembre: 'November',
    december: 'December',
    diciembre: 'December',
  };
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const mesRaw = get('MesCreado', 'Mes Creado', 'mes_creado', 'Mes').toLowerCase();
  let mesCreado = monthAliases[mesRaw] ?? '';
  if (!mesCreado) {
    const n = Number(mesRaw);
    mesCreado =
      Number.isInteger(n) && n >= 1 && n <= 12 ? months[n - 1] : months[new Date().getMonth()];
  }
  const anioRaw = num(get('Año', 'Anio', 'anio'));
  const anio =
    anioRaw != null && anioRaw >= 2000 && anioRaw <= 2100
      ? Math.trunc(anioRaw)
      : new Date().getFullYear();

  return {
    titulo: get('Nombre del cliente', 'Nombre del Cliente', 'Título', 'Titulo', 'titulo') || null,
    email: emailCliente.includes('@') ? emailCliente : null,
    nit: get('Nit', 'nit') || null,
    telefono: get('Telefono', 'Teléfono', 'telefono') || null,
    serie,
    modelo: get('Modelo', 'modelo') || 'SIN MODELO',
    horometro: num(get('Horometro', 'horometro')) ?? 0,
    promedio_h: num(get('Promedio_h', 'promedio_h')),
    ciudad: get('Ciudad', 'ciudad') || null,
    ultima_fecha_comunicacion:
      parseDate(get('Última fecha/hora de común', 'Ultima fecha/hora de comun')) || null,
    latitud: num(get('Latitud', 'latitud')),
    longitud: num(get('Longitud', 'longitud')),
    dias_primer_mtto: num(get('Dias Primer Mtto')),
    proximo_primer_mtto: num(get('Proximo Primer Mtto', 'Próximo Primer Mtto')),
    dias_segundo_mtto: num(get('Dias Segundo Mtto')),
    proximo_segundo_mtto: num(get('Proximo Segundo Mtto')),
    dias_tercer_mtto: num(get('Dias Tercer Mtto')),
    proximo_tercer_mtto: num(get('Proximo Tercer Mtto')),
    fecha_primer_mtto: parseDate(get('Fecha Primer Mtto', 'fecha_primer_mtto')),
    fecha_segundo_mtto: parseDate(get('Fecha Segundo Mtto', 'fecha_segundo_mtto')),
    fecha_tercer_mtto: parseDate(get('Fecha Tercer Mtto', 'fecha_tercer_mtto')),
    distancia_bogota: num(get('Distancia Bogota', 'Distancia Bogotá')),
    distancia_medellin: num(get('Distancia Medellin', 'Distancia Medellín')),
    distancia_barranquilla: num(get('Distacia Barranquilla', 'Distancia Barranquilla')),
    distancia_monteria: num(get('Distancia Monteria', 'Distancia Montería')),
    distancia_cali: num(get('Distancia Cali')),
    distancia_bucaramanga: num(get('Distancia Bucaramanga')),
    distancia_ibague: num(get('Distancia Ibague', 'Distancia Ibagué')),
    distancia_istmina: num(get('Distancia Istmina')),
    distancia_caucasia: num(get('Distancia Caucasia', 'Distacia Caucasia', 'Distancia Caucsia')),
    distancia_villavicencio: num(get('Distancia Villavicencio', 'Distacia Villavicencio')),
    distancia_minima: num(get('Distacia Minima', 'Distancia Minima', 'Distancia Mínima')),
    sede: get('Sede', 'sede') || null,
    asesor_email: asesor2.includes('@') ? asesor2 : null,
    asesor_secundario_email:
      asesorCol.includes('@') && asesorCol.toLowerCase() !== asesor2.toLowerCase()
        ? asesorCol
        : null,
    marca: get('Marca', 'marca') || 'SIN MARCA',
    tipo_mtto: num(get('Tipo Mtto', 'tipo_mtto')),
    numero_serie: get('N° serie', 'Nº serie', 'numero_serie') || serie || null,
    tipo_oportunidad: get('Tipo Cliente', 'tipo_oportunidad') || null,
    estado: get('Estado', 'estado') || 'Pendiente',
    estado2: get('Estado2', 'estado2') || null,
    detalle: get('Detalle', 'detalle') || null,
    observaciones: get('Observaciones', 'observaciones') || null,
    reenviar_correo: ['true', '1', 'si', 'sí', 'verdadero'].includes(
      get('Reenviar Correo', 'reenviar_correo').toLowerCase()
    ),
    mes_creado: mesCreado,
    correo_enviado: correo || null,
    anio,
    tipo_maquina: get('TipoDeMaquina', 'Tipo de Maquina', 'tipo_maquina') || null,
    created_by: createdBy,
  };
}

function mapCpp(row: Record<string, string>, createdBy: string) {
  return {
    legacy_no: toNumber(getField(row, 'No', 'legacy_no'), 0) || null,
    ref_sap: getField(row, 'RefSAP', 'ref_sap', 'REF SAP'),
    marca: getField(row, 'Marca', 'marca'),
    nombre: getField(row, 'Nombre', 'nombre'),
    cantidad: toNumber(getField(row, 'Cantidad', 'cantidad'), 1),
    frecuencia: getField(row, 'Frecuencia', 'frecuencia') || null,
    medida: getField(row, 'Medida', 'medida') || null,
    comentario: getField(row, 'Comentario', 'comentario') || null,
    modelo: getField(row, 'Modelo', 'modelo'),
    parte: getField(row, 'Parte', 'parte', 'componente') || 'MTTO PREVENTIVO',
    tipo: getField(row, 'Tipo', 'tipo', 'subtipo') || 'FILTRACION',
    imagen_url: getField(row, 'ImagenUrl', 'imagen_url') || null,
    recomendacion: getField(row, 'Recomendación', 'Recomendacion', 'recomendacion') || null,
    equivalencia1: getField(row, 'EQUIVALENCIA1', 'equivalencia1') || null,
    equivalencia2: getField(row, 'EQUIVALENCIA2', 'equivalencia2') || null,
    equivalencia3: getField(row, 'EQUIVALENCIA3', 'equivalencia3') || null,
    referencia_catalogo_original: getField(row, 'REFERENCIACATALOGOORIGINAL', 'referencia_catalogo_original') || null,
    created_by: createdBy,
    updated_by: createdBy,
    activo: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: perfil } = await admin
      .from('perfiles')
      .select('rol, email, nombre')
      .eq('id', userData.user.id)
      .maybeSingle();

    const rol = perfil?.rol ?? 'visualizador';
    if (!['administrador', 'coordinador'].includes(rol)) {
      return new Response(JSON.stringify({ error: 'Sin permisos de importación' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as ImportRequest;
    if (!body.modulo || !body.fileName || !body.contentBase64) {
      return new Response(JSON.stringify({ error: 'Payload incompleto' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ext = body.fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'txt', 'xlsx', 'xls'].includes(ext)) {
      return new Response(
        JSON.stringify({
          error: 'Formato no soportado. Use archivos .xlsx, .xls o .csv',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let rows: Record<string, string>[];
    try {
      rows = parseFile(body.fileName, body.contentBase64);
    } catch (parseErr) {
      return new Response(
        JSON.stringify({
          error: parseErr instanceof Error ? parseErr.message : 'No se pudo leer el archivo',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'El archivo no contiene filas de datos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const createdBy = perfil?.email ?? userData.user.email ?? 'import';

    let recordsOk = 0;
    let recordsError = 0;
    let duplicates = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const batchInsert: Record<string, unknown>[] = [];
    const batchUpdate: Array<{ legacy_id: number; row: Record<string, unknown> }> = [];

    rows.forEach((row, index) => {
      try {
        if (body.modulo === 'calculadora') {
          const mapped = mapTempario(row, createdBy);
          if (!mapped.marca || !mapped.modelo || !mapped.item) {
            throw new Error('Marca, Modelo e Item son obligatorios');
          }
          if (mapped.legacy_id) {
            batchUpdate.push({ legacy_id: mapped.legacy_id, row: mapped });
          } else {
            const { legacy_id: _omit, ...insertRow } = mapped;
            batchInsert.push(insertRow);
          }
        } else if (body.modulo === 'proyectados') {
          const mapped = mapTelemetria(row, createdBy);
          if (!mapped.serie) {
            throw new Error('Serie es obligatoria');
          }
          batchInsert.push(mapped);
        } else {
          const mapped = mapCpp(row, createdBy);
          if (!mapped.ref_sap || !mapped.marca || !mapped.nombre || !mapped.modelo) {
            throw new Error('RefSAP, Marca, Nombre y Modelo son obligatorios');
          }
          batchInsert.push(mapped);
        }
      } catch (err) {
        recordsError += 1;
        errors.push({
          row: index + 2,
          message: err instanceof Error ? err.message : 'Error de validación',
        });
      }
    });

    const table =
      body.modulo === 'calculadora'
        ? 'temparios_mantenimiento'
        : body.modulo === 'proyectados'
          ? 'telemetria_equipos'
          : 'cpp_catalogo';

    if (body.modulo === 'calculadora' && batchUpdate.length > 0) {
      for (const item of batchUpdate) {
        const { data: existing, error: findErr } = await admin
          .from(table)
          .select('id')
          .eq('legacy_id', item.legacy_id)
          .maybeSingle();

        if (findErr) {
          recordsError += 1;
          errors.push({ row: 0, message: findErr.message });
          continue;
        }

        if (existing?.id) {
          const { legacy_id: _lid, created_by: _cb, ...updatePayload } = item.row;
          const { error: updErr } = await admin
            .from(table)
            .update({
              ...updatePayload,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updErr) {
            recordsError += 1;
            errors.push({ row: 0, message: updErr.message });
          } else {
            recordsOk += 1;
            duplicates += 1;
          }
        } else {
          const { error: insErr } = await admin.from(table).insert(item.row);
          if (insErr) {
            recordsError += 1;
            errors.push({ row: 0, message: insErr.message });
          } else {
            recordsOk += 1;
          }
        }
      }
    }

    if (batchInsert.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < batchInsert.length; i += chunkSize) {
        const chunk = batchInsert.slice(i, i + chunkSize);
        const { error: insertError } = await admin.from(table).insert(chunk);
        if (insertError) {
          for (const row of chunk) {
            const { error: rowErr } = await admin.from(table).insert(row);
            if (rowErr) {
              recordsError += 1;
              errors.push({ row: 0, message: rowErr.message });
            } else {
              recordsOk += 1;
            }
          }
        } else {
          recordsOk += chunk.length;
        }
      }
    }

    const { data: importRow } = await admin
      .from('importaciones')
      .insert({
        modulo: body.modulo,
        nombre_archivo: body.fileName,
        tipo_archivo: ext,
        registros_total: rows.length,
        registros_ok: recordsOk,
        registros_error: recordsError,
        duplicados: duplicates,
        estado: recordsError > 0 ? (recordsOk > 0 ? 'parcial' : 'fallido') : 'completado',
        errores_json: errors.slice(0, 50),
        user_id: userData.user.id,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return new Response(
      JSON.stringify({
        importId: importRow?.id,
        recordsOk,
        recordsError,
        duplicates,
        total: rows.length,
        errors: errors.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
