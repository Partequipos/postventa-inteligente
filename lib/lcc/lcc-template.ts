import * as XLSX from 'xlsx';
import { LCC_EXCEL_COLUMNS, type LccImportRow } from '@/lib/lcc/lcc-import';
import type { LccComponente } from '@/types/database';

const SAMPLE_ROWS = [
  {
    TipodeMaquina: 'Excavadora',
    Modelo: 'ZX200-6',
    Componente: 'CILINDRO BALDE / BUCKET CYLINDER',
    Horometro: 8000,
    Ndeparte: '7T3354',
    Descripcion: 'CILINDRO BALDE / BUCKET CYLINDER',
    Qty: 1,
    Grupo: 'CILINDROS HIDRÁULICOS',
  },
  {
    TipodeMaquina: 'Excavadora',
    Modelo: 'ZX200-6',
    Componente: 'EMPAQUETADURA CILINDRO BALDE/ KIT SEAL BUCKET',
    Horometro: 4000,
    Ndeparte: 'YA00001392',
    Descripcion: 'EMPAQUETADURA CILINDRO BALDE/ KIT SEAL BUCKET',
    Qty: 1,
    Grupo: 'CILINDROS HIDRÁULICOS',
  },
];

export async function downloadLccExcelTemplate(): Promise<void> {
  const sheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS, { header: [...LCC_EXCEL_COLUMNS] });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'LCC');
  XLSX.writeFile(book, 'plantilla_lcc_componentes.xlsx');
}

export async function downloadLccCatalogExcel(rows: LccComponente[]): Promise<void> {
  const data = rows.map((row) => ({
    TipodeMaquina: row.tipo_maquina,
    Modelo: row.modelo,
    Componente: row.componente,
    Horometro: row.horometro_horas,
    Ndeparte: row.n_parte ?? '',
    Descripcion: row.descripcion ?? '',
    Qty: row.cantidad ?? '',
    Grupo: row.grupo ?? '',
  }));
  const sheet = XLSX.utils.json_to_sheet(data, { header: [...LCC_EXCEL_COLUMNS] });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'LCC');
  XLSX.writeFile(book, 'lcc_componentes.xlsx');
}

export function lccImportRowToSheet(rows: LccImportRow[]): Record<string, string | number>[] {
  return rows.map((row) => ({
    TipodeMaquina: row.tipo_maquina,
    Modelo: row.modelo,
    Componente: row.componente,
    Horometro: row.horometro_horas,
    Ndeparte: row.n_parte ?? '',
    Descripcion: row.descripcion ?? '',
    Qty: row.cantidad ?? '',
    Grupo: row.grupo ?? '',
  }));
}
