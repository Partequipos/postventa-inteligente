import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  PreventiveConsumableLine,
  PreventivePartLine,
  PreventiveQuoteResult,
  TelemetriaEquipo,
} from '@/types/database';

/** Logo oficial PARTEQUIPOS MAQUINARIA (Cloudinary). */
export const PARTEQUIPOS_LOGO_URL =
  'https://res.cloudinary.com/dbufrzoda/image/upload/v1750457354/Captura_de_pantalla_2025-06-20_170819_wzmyli.png';

const BRAND_RGB = { r: 207, g: 27, b: 34 } as const;
const PAGE_MARGIN = 8;
const PAGE_WIDTH = 297;
const PAGE_HEIGHT = 210;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const COST_BLOCK_HEIGHT = 22;
const FOOTER_Y = PAGE_HEIGHT - 5;

export interface QuotePdfInput {
  quote: PreventiveQuoteResult;
  travelTimeHours?: number;
  selectedMachine?: TelemetriaEquipo | null;
}

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: { finalY: number };
}

interface PdfLayoutMetrics {
  fontSize: number;
  cellPadding: number;
  detailStartY: number;
  costStartY: number;
}

function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateEs(date: Date): string {
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function textOrDash(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v || '—';
}

function truncate(value: string, max: number): string {
  const v = value.trim();
  if (v.length <= max) return v;
  return `${v.slice(0, max - 1)}…`;
}

function sanitizeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Texto de referencia corto (códigos aftermarket / SAP). */
function refPdf(value: string | null | undefined): string {
  return truncate(textOrDash(value), 22);
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        if (typeof data === 'string') resolve(data);
        else reject(new Error('Formato de logo no válido'));
      };
      reader.onerror = () => reject(new Error('No se pudo leer el logo'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Logo PARTEQUIPOS como data URL (reutilizable en otros PDF). */
export async function fetchPartequiposLogoDataUrl(): Promise<string | null> {
  return fetchImageDataUrl(PARTEQUIPOS_LOGO_URL);
}

function tableFinalY(doc: JsPdfWithAutoTable, fallback: number): number {
  return doc.lastAutoTable?.finalY ?? fallback;
}

function countDetailRows(quote: PreventiveQuoteResult): number {
  const actRows = Math.max(quote.activities.length, 1);
  const fluidRows = Math.max(quote.fluids.length, 1);
  const partRows = Math.max(quote.parts.length, 1);
  return actRows + fluidRows + partRows + 3;
}

function resolveLayoutMetrics(
  quote: PreventiveQuoteResult,
  fontSize: number,
  detailStartY: number
): PdfLayoutMetrics {
  const costStartY = PAGE_HEIGHT - COST_BLOCK_HEIGHT - 7;
  const available = costStartY - detailStartY - 4;
  const totalRows = countDetailRows(quote);
  const rowHeight = fontSize * 0.45 + 1.6;
  const needed = totalRows * rowHeight + 18;

  let adjustedFont = fontSize;
  if (needed > available && fontSize > 4) {
    adjustedFont = Math.max(4, (fontSize * available) / needed);
  }

  return {
    fontSize: adjustedFont,
    cellPadding: adjustedFont <= 5 ? 0.6 : 1,
    detailStartY,
    costStartY,
  };
}

function compactTableStyles(fontSize: number, cellPadding: number) {
  return {
    fontSize,
    cellPadding,
    overflow: 'linebreak' as const,
    lineColor: [226, 232, 240] as [number, number, number],
    lineWidth: 0.1,
    textColor: [30, 41, 59] as [number, number, number],
  };
}

function drawMiniTitle(doc: jsPDF, title: string, x: number, y: number, width: number): void {
  doc.setFillColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
  doc.rect(x, y - 3.2, width, 4.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 1.5, y);
  doc.setTextColor(30, 41, 59);
}

/** Dibuja cabecera (logo + marca/modelo/km/viaje) y retorna Y final para no solapar tablas. */
function addHeader(
  doc: JsPdfWithAutoTable,
  logoDataUrl: string | null,
  input: QuotePdfInput
): number {
  const { quote, travelTimeHours } = input;
  const frecuencias = quote.frecuenciasAplicadas.map((f) => `${f}`).join(', ');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', PAGE_MARGIN, PAGE_MARGIN - 1, 38, 12);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
    doc.text('PARTEQUIPOS MAQUINARIA', PAGE_MARGIN, PAGE_MARGIN + 6);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const rightX = PAGE_MARGIN + CONTENT_WIDTH;
  doc.text('Cotización Mantenimiento Preventivo', rightX, PAGE_MARGIN + 3, { align: 'right' });
  doc.text(formatDateEs(new Date()), rightX, PAGE_MARGIN + 8, { align: 'right' });

  autoTable(doc, {
    startY: PAGE_MARGIN + 12,
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: 0.9, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 20, textColor: [100, 116, 139] },
      1: { cellWidth: 42 },
      2: { fontStyle: 'bold', cellWidth: 20, textColor: [100, 116, 139] },
      3: { cellWidth: 42 },
      4: { fontStyle: 'bold', cellWidth: 22, textColor: [100, 116, 139] },
      5: { cellWidth: 42 },
      6: { fontStyle: 'bold', cellWidth: 18, textColor: [100, 116, 139] },
      7: { cellWidth: 31 },
    },
    body: [
      [
        'Marca',
        quote.brand,
        'Modelo',
        quote.model,
        'Horómetro',
        `${quote.hours.toLocaleString('es-CO')} h`,
        'Freq. (h)',
        frecuencias,
      ],
      [
        'Km',
        `${quote.kilometers.toLocaleString('es-CO')}`,
        'Viaje',
        `${travelTimeHours ?? 0} h`,
        '',
        '',
        '',
        '',
      ],
    ],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN },
    pageBreak: 'avoid',
  });

  return tableFinalY(doc, PAGE_MARGIN + 28);
}

function addActivitiesBlock(
  doc: JsPdfWithAutoTable,
  quote: PreventiveQuoteResult,
  layout: PdfLayoutMetrics
): number {
  const startY = layout.detailStartY;
  drawMiniTitle(doc, 'Actividades', PAGE_MARGIN, startY, CONTENT_WIDTH);

  const body =
    quote.activities.length === 0
      ? [['—', 'Sin actividades para esta frecuencia', '—', '—']]
      : [
          ...quote.activities.map((act) => [
            String(act.frecuenciaHoras ?? '—'),
            truncate(act.activity, 80),
            act.laborHours.toFixed(1),
            formatCOP(act.subtotal),
          ]),
          [
            { content: 'Total MO', colSpan: 2, styles: { fontStyle: 'bold' as const } },
            {
              content: quote.laborHoursTotal.toFixed(1),
              styles: { fontStyle: 'bold' as const, halign: 'right' as const },
            },
            {
              content: formatCOP(quote.costs.labor),
              styles: { fontStyle: 'bold' as const, halign: 'right' as const },
            },
          ],
        ];

  autoTable(doc, {
    startY: startY + 1.5,
    head: [['F', 'Actividad', 'h', 'MO']],
    body,
    styles: compactTableStyles(layout.fontSize, layout.cellPadding),
    headStyles: {
      fillColor: [BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: layout.fontSize,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_HEIGHT - layout.costStartY },
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    tableWidth: CONTENT_WIDTH,
  });

  return tableFinalY(doc, startY + 10);
}

/** Fluidos: Aceite homologado (ENI), Ref. genuina y SAP — sin aftermarket. */
const FLUID_HEAD = [
  'F',
  'Fluido',
  'Cant',
  'Und',
  'Aceite homologado',
  'Ref. genuina',
  'SAP Dispel',
  'SAP Orig.',
] as const;

/** Repuestos/Filtros: código + refs aftermarket (sin SAP Dispel). */
const PART_HEAD = [
  'F',
  'Código / Ref.',
  'Descripción',
  'Cant',
  'Und',
  'Ref. genuina',
  'Stal',
  'Donaldson',
  'Fleetguard',
  'SAP Orig.',
] as const;

const FLUID_EMPTY_ROW = FLUID_HEAD.map((_, i) => (i === 1 ? 'Sin fluidos' : '—'));
const PART_EMPTY_ROW = PART_HEAD.map((_, i) => (i === 2 ? 'Sin repuestos / filtros' : '—'));

function fluidRefRow(f: PreventiveConsumableLine): string[] {
  return [
    String(f.frecuenciaHoras ?? '—'),
    truncate(f.item, 48),
    String(f.quantity),
    textOrDash(f.unit),
    textOrDash(f.aceiteHomologado),
    textOrDash(f.referenciaGenuina),
    refPdf(f.refSapDispel),
    refPdf(f.refSapOriginal),
  ];
}

function partRefRow(p: PreventivePartLine): string[] {
  return [
    String(p.frecuenciaHoras ?? '—'),
    truncate(textOrDash(p.sapCode), 22),
    truncate(p.description, 40),
    String(p.quantity),
    textOrDash(p.unit || 'Unidad'),
    refPdf(p.referenciaGenuina),
    refPdf(p.referenciaStal),
    refPdf(p.referenciaDonaldson),
    refPdf(p.referenciaFleetguard),
    refPdf(p.refSapOriginal),
  ];
}

function fluidColumnStyles() {
  return {
    0: { cellWidth: 8, halign: 'right' as const },
    1: { cellWidth: 42 },
    2: { cellWidth: 10, halign: 'right' as const },
    3: { cellWidth: 10 },
    4: { cellWidth: 68 },
    5: { cellWidth: 62 },
    6: { cellWidth: 36 },
    7: { cellWidth: 36 },
  };
}

function partColumnStyles() {
  return {
    0: { cellWidth: 8, halign: 'right' as const },
    1: { cellWidth: 30 },
    2: { cellWidth: 48 },
    3: { cellWidth: 10, halign: 'right' as const },
    4: { cellWidth: 10 },
    5: { cellWidth: 28 },
    6: { cellWidth: 28 },
    7: { cellWidth: 28 },
    8: { cellWidth: 28 },
    9: { cellWidth: 28 },
  };
}

function addFluidsBlock(
  doc: JsPdfWithAutoTable,
  quote: PreventiveQuoteResult,
  layout: PdfLayoutMetrics,
  startY: number
): number {
  drawMiniTitle(doc, 'Fluidos (referencias)', PAGE_MARGIN, startY, CONTENT_WIDTH);

  const body = quote.fluids.length === 0 ? [FLUID_EMPTY_ROW] : quote.fluids.map(fluidRefRow);

  autoTable(doc, {
    startY: startY + 1.5,
    head: [Array.from(FLUID_HEAD)],
    body,
    styles: compactTableStyles(layout.fontSize, layout.cellPadding),
    headStyles: {
      fillColor: [22, 163, 74],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: Math.max(4, layout.fontSize - 0.3),
    },
    columnStyles: fluidColumnStyles(),
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_HEIGHT - layout.costStartY },
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    tableWidth: CONTENT_WIDTH,
  });

  return tableFinalY(doc, startY + 10);
}

function addPartsBlock(
  doc: JsPdfWithAutoTable,
  quote: PreventiveQuoteResult,
  layout: PdfLayoutMetrics,
  startY: number
): number {
  drawMiniTitle(doc, 'Repuestos / Filtros', PAGE_MARGIN, startY, CONTENT_WIDTH);

  const body = quote.parts.length === 0 ? [PART_EMPTY_ROW] : quote.parts.map(partRefRow);

  autoTable(doc, {
    startY: startY + 1.5,
    head: [Array.from(PART_HEAD)],
    body,
    styles: compactTableStyles(layout.fontSize, layout.cellPadding),
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: Math.max(4, layout.fontSize - 0.3),
    },
    columnStyles: partColumnStyles(),
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_HEIGHT - layout.costStartY },
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    tableWidth: CONTENT_WIDTH,
  });

  return tableFinalY(doc, startY + 10);
}

function addCostSummary(doc: jsPDF, quote: PreventiveQuoteResult, startY: number): void {
  const labor = quote.costs.labor;
  const travel = quote.costs.travel;
  const subtotal = quote.costs.subtotal;
  const rightX = PAGE_MARGIN + CONTENT_WIDTH;
  const boxTop = startY;
  const rowH = 6;
  const rows = [
    { label: 'Total mano de obra', value: formatCOP(labor), bold: false },
    { label: 'Total desplazamiento', value: formatCOP(travel), bold: false },
    { label: 'Total (MO + desplazamiento)', value: formatCOP(subtotal), bold: true },
  ];

  doc.setDrawColor(BRAND_RGB.r, BRAND_RGB.g, BRAND_RGB.b);
  doc.setFillColor(255, 247, 237);
  doc.roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, rows.length * rowH + 3, 1.5, 1.5, 'FD');

  rows.forEach((row, index) => {
    const rowY = boxTop + 4 + index * rowH;
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 8.5 : 7.5);
    doc.setTextColor(
      row.bold ? BRAND_RGB.r : 51,
      row.bold ? BRAND_RGB.g : 65,
      row.bold ? BRAND_RGB.b : 85
    );
    doc.text(row.label, PAGE_MARGIN + 3, rowY);
    doc.text(row.value, rightX - 3, rowY, { align: 'right' });
  });
}

function addFooter(doc: jsPDF): void {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'PARTEQUIPOS MAQUINARIA · Fluidos: Aceite homologado (ENI) / Ref. genuina / SAP · Repuestos: Stal / Donaldson / Fleetguard · Sin precio SAP · Una página',
    PAGE_MARGIN,
    FOOTER_Y
  );
}

/** Espacio mínimo entre cabecera (Km / Viaje) y bloque Actividades. */
const HEADER_TO_TABLES_GAP_MM = 5;

function renderQuotePdf(
  doc: JsPdfWithAutoTable,
  input: QuotePdfInput,
  logoDataUrl: string | null,
  fontSize: number
): void {
  const headerEndY = addHeader(doc, logoDataUrl, input);
  const detailStartY = headerEndY + HEADER_TO_TABLES_GAP_MM;
  const layout = resolveLayoutMetrics(input.quote, fontSize, detailStartY);

  const afterActivities = addActivitiesBlock(doc, input.quote, layout);
  const afterFluids = addFluidsBlock(doc, input.quote, layout, afterActivities + 2.5);
  addPartsBlock(doc, input.quote, layout, afterFluids + 2.5);

  addCostSummary(doc, input.quote, layout.costStartY);
  addFooter(doc);
}

function buildSinglePagePdf(input: QuotePdfInput, logoDataUrl: string | null): JsPdfWithAutoTable {
  let fontSize = 6.5;
  let doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;

  while (fontSize >= 3.8) {
    doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPdfWithAutoTable;
    renderQuotePdf(doc, input, logoDataUrl, fontSize);
    if (doc.getNumberOfPages() === 1) break;
    fontSize -= 0.4;
  }

  return doc;
}

/** Genera y descarga el PDF de cotización (una sola página landscape). */
export async function downloadPreventiveQuotePdf(input: QuotePdfInput): Promise<void> {
  const logoDataUrl = await fetchPartequiposLogoDataUrl();
  const doc = buildSinglePagePdf(input, logoDataUrl);

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `cotizacion-${sanitizeFilePart(input.quote.brand)}-${sanitizeFilePart(input.quote.model)}-${stamp}.pdf`;
  doc.save(fileName);
}
