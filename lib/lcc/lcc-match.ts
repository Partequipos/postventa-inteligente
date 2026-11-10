import type { LccAlertaComponente, LccAlertaEstado, LccComponente, TelemetriaEquipo } from '@/types/database';
import { normalizeLccKeyPart } from '@/lib/lcc/lcc-import';

/** Ventana (h) para considerar un componente próximo a verificar/cambiar. */
export const LCC_NEAR_THRESHOLD_HOURS = 500;

export function hoursUntilNextInterval(currentHours: number, intervalHours: number): number {
  if (!(intervalHours > 0)) return Number.POSITIVE_INFINITY;
  if (!(currentHours > 0)) return intervalHours;
  const rem = currentHours % intervalHours;
  if (rem < 1e-9) return 0;
  return intervalHours - rem;
}

export function resolveLccAlertaEstado(hoursRemaining: number): LccAlertaEstado | null {
  if (hoursRemaining <= 0) return 'vencido';
  if (hoursRemaining <= LCC_NEAR_THRESHOLD_HOURS) return 'proximo';
  return null;
}

function modeloCompatible(teleModelo: string, lccModelo: string): boolean {
  const a = normalizeLccKeyPart(teleModelo);
  const b = normalizeLccKeyPart(lccModelo);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function tipoCompatible(teleTipo: string | null | undefined, lccTipo: string): boolean {
  const a = normalizeLccKeyPart(teleTipo ?? '');
  const b = normalizeLccKeyPart(lccTipo);
  if (!b) return true;
  if (!a) return true;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Cruza flota activa (última telemetría por serie) con el catálogo LCC.
 * Solo incluye componentes vencidos o dentro de la ventana de proximidad.
 */
export function buildLccAlertas(
  maquinas: TelemetriaEquipo[],
  catalogo: LccComponente[],
  nearThreshold = LCC_NEAR_THRESHOLD_HOURS
): LccAlertaComponente[] {
  const activos = catalogo.filter((row) => row.activo !== false);
  const alertas: LccAlertaComponente[] = [];

  for (const maquina of maquinas) {
    const horas = Number(maquina.horometro) || 0;
    if (horas <= 0) continue;

    for (const item of activos) {
      if (!modeloCompatible(maquina.modelo, item.modelo)) continue;
      if (!tipoCompatible(maquina.tipo_maquina, item.tipo_maquina)) continue;

      const intervalo = Number(item.horometro_horas) || 0;
      if (intervalo <= 0) continue;

      const horasRestantes = hoursUntilNextInterval(horas, intervalo);
      if (horasRestantes > nearThreshold) continue;

      const estado = resolveLccAlertaEstado(horasRestantes);
      if (!estado) continue;

      const proximoEn = horas + horasRestantes;

      alertas.push({
        serie: maquina.serie,
        marca: maquina.marca,
        modelo: maquina.modelo,
        tipo_maquina: maquina.tipo_maquina?.trim() || item.tipo_maquina,
        titulo: maquina.titulo,
        sede: maquina.sede,
        horometro_maquina: horas,
        componente: item.componente,
        grupo: item.grupo?.trim() || 'Sin grupo',
        n_parte: item.n_parte?.trim() || '—',
        descripcion: item.descripcion?.trim() || item.componente,
        cantidad: item.cantidad ?? null,
        intervalo_horas: intervalo,
        proximo_en_horas: Math.round(proximoEn),
        horas_restantes: Math.round(horasRestantes),
        estado,
      });
    }
  }

  return alertas.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'vencido' ? -1 : 1;
    if (a.horas_restantes !== b.horas_restantes) return a.horas_restantes - b.horas_restantes;
    return a.serie.localeCompare(b.serie, 'es');
  });
}

export function topCountBy<T>(
  items: T[],
  keyFn: (item: T) => string,
  limit = 8
): Array<{ name: string; total: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item).trim() || 'Sin dato';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
