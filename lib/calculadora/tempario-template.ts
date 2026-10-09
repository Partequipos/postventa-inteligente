import type { TemparioMantenimiento } from '@/types/database';

/**
 * Encabezados del Excel TEMPARIOS (orden real de importación).
 * La primera columna debe ser Marca.
 */
export const TEMPARIO_EXCEL_COLUMNS = [
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

/** Fila de ejemplo orientativa (Modelo2 = Actividad | Repuesto | Fluido | Observacion). */
const TEMPARIO_EXAMPLE_ROW: Record<(typeof TEMPARIO_EXCEL_COLUMNS)[number], string> = {
  Marca: 'HITACHI',
  Linea: 'Excavadoras',
  Modelo: 'ZX210-5',
  Modelo2: 'Actividad',
  Item: 'Inspección visual general',
  Cantidad: 'Unidad',
  'Cantidad (Galones)': '1',
  Frecuencia: '250',
  'Aceite Homologado': '',
  'Referencia Genuina': '',
  'REF SAP DISPEL': '',
  'REF SAP ORIGINAl': '',
  'Referencia Stal': '',
  'Referencia Fleetguard': '',
  'Referencia Donalson': '',
  Tiempo: '0.5',
  Procedimiento: '',
  Observaciones: '',
  ID: '',
  TipoItem: '',
  Modificado: '',
  Creado: '',
  'Creado por': '',
  'Modificado por': '',
};

export const TEMPARIO_TEMPLATE_FILENAME = 'plantilla_temparios_mantenimiento.xlsx';

/**
 * Genera y descarga la plantilla Excel alineada al importador de temparios.
 */
export async function downloadTemparioExcelTemplate(): Promise<void> {
  const XLSX = await import('xlsx');
  const headers = [...TEMPARIO_EXCEL_COLUMNS];
  const example = headers.map((h) => TEMPARIO_EXAMPLE_ROW[h] ?? '');

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  sheet['!cols'] = headers.map((h) => ({ wch: Math.min(28, Math.max(12, h.length + 2)) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'TEMPARIOS');
  XLSX.writeFile(workbook, TEMPARIO_TEMPLATE_FILENAME);
}

function formatExcelDate(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function temparioToExcelCells(row: TemparioMantenimiento): Array<string | number> {
  const cells: Record<(typeof TEMPARIO_EXCEL_COLUMNS)[number], string | number> = {
    Marca: row.marca,
    Linea: row.linea ?? '',
    Modelo: row.modelo,
    Modelo2: row.tipo_item,
    Item: row.item,
    Cantidad: row.unidad_medida ?? '',
    'Cantidad (Galones)': row.cantidad,
    Frecuencia:
      row.frecuencia_grupo === 'primeras'
        ? `Primeras ${row.frecuencia_horas} horas`
        : row.frecuencia_horas,
    'Aceite Homologado': row.aceite_homologado ?? '',
    'Referencia Genuina': row.referencia_genuina ?? '',
    'REF SAP DISPEL': row.ref_sap_dispel ?? '',
    'REF SAP ORIGINAl': row.ref_sap_original ?? '',
    'Referencia Stal': row.referencia_stal ?? '',
    'Referencia Fleetguard': row.referencia_fleetguard ?? '',
    'Referencia Donalson': row.referencia_donaldson ?? '',
    Tiempo: row.tiempo_horas,
    Procedimiento: row.procedimiento ?? '',
    Observaciones: row.avisos_claves ?? '',
    ID: row.legacy_id ?? '',
    TipoItem: row.tipo_catalogo ?? '',
    Modificado: formatExcelDate(row.updated_at),
    Creado: formatExcelDate(row.created_at),
    'Creado por': row.created_by ?? '',
    'Modificado por': row.updated_by ?? '',
  };
  return TEMPARIO_EXCEL_COLUMNS.map((header) => cells[header] ?? '');
}

/**
 * Descarga los temparios en el mismo formato de la plantilla de importación.
 */
export async function downloadTempariosExcel(
  rows: TemparioMantenimiento[],
  fileName = `temparios_mantenimiento_${new Date().toISOString().slice(0, 10)}.xlsx`
): Promise<void> {
  const XLSX = await import('xlsx');
  const headers = [...TEMPARIO_EXCEL_COLUMNS];
  const body = rows.map(temparioToExcelCells);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  sheet['!cols'] = headers.map((header) => ({
    wch: Math.min(36, Math.max(12, header.length + 2)),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'TEMPARIOS');
  XLSX.writeFile(workbook, fileName);
}
