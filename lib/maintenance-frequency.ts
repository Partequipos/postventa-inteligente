/** Horómetro máximo de la matriz de negocio (250…9000, paso 250). */
export const HOROMETRO_MAX = 9000;
export const HOROMETRO_MIN = 250;
export const HOROMETRO_STEP = 250;

/**
 * Matriz de frecuencias según horas de la máquina (PARTEQUIPOS / Power Apps):
 *
 * | Frecuencia | Aplica cuando horómetro…                          |
 * |------------|---------------------------------------------------|
 * | 250        | siempre (cada múltiplo de 250)                    |
 * | 1000       | múltiplo de 1000                                  |
 * | 2000       | múltiplo de 2000                                  |
 * | 4000       | múltiplo de 4000                                  |
 * | 5000       | múltiplo de 5000                                  |
 *
 * Las “Primeras 50/100/250/500/2500 horas” no entran en esta fórmula.
 *
 * Ejemplos: 1000→[250,1000] · 2000→[250,1000,2000] · 4000→[250,1000,2000,4000]
 *           5000→[250,1000,5000] · 8000→[250,1000,2000,4000]
 */
type IntervaloHoras = 250 | 1000 | 2000 | 4000 | 5000;

const FREQUENCY_MATRIX: Record<number, IntervaloHoras[]> = buildFrequencyMatrix();

function buildFrequencyMatrix(): Record<number, IntervaloHoras[]> {
  const matrix: Record<number, IntervaloHoras[]> = {};

  for (let h = HOROMETRO_MIN; h <= HOROMETRO_MAX; h += HOROMETRO_STEP) {
    const freqs: IntervaloHoras[] = [250];

    if (h >= 1000 && h % 1000 === 0) {
      freqs.push(1000);
    }
    if (h >= 2000 && h % 2000 === 0) {
      freqs.push(2000);
    }
    if (h >= 4000 && h % 4000 === 0) {
      freqs.push(4000);
    }
    if (h >= 5000 && h % 5000 === 0) {
      freqs.push(5000);
    }

    matrix[h] = freqs;
  }

  return matrix;
}

/** Normaliza horómetro al hito de mantenimiento (múltiplo de 250, máx. 9000). */
export function normalizeHorometro(horometro: number): number {
  if (horometro <= 0) return HOROMETRO_MIN;
  const stepped = Math.ceil(horometro / HOROMETRO_STEP) * HOROMETRO_STEP;
  return Math.min(HOROMETRO_MAX, Math.max(HOROMETRO_MIN, stepped));
}

/** Frecuencias de la fórmula que aplican según horómetro. No incluye “Primeras”. */
export function getFrecuenciasPorHorometro(horometro: number): IntervaloHoras[] {
  const normalized = normalizeHorometro(horometro);
  return FREQUENCY_MATRIX[normalized] ?? [250];
}

/** Opciones de selector 250…9000. */
export function getHorometroOptions(): number[] {
  const options: number[] = [];
  for (let h = HOROMETRO_MIN; h <= HOROMETRO_MAX; h += HOROMETRO_STEP) {
    options.push(h);
  }
  return options;
}

/** Etiquetas de la fórmula por horómetro (no incluye paquetes “Primeras”). */
export const FRECUENCIA_LABELS: Record<250 | 1000 | 2000 | 4000 | 5000, string> = {
  250: 'Mantenimiento 250 h',
  1000: 'Mantenimiento 1.000 h',
  2000: 'Mantenimiento 2.000 h',
  4000: 'Mantenimiento 4.000 h',
  5000: 'Mantenimiento 5.000 h',
};

export const PRIMERAS_FRECUENCIAS = [50, 100, 250, 500, 2500] as const;

export const PRIMERAS_LABELS: Record<(typeof PRIMERAS_FRECUENCIAS)[number], string> = {
  50: 'Primeras 50 horas',
  100: 'Primeras 100 horas',
  250: 'Primeras 250 horas',
  500: 'Primeras 500 horas',
  2500: 'Primeras 2500 horas',
};

/** true solo para paquetes “Primeras N horas”, nunca para la fórmula del horómetro. */
export function esPaquetePrimeras(
  grupo: string | null | undefined,
  horas: number
): boolean {
  const clase = (grupo ?? '').trim().toLowerCase();
  if (clase === 'intervalo') return false;
  if (clase === 'primeras') {
    return (PRIMERAS_FRECUENCIAS as readonly number[]).includes(horas);
  }
  return horas === 50 || horas === 100 || horas === 500 || horas === 2500;
}
