import * as XLSX from 'xlsx';

export const LCC_EXCEL_COLUMNS = [
  'TipodeMaquina',
  'Modelo',
  'Componente',
  'Horometro',
  'Ndeparte',
  'Descripcion',
  'Qty',
  'Grupo',
] as const;

export interface LccImportRow {
  clave: string;
  tipo_maquina: string;
  modelo: string;
  componente: string;
  horometro_horas: number;
  n_parte: string | null;
  descripcion: string | null;
  cantidad: number | null;
  grupo: string | null;
  excelRow: number;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim().replace(/^["']+|["']+$/g, '').trim();
}

function toNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  const entries = Object.entries(row).map(([k, v]) => [normalizeHeader(k), v] as const);
  for (const key of keys) {
    const target = normalizeHeader(key);
    const found = entries.find(([k]) => k === target);
    if (found?.[1]) return found[1].trim();
  }
  return '';
}

export function normalizeLccKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

export function buildLccClave(parts: {
  tipo_maquina: string;
  modelo: string;
  componente: string;
  horometro_horas: number;
  n_parte: string | null;
}): string {
  return [
    normalizeLccKeyPart(parts.tipo_maquina),
    normalizeLccKeyPart(parts.modelo),
    normalizeLccKeyPart(parts.componente),
    String(parts.horometro_horas),
    normalizeLccKeyPart(parts.n_parte ?? ''),
  ].join('|');
}

function mapLccSheetRow(row: Record<string, string>, excelRow: number): LccImportRow | null {
  const tipo_maquina = getField(
    row,
    'TipodeMaquina',
    'Tipo de Maquina',
    'TipoMaquina',
    'tipo_maquina'
  );
  const modelo = getField(row, 'Modelo', 'modelo');
  const componente = getField(row, 'Componente', 'componente');
  const horometroRaw = getField(row, 'Horometro', 'Horómetro', 'horometro', 'Horometro (h)');
  const horometro_horas = toNumber(horometroRaw);
  const n_parte =
    getField(row, 'Ndeparte', 'N de parte', 'N° de parte', 'Nparte', 'n_parte', 'Parte') || null;
  const descripcion = getField(row, 'Descripcion', 'Descripción', 'descripcion') || null;
  const qtyRaw = getField(row, 'Qty', 'Cantidad', 'cantidad', 'qty');
  const cantidad = toNumber(qtyRaw);
  const grupo = getField(row, 'Grupo', 'grupo') || null;

  if (!tipo_maquina && !modelo && !componente) return null;
  if (!tipo_maquina || !modelo || !componente) {
    throw new Error(`Fila ${excelRow}: TipodeMaquina, Modelo y Componente son obligatorios.`);
  }
  if (horometro_horas == null || horometro_horas <= 0) {
    throw new Error(`Fila ${excelRow}: Horometro inválido.`);
  }

  return {
    clave: buildLccClave({
      tipo_maquina,
      modelo,
      componente,
      horometro_horas,
      n_parte,
    }),
    tipo_maquina,
    modelo,
    componente,
    horometro_horas,
    n_parte,
    descripcion,
    cantidad,
    grupo,
    excelRow,
  };
}

function sheetToObjects(sheet: XLSX.WorkSheet): Record<string, string>[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = cellToString(value);
    }
    return out;
  });
}

export async function parseLccFile(file: File): Promise<{
  rows: LccImportRow[];
  errors: Array<{ row: number; message: string }>;
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], errors: [{ row: 0, message: 'El archivo no tiene hojas.' }] };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const objects = sheetToObjects(sheet);
  const rows: LccImportRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const seen = new Set<string>();

  objects.forEach((object, index) => {
    const excelRow = index + 2;
    try {
      const mapped = mapLccSheetRow(object, excelRow);
      if (!mapped) return;
      if (seen.has(mapped.clave)) {
        errors.push({ row: excelRow, message: 'Fila duplicada en el Excel (misma clave LCC).' });
        return;
      }
      seen.add(mapped.clave);
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
