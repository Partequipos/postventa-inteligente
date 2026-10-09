import type { TemparioTipoItem, MaintenanceFrequencyHours } from '@/types/database';
import { resolveModelo2, modelo2ToTipoCatalogo } from '@/lib/calculadora/tempario-classify';

const INTERVAL_FREQ: MaintenanceFrequencyHours[] = [250, 1000, 2000, 4000, 5000];
const PRIMERAS_FREQ: MaintenanceFrequencyHours[] = [50, 100, 250, 500, 2500];

function nearestFreq(raw: number, options: MaintenanceFrequencyHours[]): MaintenanceFrequencyHours {
  let best = options[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const f of options) {
    const diff = Math.abs(f - raw);
    if (diff < bestDiff) {
      best = f;
      bestDiff = diff;
    }
  }
  return best;
}

/** Separa “Primeras N horas” de la fórmula 250/1000/2000/4000/5000. */
export function parseFrecuenciaTempario(raw: string): {
  frecuencia_horas: MaintenanceFrequencyHours;
  frecuencia_grupo: 'intervalo' | 'primeras';
} {
  const text = raw.trim().toLowerCase();
  const hours = toNumber(raw, 250);
  const primeras = text.includes('primera');
  if (primeras) {
    const exact = PRIMERAS_FREQ.find((f) => f === hours);
    return {
      frecuencia_horas: exact ?? nearestFreq(hours, PRIMERAS_FREQ),
      frecuencia_grupo: 'primeras',
    };
  }
  const exactInterval = INTERVAL_FREQ.find((f) => f === hours);
  if (exactInterval) {
    return { frecuencia_horas: exactInterval, frecuencia_grupo: 'intervalo' };
  }
  if (hours === 50 || hours === 100 || hours === 500 || hours === 2500) {
    return { frecuencia_horas: hours, frecuencia_grupo: 'primeras' };
  }
  return { frecuencia_horas: nearestFreq(hours, INTERVAL_FREQ), frecuencia_grupo: 'intervalo' };
}

/**
 * Encabezados del Excel real TEMPARIOS (Power Apps / SharePoint).
 * Clasificación = columna Modelo2 → BD tipo_item.
 * Cantidad = unidad; Cantidad (Galones) = cantidad numérica.
 */
export const TEMPARIO_EXCEL_HEADERS = [
  'Marca',
  'Linea',
  'Modelo',
  'Modelo2',
  'Item',
  'Cantidad',
  'Cantidad (Galones)',
  'Frecuencia',
  'Aceite Homologado',
  'Referencia Genuina',
  'REF SAP DISPEL',
  'REF SAP ORIGINAl',
  'Referencia Stal',
  'Referencia Fleetguard',
  'Referencia Donalson',
  'Tiempo',
  'Procedimiento',
  'Observaciones',
  'ID',
  'TipoItem',
  'Modificado',
  'Creado',
  'Creado por',
  'Modificado por',
] as const;

export { normalizeTipoItem, normalizeModelo2 } from '@/lib/calculadora/tempario-classify';

export interface TemparioImportRow {
  legacy_id: number | null;
  marca: string;
  linea: string;
  modelo: string;
  /** Valor Excel Modelo2 */
  tipo_item: TemparioTipoItem;
  tipo_catalogo: string | null;
  item: string;
  unidad_medida: string;
  cantidad: number;
  frecuencia_horas: MaintenanceFrequencyHours;
  frecuencia_grupo: 'intervalo' | 'primeras';
  aceite_homologado: string | null;
  referencia_genuina: string | null;
  ref_sap_dispel: string | null;
  ref_sap_original: string | null;
  referencia_stal: string | null;
  referencia_fleetguard: string | null;
  referencia_donaldson: string | null;
  tiempo_horas: number;
  procedimiento: string | null;
  avisos_claves: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string;
  updated_by: string;
  activo: boolean;
}

export interface TemparioImportParseResult {
  rows: TemparioImportRow[];
  errors: Array<{ row: number; message: string }>;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Header sin espacios: "Modelo 2" → "modelo2" */
function compactHeader(header: string): string {
  return normalizeHeader(header).replace(/[\s_-]+/g, '');
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return String(value).trim();
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [normalizeHeader(k), v] as const);
  for (const key of keys) {
    const target = normalizeHeader(key);
    const found = normalizedEntries.find(([k]) => k === target);
    if (found && found[1] !== '') return found[1].trim();
  }
  return '';
}

/**
 * Única fuente de clasificación del Excel: columna Modelo2.
 * No usar TipoItem ni "Tipo de item" (están mal / son catálogo).
 */
export function getModelo2Tipo(row: Record<string, string>): string {
  const exact = getField(row, 'Modelo2', 'modelo2', 'Modelo 2', 'MODELO2');
  if (exact) return exact;

  for (const [key, value] of Object.entries(row)) {
    if (compactHeader(key) === 'modelo2' && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

export function rowHasModelo2Column(row: Record<string, string>): boolean {
  return Object.keys(row).some((k) => compactHeader(k) === 'modelo2');
}

/** Cantidades/horas: acepta 1,5 / 1.5 / 1.234,56 / 250 */
function toNumber(value: string, fallback = 0): number {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;

  let normalized = trimmed.replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const n = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Fechas del Excel: "7/31/2024 7:58 AM", ISO, o serial.
 */
export function parseExcelDateTime(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000) {
    // Serial Excel → días desde 1899-12-30
    const utc = Date.UTC(1899, 11, 30) + asNumber * 86400000;
    return new Date(utc).toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  // MM/DD/YYYY h:mm AM/PM
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i.exec(
    trimmed
  );
  if (m) {
    let hours = m[4] ? Number(m[4]) : 0;
    const minutes = m[5] ? Number(m[5]) : 0;
    const ampm = (m[6] ?? '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hours, minutes);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
}

function textOrNull(value: string): string | null {
  const v = value.trim();
  if (!v || /^n\/?a$/i.test(v)) return null;
  return v;
}

function rowHasAnyHeader(row: Record<string, string>, ...keys: string[]): boolean {
  const norms = new Set(Object.keys(row).map((k) => normalizeHeader(k)));
  return keys.some((k) => norms.has(normalizeHeader(k)));
}

/**
 * Excel real:
 *  - Cantidad = unidad (Unidad / Galon / N/A)
 *  - Cantidad (Galones) = cantidad numérica
 * Legacy:
 *  - Unidad de medida + Cantidad numérica
 */
function resolveUnidadCantidad(row: Record<string, string>): {
  unidad: string;
  cantidad: number;
} {
  const hasGalones = rowHasAnyHeader(row, 'Cantidad (Galones)', 'Cantidad Galones');
  const cantCol = getField(row, 'Cantidad', 'cantidad');
  const galCol = getField(row, 'Cantidad (Galones)', 'Cantidad Galones', 'cantidad_galones');
  const unidadLegacy = getField(row, 'Unidad de medida', 'unidad_medida');

  if (hasGalones) {
    const unidad =
      cantCol && !/^n\/?a$/i.test(cantCol)
        ? cantCol
        : unidadLegacy || 'Unidad';
    return {
      unidad: /^n\/?a$/i.test(unidad) ? 'N/A' : unidad,
      cantidad: toNumber(galCol, 0),
    };
  }

  const asNum = toNumber(cantCol, Number.NaN);
  if (Number.isFinite(asNum) && cantCol !== '' && !/[a-záéíóúñ]/i.test(cantCol)) {
    return { unidad: unidadLegacy || 'Unidad', cantidad: asNum };
  }

  return {
    unidad: unidadLegacy || cantCol || 'Unidad',
    cantidad: toNumber(galCol, toNumber(cantCol, 0)),
  };
}

/**
 * Mapea una fila del Excel TEMPARIOS al registro de BD.
 *
 * Excel Modelo2 → BD tipo_item  y  BD tipo_catalogo
 *   Repuesto→Filtro | Fluido→Aceite | Actividad→Actividad | Observacion→Observacion
 */
export function mapTemparioSheetRow(
  row: Record<string, string>,
  createdBy: string
): TemparioImportRow {
  const tipoRaw = getModelo2Tipo(row);
  if (!tipoRaw) {
    throw new Error(
      'Falta Modelo2. Debe indicar Actividad, Repuesto, Fluido u Observacion.'
    );
  }

  const tipoItem = resolveModelo2(tipoRaw);
  const tipoCatalogo = modelo2ToTipoCatalogo(tipoItem);
  const itemName = getField(row, 'Item', 'item', 'Nombre');
  const { unidad, cantidad } = resolveUnidadCantidad(row);

  const frecuencia = parseFrecuenciaTempario(
    getField(row, 'Frecuencia', 'Frecuencia (horas)', 'frecuencia_horas')
  );
  const legacyRaw = getField(row, 'ID', 'Id', 'legacy_id', 'id_legacy');
  const legacyParsed = legacyRaw ? Math.trunc(toNumber(legacyRaw, 0)) : 0;
  const legacyId = legacyParsed > 0 ? legacyParsed : null;

  const creadoPor =
    textOrNull(getField(row, 'Creado por', 'created_by', 'Creado Por')) ?? createdBy;
  const modificadoPor =
    textOrNull(getField(row, 'Modificado por', 'updated_by', 'Modificado Por')) ?? createdBy;

  const creado = parseExcelDateTime(getField(row, 'Creado', 'created_at', 'Fecha creado'));
  const modificado = parseExcelDateTime(
    getField(row, 'Modificado', 'updated_at', 'Fecha modificado')
  );

  const procedimientoRaw = getField(row, 'Procedimiento', 'procedimiento');
  const avisosRaw = getField(row, 'Observaciones', 'Avisos Claves', 'avisos_claves');

  return {
    legacy_id: legacyId,
    marca: getField(row, 'Marca', 'marca'),
    linea: getField(row, 'Linea', 'Línea', 'linea') || '',
    modelo: getField(row, 'Modelo', 'modelo'),
    tipo_item: tipoItem,
    tipo_catalogo: tipoCatalogo,
    item: itemName,
    unidad_medida: unidad || 'Unidad',
    cantidad,
    frecuencia_horas: frecuencia.frecuencia_horas,
    frecuencia_grupo: frecuencia.frecuencia_grupo,
    aceite_homologado: textOrNull(getField(row, 'Aceite Homologado', 'aceite_homologado')),
    referencia_genuina: textOrNull(getField(row, 'Referencia Genuina', 'referencia_genuina')),
    ref_sap_dispel: textOrNull(getField(row, 'REF SAP DISPEL', 'ref_sap_dispel')),
    ref_sap_original: textOrNull(
      getField(row, 'REF SAP ORIGINAl', 'REF SAP ORIGINAL', 'ref_sap_original')
    ),
    referencia_stal: textOrNull(getField(row, 'Referencia Stal', 'referencia_stal')),
    referencia_fleetguard: textOrNull(
      getField(row, 'Referencia Fleetguard', 'referencia_fleetguard')
    ),
    referencia_donaldson: textOrNull(
      getField(row, 'Referencia Donalson', 'Referencia Donaldson', 'referencia_donaldson')
    ),
    tiempo_horas: toNumber(getField(row, 'Tiempo', 'Tiempo (horas)', 'tiempo_horas'), 0),
    procedimiento: textOrNull(procedimientoRaw),
    avisos_claves: textOrNull(avisosRaw),
    created_at: creado,
    updated_at: modificado ?? creado,
    created_by: creadoPor,
    updated_by: modificadoPor,
    activo: true,
  };
}

function parseCsvText(text: string): Record<string, string>[] {
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

/**
 * Parsea Excel/CSV en el navegador y valida filas de tempario.
 */
export async function parseTemparioFile(
  file: File,
  createdBy: string
): Promise<TemparioImportParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let sheetRows: Record<string, string>[] = [];

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    sheetRows = parseCsvText(text);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { rows: [], errors: [{ row: 0, message: 'El archivo no tiene hojas' }] };
    }
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: false,
    });
    sheetRows = json.map((row) => {
      const out: Record<string, string> = {};
      Object.entries(row).forEach(([key, value]) => {
        out[String(key).trim()] = cellToString(value);
      });
      return out;
    });
  } else {
    return {
      rows: [],
      errors: [{ row: 0, message: 'Formato no soportado. Use .xlsx, .xls o .csv' }],
    };
  }

  if (sheetRows.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'El archivo no contiene filas de datos' }] };
  }

  if (!rowHasModelo2Column(sheetRows[0])) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          message:
            'El Excel debe incluir la columna Modelo2 (Actividad / Repuesto / Fluido / Observacion). TipoItem es solo catálogo (Filtro/Aceite), no el tipo.',
        },
      ],
    };
  }

  const rows: TemparioImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  sheetRows.forEach((raw, index) => {
    const excelRow = index + 2;
    try {
      const mapped = mapTemparioSheetRow(raw, createdBy);
      if (!mapped.marca || !mapped.modelo || !mapped.item) {
        throw new Error('Marca, Modelo e Item son obligatorios');
      }
      rows.push(mapped);
    } catch (err) {
      errors.push({
        row: excelRow,
        message: err instanceof Error ? err.message : 'Fila inválida',
      });
    }
  });

  return { rows, errors };
}
