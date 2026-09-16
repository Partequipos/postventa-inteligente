/**
 * Parseo / mapeo del Excel mensual de telemetría → entidades + telemetria_equipos.
 * Encabezados reales empiezan en "Nombre del cliente".
 */

export const TELEMETRIA_EXCEL_COLUMNS = [
  'Nombre del cliente',
  'email',
  'Nit',
  'Telefono',
  'Serie.',
  'Modelo',
  'Horometro',
  'Promedio_h',
  'Ciudad',
  'Última fecha/hora de común',
  'Latitud',
  'Longitud',
  'Dias Primer Mtto',
  'Proximo Primer Mtto',
  'Dias Segundo Mtto',
  'Proximo Segundo Mtto',
  'Dias Tercer Mtto',
  'Proximo Tercer Mtto',
  'Fecha Primer Mtto',
  'Fecha Segundo Mtto',
  'Fecha Tercer Mtto',
  'Distancia Bogota',
  'Distancia Medellin',
  'Distacia Barranquilla',
  'Distancia Monteria',
  'Distancia Cali',
  'Distancia Bucaramanga',
  'Distancia Ibague',
  'Distancia Istmina',
  'Distancia Caucasia',
  'Distancia Villavicencio',
  'Distacia Minima',
  'Sede',
  'ASESOR',
  'Asesor2',
  'Marca',
  'Tipo Mtto',
  'N° serie',
  'Tipo Cliente',
  'Estado',
  'Estado2',
  'Detalle',
  'Observaciones',
  'Reenviar Correo',
  'Creado',
  'MesCreado',
  'Correo',
  'Año',
  'TipoDeMaquina',
] as const;

export const TELEMETRIA_TEMPLATE_FILENAME = 'plantilla_telemetria_proyectados.xlsx';

export interface TelemetriaMappedRow {
  titulo: string | null;
  email: string | null;
  nit: string | null;
  telefono: string | null;
  serie: string;
  modelo: string;
  horometro: number;
  promedio_h: number | null;
  ciudad: string | null;
  ultima_fecha_comunicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  dias_primer_mtto: number | null;
  proximo_primer_mtto: number | null;
  dias_segundo_mtto: number | null;
  proximo_segundo_mtto: number | null;
  dias_tercer_mtto: number | null;
  proximo_tercer_mtto: number | null;
  fecha_primer_mtto: string | null;
  fecha_segundo_mtto: string | null;
  fecha_tercer_mtto: string | null;
  distancia_bogota: number | null;
  distancia_medellin: number | null;
  distancia_barranquilla: number | null;
  distancia_monteria: number | null;
  distancia_cali: number | null;
  distancia_bucaramanga: number | null;
  distancia_ibague: number | null;
  distancia_istmina: number | null;
  distancia_caucasia: number | null;
  distancia_villavicencio: number | null;
  distancia_minima: number | null;
  sede: string | null;
  asesor_email: string | null;
  /** Valor de columna Excel ASESOR (si es email distinto de Asesor2). */
  asesor_secundario_email: string | null;
  marca: string;
  tipo_mtto: number | null;
  numero_serie: string | null;
  tipo_oportunidad: string | null;
  estado: string;
  estado2: string | null;
  detalle: string | null;
  observaciones: string | null;
  reenviar_correo: boolean;
  mes_creado: string;
  correo_enviado: string | null;
  anio: number;
  tipo_maquina: string | null;
  created_by: string;
}

export interface TelemetriaParseResult {
  rows: TelemetriaMappedRow[];
  errors: Array<{ row: number; message: string }>;
  /** Filas vacías o sin datos de equipo (omitidas sin error). */
  skipped: number;
  /** Total de filas de datos leídas del archivo (sin encabezado). */
  rawTotal: number;
  /** Fila Excel (1-based) donde están los encabezados. */
  headerRow: number;
}

interface TelemetriaRawSheetRow {
  excelRow: number;
  data: Record<string, string>;
}

function compactHeader(header: string): string {
  return normalizeHeader(header).replace(/[\s_.]+/g, '');
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) && Math.abs(value) >= 1e6) {
      return value.toFixed(0);
    }
    return String(value);
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function normalizeSerieValue(raw: string): string | null {
  const v = cleanCell(raw);
  if (!v) return null;
  if (/^\d+(\.0+)?$/.test(v)) {
    return String(Math.trunc(Number(v)));
  }
  return v;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function getField(row: Record<string, string>, ...aliases: string[]): string {
  const wanted = new Set(aliases.map(compactHeader));
  for (const alias of aliases) {
    const direct = row[alias];
    if (direct != null && String(direct).trim()) return String(direct).trim();
  }
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(compactHeader(key)) && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function findTelemetriaHeaderRowIndex(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 50); i++) {
    const cells = (matrix[i] ?? []).map((cell) => compactHeader(cellToString(cell)));
    const nonEmptyHeaders = cells.filter(Boolean).length;
    if (nonEmptyHeaders < 5) continue;

    if (cells.some((c) => c === 'nombredelcliente' || c.includes('nombredelcliente'))) {
      return i;
    }
    const markers = ['serie', 'modelo', 'marca', 'horometro', 'nombredelcliente'];
    const score = markers.filter((m) => cells.some((c) => c.includes(m))).length;
    if (score >= 4) return i;
  }
  return -1;
}

function matrixToRows(matrix: unknown[][], headerIdx: number): TelemetriaRawSheetRow[] {
  const headers = (matrix[headerIdx] ?? []).map((h) => cellToString(h).trim());
  const rows: TelemetriaRawSheetRow[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const data: Record<string, string> = {};
    let hasData = false;

    headers.forEach((header, col) => {
      if (!header) return;
      const value = cellToString(line[col]).trim();
      if (value) hasData = true;
      data[header] = value;
    });

    if (hasData) {
      rows.push({ excelRow: r + 1, data });
    }
  }

  return rows;
}

function resolveSerie(row: Record<string, string>): string {
  const candidates = [
    getField(row, 'Serie.', 'Serie', 'serie', 'SERIE', 'Serial', 'Serial Number'),
    getField(
      row,
      'N° serie',
      'Nº serie',
      'No serie',
      'No. serie',
      'Numero serie',
      'Número de serie',
      'numero_serie',
      'N° Serie'
    ),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSerieValue(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function resolveModelo(row: Record<string, string>): string {
  return (
    cleanCell(getField(row, 'Modelo', 'modelo', 'MODELO', 'TipoDeMaquina', 'Tipo de Maquina')) ??
    ''
  );
}

function resolveMarca(row: Record<string, string>): string {
  return cleanCell(getField(row, 'Marca', 'marca', 'MARCA', 'Brand')) ?? '';
}

function hasEquipmentData(row: Record<string, string>): boolean {
  if (resolveSerie(row)) return true;
  if (resolveModelo(row)) return true;
  if (resolveMarca(row)) return true;
  const cliente = cleanCell(
    getField(row, 'Nombre del cliente', 'Nombre del Cliente', 'Título', 'Titulo', 'titulo')
  );
  const horometro = getField(row, 'Horometro', 'Horómetro', 'horometro');
  return Boolean(cliente || cleanCell(horometro));
}

/** Trata #N/D / N/D / vacío como ausente. */
export function cleanCell(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (upper === '#N/D' || upper === 'N/D' || upper === 'ND' || upper === '-' || upper === 'NULL') {
    return null;
  }
  return v;
}

/** Límites alineados a NUMERIC(18, *) en BD (script 22). */
const MAX_ABS_GENERAL = 1e12;
const MAX_ABS_COORD = 180;
const MAX_ABS_HOROMETRO = 1e12;

function toNumber(raw: string, fallback = 0): number {
  if (!raw) return fallback;
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parsea número y lo deja dentro del rango PostgreSQL NUMERIC.
 * Valores extremos / basura de Excel → null (no aborta la fila).
 */
function toBoundedNumberOrNull(
  raw: string,
  maxAbs: number,
  decimals?: number
): number | null {
  const v = cleanCell(raw);
  if (v == null) return null;
  const n = toNumber(v, Number.NaN);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return null;
  if (decimals == null) return n;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function toNumberOrNull(raw: string): number | null {
  return toBoundedNumberOrNull(raw, MAX_ABS_GENERAL, 6);
}

function toHorometro(raw: string): number {
  const n = toBoundedNumberOrNull(raw, MAX_ABS_HOROMETRO, 3);
  return n != null && n >= 0 ? n : 0;
}

function toCoordOrNull(raw: string): number | null {
  return toBoundedNumberOrNull(raw, MAX_ABS_COORD, 10);
}

function toTipoMttoOrNull(raw: string): number | null {
  const n = toBoundedNumberOrNull(raw, 2_147_483_647, 0);
  if (n == null) return null;
  return Math.trunc(n);
}

function parseBool(raw: string): boolean {
  const v = (cleanCell(raw) ?? '').toLowerCase();
  return v === 'true' || v === 'verdadero' || v === '1' || v === 'si' || v === 'sí' || v === 'x';
}

/** Fecha Excel DD/MM/YYYY o ISO → YYYY-MM-DD */
function parseDateOnly(raw: string): string | null {
  const v = cleanCell(raw);
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);

  const m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${mo}-${d}`;
  }
  const dt = Date.parse(v);
  if (!Number.isNaN(dt)) return new Date(dt).toISOString().slice(0, 10);
  return null;
}

/** Fecha/hora → ISO o null */
function parseDateTime(raw: string): string | null {
  const v = cleanCell(raw);
  if (!v) return null;
  const dateOnly = parseDateOnly(v);
  if (dateOnly && !v.includes(':') && v.length <= 10) {
    return `${dateOnly}T00:00:00.000Z`;
  }
  // DD/MM/YYYY H:mm
  const m = v.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] ?? '0').padStart(2, '0')}:${(m[5] ?? '0').padStart(2, '0')}:${(m[6] ?? '0').padStart(2, '0')}.000Z`;
    return iso;
  }
  const dt = Date.parse(v);
  if (!Number.isNaN(dt)) return new Date(dt).toISOString();
  return dateOnly ? `${dateOnly}T00:00:00.000Z` : null;
}

function isValidEmail(value: string | null): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const ENGLISH_MONTHS = [
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
] as const;

const MONTH_ALIAS_TO_ENGLISH: Record<string, (typeof ENGLISH_MONTHS)[number]> = {
  january: 'January',
  febrero: 'February',
  february: 'February',
  marzo: 'March',
  march: 'March',
  abril: 'April',
  april: 'April',
  mayo: 'May',
  may: 'May',
  junio: 'June',
  june: 'June',
  julio: 'July',
  july: 'July',
  agosto: 'August',
  august: 'August',
  septiembre: 'September',
  setiembre: 'September',
  september: 'September',
  octubre: 'October',
  october: 'October',
  noviembre: 'November',
  november: 'November',
  diciembre: 'December',
  december: 'December',
  enero: 'January',
};

/** Normaliza MesCreado (EN/ES/número) al formato Power Apps en inglés. */
export function resolveMesCreado(raw: string | null | undefined): string {
  const v = cleanCell(raw);
  if (v) {
    const compact = v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (MONTH_ALIAS_TO_ENGLISH[compact]) return MONTH_ALIAS_TO_ENGLISH[compact];
    const asNum = Number(compact);
    if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 12) {
      return ENGLISH_MONTHS[asNum - 1];
    }
  }
  return ENGLISH_MONTHS[new Date().getMonth()];
}

export function resolveAnio(raw: string | null | undefined): number {
  const n = toBoundedNumberOrNull(raw ?? '', 2100, 0);
  if (n != null && n >= 2000 && n <= 2100) return Math.trunc(n);
  return new Date().getFullYear();
}

/** Si MesCreado/Año vienen vacíos, intenta derivarlos de la columna Creado. */
function resolvePeriodFromCreado(raw: string | null | undefined): {
  mes: string | null;
  anio: number | null;
} {
  const dateOnly = parseDateOnly(raw ?? '');
  if (!dateOnly) return { mes: null, anio: null };
  const dt = new Date(`${dateOnly}T12:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return { mes: null, anio: null };
  return {
    mes: ENGLISH_MONTHS[dt.getUTCMonth()],
    anio: dt.getUTCFullYear(),
  };
}

export function mapTelemetriaSheetRow(
  row: Record<string, string>,
  createdBy: string
): TelemetriaMappedRow {
  const serie = resolveSerie(row);
  let modelo = resolveModelo(row);
  let marca = resolveMarca(row);

  if (!serie) {
    throw new Error('Serie es obligatoria');
  }
  if (!modelo) modelo = 'SIN MODELO';
  if (!marca) marca = 'SIN MARCA';

  const emailCliente = cleanCell(getField(row, 'email', 'Email', 'E-mail'));
  const correoFlag = cleanCell(getField(row, 'Correo', 'correo_enviado'));
  // Correo real del asesor de servicio = columna Excel "Asesor2" / "ASESOR 2"
  // (la columna "ASESOR" no es el email operativo; se guarda solo como secundario si es email).
  const asesor2Raw = cleanCell(
    getField(row, 'Asesor2', 'ASESOR 2', 'Asesor 2', 'ASESOR2', 'asesor2')
  );
  const asesorColRaw = cleanCell(getField(row, 'ASESOR', 'Asesor'));

  const asesorEmail = isValidEmail(asesor2Raw) ? asesor2Raw : null;
  const asesorSecundario =
    isValidEmail(asesorColRaw) &&
    asesorColRaw.toLowerCase() !== (asesorEmail ?? '').toLowerCase()
      ? asesorColRaw
      : null;

  const numeroSerie =
    cleanCell(getField(row, 'N° serie', 'Nº serie', 'numero_serie')) ?? serie;

  const mesRaw = cleanCell(getField(row, 'MesCreado', 'Mes Creado', 'mes_creado', 'Mes'));
  const anioRaw = cleanCell(getField(row, 'Año', 'Anio', 'anio', 'Year'));
  const creadoRaw = cleanCell(getField(row, 'Creado', 'creado', 'Created'));
  const fromCreado = resolvePeriodFromCreado(creadoRaw);

  const mes_creado = mesRaw
    ? resolveMesCreado(mesRaw)
    : fromCreado.mes ?? resolveMesCreado(null);
  const anio =
    anioRaw && toBoundedNumberOrNull(anioRaw, 2100, 0) != null
      ? resolveAnio(anioRaw)
      : fromCreado.anio ?? resolveAnio(null);

  return {
    titulo: cleanCell(
      getField(row, 'Nombre del cliente', 'Nombre del Cliente', 'Título', 'Titulo', 'titulo')
    ),
    email: isValidEmail(emailCliente) ? emailCliente : null,
    nit: cleanCell(getField(row, 'Nit', 'NIT', 'nit')),
    telefono: cleanCell(getField(row, 'Telefono', 'Teléfono', 'telefono')),
    serie,
    modelo,
    horometro: toHorometro(getField(row, 'Horometro', 'Horómetro', 'horometro')),
    promedio_h: toNumberOrNull(getField(row, 'Promedio_h', 'Promedio h', 'promedio_h')),
    ciudad: cleanCell(getField(row, 'Ciudad', 'ciudad')),
    ultima_fecha_comunicacion: parseDateTime(
      getField(
        row,
        'Última fecha/hora de común',
        'Ultima fecha/hora de comun',
        'Última fecha/hora de comun',
        'ultima_fecha_comunicacion'
      )
    ),
    latitud: toCoordOrNull(getField(row, 'Latitud', 'latitud')),
    longitud: toCoordOrNull(getField(row, 'Longitud', 'longitud')),
    dias_primer_mtto: toNumberOrNull(getField(row, 'Dias Primer Mtto', 'dias_primer_mtto')),
    proximo_primer_mtto: toNumberOrNull(
      getField(row, 'Proximo Primer Mtto', 'Próximo Primer Mtto', 'proximo_primer_mtto')
    ),
    dias_segundo_mtto: toNumberOrNull(getField(row, 'Dias Segundo Mtto', 'dias_segundo_mtto')),
    proximo_segundo_mtto: toNumberOrNull(
      getField(row, 'Proximo Segundo Mtto', 'Próximo Segundo Mtto', 'proximo_segundo_mtto')
    ),
    dias_tercer_mtto: toNumberOrNull(getField(row, 'Dias Tercer Mtto', 'dias_tercer_mtto')),
    proximo_tercer_mtto: toNumberOrNull(
      getField(row, 'Proximo Tercer Mtto', 'Próximo Tercer Mtto', 'proximo_tercer_mtto')
    ),
    fecha_primer_mtto: parseDateOnly(getField(row, 'Fecha Primer Mtto', 'fecha_primer_mtto')),
    fecha_segundo_mtto: parseDateOnly(getField(row, 'Fecha Segundo Mtto', 'fecha_segundo_mtto')),
    fecha_tercer_mtto: parseDateOnly(getField(row, 'Fecha Tercer Mtto', 'fecha_tercer_mtto')),
    distancia_bogota: toNumberOrNull(getField(row, 'Distancia Bogota', 'Distancia Bogotá')),
    distancia_medellin: toNumberOrNull(getField(row, 'Distancia Medellin', 'Distancia Medellín')),
    distancia_barranquilla: toNumberOrNull(
      getField(row, 'Distacia Barranquilla', 'Distancia Barranquilla')
    ),
    distancia_monteria: toNumberOrNull(getField(row, 'Distancia Monteria', 'Distancia Montería')),
    distancia_cali: toNumberOrNull(getField(row, 'Distancia Cali')),
    distancia_bucaramanga: toNumberOrNull(getField(row, 'Distancia Bucaramanga')),
    distancia_ibague: toNumberOrNull(getField(row, 'Distancia Ibague', 'Distancia Ibagué')),
    distancia_istmina: toNumberOrNull(getField(row, 'Distancia Istmina')),
    distancia_caucasia: toNumberOrNull(
      getField(row, 'Distancia Caucasia', 'Distacia Caucasia', 'Distancia Caucsia')
    ),
    distancia_villavicencio: toNumberOrNull(
      getField(row, 'Distancia Villavicencio', 'Distacia Villavicencio')
    ),
    distancia_minima: toNumberOrNull(getField(row, 'Distacia Minima', 'Distancia Minima', 'Distancia Mínima')),
    sede: cleanCell(getField(row, 'Sede', 'sede')),
    asesor_email: asesorEmail,
    asesor_secundario_email: asesorSecundario,
    marca,
    tipo_mtto: toTipoMttoOrNull(getField(row, 'Tipo Mtto', 'tipo_mtto')),
    numero_serie: numeroSerie,
    tipo_oportunidad: cleanCell(getField(row, 'Tipo Cliente', 'tipo_oportunidad', 'Tipo Oportunidad')),
    estado: cleanCell(getField(row, 'Estado', 'estado')) ?? 'Pendiente',
    estado2: cleanCell(getField(row, 'Estado2', 'estado2')),
    detalle: cleanCell(getField(row, 'Detalle', 'detalle')),
    observaciones: cleanCell(getField(row, 'Observaciones', 'observaciones')),
    reenviar_correo: parseBool(getField(row, 'Reenviar Correo', 'reenviar_correo')),
    mes_creado,
    correo_enviado: correoFlag,
    anio,
    tipo_maquina: cleanCell(getField(row, 'TipoDeMaquina', 'Tipo de Maquina', 'tipo_maquina')),
    created_by: createdBy,
  };
}

/** Clave de periodo (consultas / ranking). Ya no es unique en BD. */
export function telemetriaPeriodKey(row: Pick<TelemetriaMappedRow, 'serie' | 'mes_creado' | 'anio'>): string {
  return `${row.serie}|${(row.mes_creado ?? '').toLowerCase()}|${row.anio ?? 0}`;
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Identifica la máquina en maestros (marca + modelo + serie). La serie es la clave única en BD. */
export function maquinaIdentityKey(
  row: Pick<TelemetriaMappedRow, 'marca' | 'modelo' | 'serie'>
): string {
  return `${normalizeIdentityPart(row.marca)}|${normalizeIdentityPart(row.modelo)}|${normalizeIdentityPart(row.serie)}`;
}

/**
 * Clave de oportunidad para upsert.
 * Incluye fecha de primer MTTO para permitir varios servicios del mismo tipo
 * (p. ej. 250 h + 250 h) en el mismo mes.
 */
export function telemetriaImportRowKey(
  row: Pick<TelemetriaMappedRow, 'serie' | 'mes_creado' | 'anio' | 'tipo_mtto' | 'fecha_primer_mtto'>
): string {
  const tipo = row.tipo_mtto ?? '∅';
  const fecha = row.fecha_primer_mtto ?? '∅';
  return `${row.serie}|${row.mes_creado}|${row.anio}|${tipo}|${fecha}`;
}

export async function parseTelemetriaFile(file: File): Promise<TelemetriaParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let rawRows: TelemetriaRawSheetRow[] = [];
  let headerRow = 1;

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    const parsed = parseCsvWithHeader(text);
    rawRows = parsed.rows;
    headerRow = parsed.headerRow;
  } else if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return {
        rows: [],
        errors: [{ row: 0, message: 'Excel sin hojas' }],
        skipped: 0,
        rawTotal: 0,
        headerRow: 0,
      };
    }
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: true,
    }) as unknown[][];

    const headerIdx = findTelemetriaHeaderRowIndex(matrix);
    if (headerIdx < 0) {
      return {
        rows: [],
        errors: [
          {
            row: 0,
            message:
              'No se encontró la fila de encabezados (Nombre del cliente / Serie / Modelo / Marca). Use la plantilla oficial.',
          },
        ],
        skipped: 0,
        rawTotal: 0,
        headerRow: 0,
      };
    }

    headerRow = headerIdx + 1;
    rawRows = matrixToRows(matrix, headerIdx);
  } else {
    return {
      rows: [],
      errors: [{ row: 0, message: 'Formato no soportado. Use .xlsx, .xls o .csv' }],
      skipped: 0,
      rawTotal: 0,
      headerRow: 0,
    };
  }

  const rows: TelemetriaMappedRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  let skipped = 0;

  for (const { excelRow, data } of rawRows) {
    if (!hasEquipmentData(data)) {
      skipped += 1;
      continue;
    }

    if (!resolveSerie(data)) {
      skipped += 1;
      continue;
    }

    try {
      rows.push(mapTelemetriaSheetRow(data, 'import'));
    } catch (err) {
      errors.push({
        row: excelRow,
        message: err instanceof Error ? err.message : 'Fila inválida',
      });
    }
  }

  return {
    rows,
    errors,
    skipped,
    rawTotal: rawRows.length,
    headerRow,
  };
}

function parseCsvWithHeader(text: string): { rows: TelemetriaRawSheetRow[]; headerRow: number } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], headerRow: 1 };

  const matrix = lines.map((line) => splitCsvLine(line));
  const headerIdx = findTelemetriaHeaderRowIndex(matrix);
  const resolvedHeaderIdx = headerIdx >= 0 ? headerIdx : 0;

  return {
    rows: matrixToRows(matrix, resolvedHeaderIdx),
    headerRow: resolvedHeaderIdx + 1,
  };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

export async function downloadTelemetriaExcelTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const headers = [...TELEMETRIA_EXCEL_COLUMNS];
  const example = headers.map((h) => {
    switch (h) {
      case 'Nombre del cliente':
        return 'EMPRESA EJEMPLO S.A.S';
      case 'email':
        return 'contacto@ejemplo.com';
      case 'Nit':
        return '900000000';
      case 'Telefono':
        return '3000000000';
      case 'Serie.':
        return 'SERIE-EJEMPLO-001';
      case 'Modelo':
        return 'ZX210LC-5B';
      case 'Horometro':
        return '250';
      case 'Promedio_h':
        return '5';
      case 'Ciudad':
        return 'Medellín,Antioquia,Colombia';
      case 'Última fecha/hora de común':
        return '01/08/2026';
      case 'Latitud':
        return '6.24';
      case 'Longitud':
        return '-75.57';
      case 'Dias Primer Mtto':
        return '30';
      case 'Proximo Primer Mtto':
        return '250';
      case 'Fecha Primer Mtto':
        return '01/09/2026';
      case 'Distancia Caucasia':
        return '120';
      case 'Distancia Villavicencio':
        return '95';
      case 'Distacia Minima':
        return '10';
      case 'Sede':
        return 'Medellín';
      case 'Asesor2':
        return 'centrodemonitoreo@partequipos.com';
      case 'Marca':
        return 'Hitachi';
      case 'Tipo Mtto':
        return '250';
      case 'N° serie':
        return 'SERIE-EJEMPLO-001';
      case 'Estado':
        return 'Pendiente';
      case 'Reenviar Correo':
        return 'FALSO';
      case 'MesCreado':
        return 'August';
      case 'Año':
        return '2026';
      case 'TipoDeMaquina':
        return 'Otro';
      default:
        return '';
    }
  });

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet['!cols'] = headers.map((h) => ({ wch: Math.min(28, Math.max(12, h.length + 2)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'TELEMETRIA');
  XLSX.writeFile(workbook, TELEMETRIA_TEMPLATE_FILENAME);
}
