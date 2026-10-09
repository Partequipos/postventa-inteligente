import type {
  TemparioMantenimiento,
  PreventiveQuoteInput,
  PreventiveQuoteResult,
  PreventiveConsumableLine,
  MaintenanceFrequencyHours,
} from '@/types/database';
import { getFrecuenciasPorHorometro, esPaquetePrimeras } from '@/lib/maintenance-frequency';
import { calcularCostoDesplazamiento, calcularIva, DEFAULT_TARIFA } from '@/lib/travel-cost';
import {
  isActivityRow,
  isConsumableOnlyRow,
  isFluidoRow,
  isPartOnlyRow,
  resolveModelo2,
} from '@/lib/calculadora/tempario-classify';

/**
 * Tarifa fija de mano de obra (COP/h) — Power Apps:
 * Sum(Tiempo horas) * 110000
 */
export const TARIFA_MANO_OBRA_COP = 110_000;

/** Normaliza marca/modelo para comparar (case + espacios). */
export function normalizeEquipKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function isActivityTipo(tipo: string): boolean {
  const t = tipo.trim().toLowerCase();
  return t === 'actividad' || t === 'servicio';
}

export function isConsumableRow(t: { tipo_item: string; item: string }): boolean {
  return isConsumableOnlyRow(t);
}

export function isPartRow(t: { tipo_item: string; item: string }): boolean {
  return isPartOnlyRow(t);
}

export function isFluidRow(t: { tipo_item: string; item: string }): boolean {
  return isFluidoRow(t);
}

export function matchesMarcaModelo(
  t: TemparioMantenimiento,
  marca: string,
  modelo: string
): boolean {
  return (
    normalizeEquipKey(t.marca) === normalizeEquipKey(marca) &&
    normalizeEquipKey(t.modelo) === normalizeEquipKey(modelo)
  );
}

/**
 * Power Apps: 'Frecuencia (horas)'.Value in SelectedFrequencies.
 * Las filas “Primeras N horas” solo entran si el usuario eligió ese paquete.
 */
export function matchesFrecuencia(
  t: TemparioMantenimiento,
  frecuencias: number[],
  soloPrimeras = false
): boolean {
  const freq = Number(t.frecuencia_horas);
  if (!Number.isFinite(freq)) return false;
  if (!frecuencias.some((f) => Number(f) === freq)) return false;
  return rowEsPrimeras(t) === soloPrimeras;
}

function rowEsPrimeras(t: TemparioMantenimiento): boolean {
  return esPaquetePrimeras(t.frecuencia_grupo, Number(t.frecuencia_horas));
}

/** Código SAMM / ref. de catálogo para la tabla de actividades. */
export function resolveCodigoSamm(t: TemparioMantenimiento): string {
  const candidates = [
    t.referencia_genuina,
    t.ref_sap_original,
    t.ref_sap_dispel,
    t.referencia_stal,
    t.legacy_id != null ? String(t.legacy_id) : null,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c).trim();
  }
  return '—';
}

function sortByTipoThenItem(a: TemparioMantenimiento, b: TemparioMantenimiento): number {
  const tipoCmp = String(a.tipo_item).localeCompare(String(b.tipo_item), 'es');
  if (tipoCmp !== 0) return tipoCmp;
  return a.item.localeCompare(b.item, 'es');
}

function textOrDash(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v || '—';
}

function resolveQuantity(cantidad: number): number {
  const qty = Number(cantidad);
  if (!Number.isFinite(qty)) return 1;
  return qty;
}

function mapInsumoLine(t: TemparioMantenimiento): PreventiveConsumableLine {
  return {
    item: t.item,
    quantity: resolveQuantity(t.cantidad),
    unit: t.unidad_medida,
    unitPrice: 0,
    total: 0,
    tipoItem: resolveModelo2(String(t.tipo_item)),
    tipoCatalogo: t.tipo_catalogo ?? null,
    frecuenciaHoras: Number(t.frecuencia_horas) as MaintenanceFrequencyHours,
    marca: t.marca,
    modelo: t.modelo,
    referenciaGenuina: textOrDash(t.referencia_genuina),
    refSapDispel: textOrDash(t.ref_sap_dispel),
    refSapOriginal: textOrDash(t.ref_sap_original),
    referenciaStal: textOrDash(t.referencia_stal),
    referenciaDonaldson: textOrDash(t.referencia_donaldson),
    referenciaFleetguard: textOrDash(t.referencia_fleetguard),
    aceiteHomologado: textOrDash(t.aceite_homologado),
  };
}

function randomSerial(marca: string): string {
  const prefix = marca.slice(0, 3).toUpperCase();
  return `${prefix}${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * Cotización preventiva — Power Apps / Excel Modelo2.
 *
 * Actividades: Modelo2 Actividad|Servicio → Sum(Tiempo)*110000
 * Fluidos: Modelo2 Fluido
 * Consumibles: Modelo2 Consumible
 * Repuestos: Modelo2 Repuesto
 * Observacion: excluida de tabs de cálculo
 */
export function buildPreventiveQuote(
  input: PreventiveQuoteInput,
  temparios: TemparioMantenimiento[]
): PreventiveQuoteResult {
  const primeras = input.frecuenciaPrimeras;
  const soloPrimeras = primeras != null;
  const frecuencias: MaintenanceFrequencyHours[] = [];
  if (primeras != null) {
    frecuencias.push(primeras);
  } else {
    frecuencias.push(...getFrecuenciasPorHorometro(input.horometro));
  }

  const forEquip = temparios.filter(
    (t) => t.activo !== false && matchesMarcaModelo(t, input.marca, input.modelo)
  );

  const filtered = forEquip.filter((t) => matchesFrecuencia(t, frecuencias, soloPrimeras));

  const activityRows = filtered.filter((t) => isActivityRow(t));
  const laborHoursTotal = activityRows.reduce(
    (sum, t) => sum + (Number.isFinite(Number(t.tiempo_horas)) ? Number(t.tiempo_horas) : 0),
    0
  );
  const laborTotal = Math.round(laborHoursTotal * TARIFA_MANO_OBRA_COP);

  const activities = activityRows.map((t, i) => {
    const hours = Number(t.tiempo_horas) || 0;
    return {
      id: t.id || `act-${i}`,
      activity: t.item,
      description: t.procedimiento ?? t.avisos_claves ?? '',
      laborHours: hours,
      parts: 0,
      consumables: 0,
      subtotal: Math.round(hours * TARIFA_MANO_OBRA_COP),
      frecuenciaHoras: Number(t.frecuencia_horas) as MaintenanceFrequencyHours,
      marca: t.marca,
      modelo: t.modelo,
      codigoSamm: resolveCodigoSamm(t),
      observaciones: (t.avisos_claves ?? '').trim(),
    };
  });

  const fluids = filtered
    .filter(isFluidoRow)
    .slice()
    .sort(sortByTipoThenItem)
    .map(mapInsumoLine);

  const consumables = filtered
    .filter(isConsumableOnlyRow)
    .slice()
    .sort(sortByTipoThenItem)
    .map(mapInsumoLine);

  const parts = filtered
    .filter(isPartOnlyRow)
    .slice()
    .sort(sortByTipoThenItem)
    .map((t) => ({
      sapCode: resolveCodigoSamm(t),
      description: t.item,
      quantity: resolveQuantity(t.cantidad),
      unitPrice: 0,
      total: 0,
      unit: t.unidad_medida,
      frecuenciaHoras: Number(t.frecuencia_horas) as MaintenanceFrequencyHours,
      referenciaGenuina: textOrDash(t.referencia_genuina),
      refSapDispel: textOrDash(t.ref_sap_dispel),
      refSapOriginal: textOrDash(t.ref_sap_original),
      referenciaStal: textOrDash(t.referencia_stal),
      referenciaDonaldson: textOrDash(t.referencia_donaldson),
      referenciaFleetguard: textOrDash(t.referencia_fleetguard),
    }));

  const travelCost = calcularCostoDesplazamiento(input.kmTrayecto, input.horasTrayecto);
  const subtotal = laborTotal + travelCost;
  const vat = calcularIva(subtotal, DEFAULT_TARIFA.iva_porcentaje);

  const tiposEnEquipo = Array.from(
    new Set(forEquip.map((t) => String(t.tipo_item ?? '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  return {
    brand: input.marca,
    model: input.modelo,
    serialNumber: randomSerial(input.marca),
    year: new Date().getFullYear() - Math.floor(Math.random() * 6),
    hours: input.horometro,
    kilometers: input.kmTrayecto,
    status: Math.random() > 0.3 ? 'active' : 'maintenance',
    frecuenciasAplicadas: frecuencias,
    paquetePrimeras: soloPrimeras ? primeras : null,
    laborHoursTotal,
    laborRate: TARIFA_MANO_OBRA_COP,
    activities,
    fluids,
    consumables,
    parts,
    matchMeta: {
      tempariosEquipo: forEquip.length,
      tempariosFrecuencia: filtered.length,
      tiposEnEquipo,
    },
    costs: {
      labor: laborTotal,
      fluids: 0,
      consumables: 0,
      parts: 0,
      travel: travelCost,
      subtotal,
      vat,
      total: subtotal + vat,
    },
  };
}
