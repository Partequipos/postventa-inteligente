/** Sede más cercana según columnas de distancia de telemetría. */
const SEDE_DISTANCIAS: ReadonlyArray<{ nombre: string; field: string }> = [
  { nombre: 'Bogotá', field: 'distancia_bogota' },
  { nombre: 'Medellín', field: 'distancia_medellin' },
  { nombre: 'Barranquilla', field: 'distancia_barranquilla' },
  { nombre: 'Montería', field: 'distancia_monteria' },
  { nombre: 'Cali', field: 'distancia_cali' },
  { nombre: 'Bucaramanga', field: 'distancia_bucaramanga' },
  { nombre: 'Ibagué', field: 'distancia_ibague' },
  { nombre: 'Istmina', field: 'distancia_istmina' },
  { nombre: 'Caucasia', field: 'distancia_caucasia' },
  { nombre: 'Villavicencio', field: 'distancia_villavicencio' },
];

export function resolveNearestSede(
  row: Record<string, unknown>,
  fallbackSede: string | null
): string {
  let min = Number.POSITIVE_INFINITY;
  let closest: string | null = null;

  for (const sede of SEDE_DISTANCIAS) {
    const raw = row[sede.field];
    const distance = raw == null ? null : Number(raw);
    if (distance != null && Number.isFinite(distance) && distance < min) {
      min = distance;
      closest = sede.nombre;
    }
  }

  if (closest) return closest;
  const sede = fallbackSede?.trim();
  return sede || '—';
}
