/** Normaliza modelo para comparar (sin acentos ni espacios). */
export function normalizeLccModelo(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Familias de modelos equivalentes (fabricante).
 * Si el catálogo LCC trae solo uno (ej. ZX200-6), aplica a todos los de la familia
 * presentes en telemetría.
 */
export const LCC_MODELO_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
  ['ZX200-6', 'ZX210LC-6', 'ZX210K-6', 'ZX210LCH-6'],
] as const;

/** Separa "ZX200-6 / ZX210LC-6 / ZX210K-6" en tokens de modelo. */
export function splitModeloTokens(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[/|,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatModelosEquivalentes(modelos: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const modelo of modelos) {
    const key = normalizeLccModelo(modelo);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(modelo.trim());
  }
  return unique.join(' / ');
}

/** Familia conocida que contiene el modelo, o null. */
export function findModeloEquivalenceGroup(modelo: string): string[] | null {
  const key = normalizeLccModelo(modelo);
  if (!key) return null;
  for (const group of LCC_MODELO_EQUIVALENCE_GROUPS) {
    if (group.some((item) => normalizeLccModelo(item) === key)) {
      return [...group];
    }
  }
  return null;
}

/**
 * Conjunto normalizado de modelos que representan el mismo equipo LCC:
 * tokens del Excel + familia conocida de cada token.
 */
export function expandModeloEquivalents(
  modeloPrincipal: string,
  modelosEquivalentes?: string | null
): Set<string> {
  const expanded = new Set<string>();
  const seeds = [
    ...splitModeloTokens(modeloPrincipal),
    ...splitModeloTokens(modelosEquivalentes),
  ];

  for (const seed of seeds) {
    const key = normalizeLccModelo(seed);
    if (!key) continue;
    expanded.add(key);
    const family = findModeloEquivalenceGroup(seed);
    if (!family) continue;
    for (const item of family) {
      expanded.add(normalizeLccModelo(item));
    }
  }

  return expanded;
}

/**
 * true si el modelo de telemetría corresponde al del catálogo LCC
 * (igualdad, lista con "/" o familia equivalente conocida).
 */
export function modelosLccEquivalentes(
  teleModelo: string,
  lccModelo: string,
  lccModelosEquivalentes?: string | null
): boolean {
  const teleKey = normalizeLccModelo(teleModelo);
  if (!teleKey) return false;

  const catalogKeys = expandModeloEquivalents(lccModelo, lccModelosEquivalentes);
  if (catalogKeys.has(teleKey)) return true;

  const teleFamily = findModeloEquivalenceGroup(teleModelo);
  if (!teleFamily) return false;
  return teleFamily.some((item) => catalogKeys.has(normalizeLccModelo(item)));
}

/** Al importar: modelo canónico (primero) + lista completa de equivalentes. */
export function resolveModeloImportFields(modeloRaw: string): {
  modelo: string;
  modelos_equivalentes: string | null;
} {
  const tokens = splitModeloTokens(modeloRaw);
  if (tokens.length === 0) {
    return { modelo: modeloRaw.trim(), modelos_equivalentes: null };
  }

  const principal = tokens[0];
  const family = findModeloEquivalenceGroup(principal) ?? [];
  const merged = formatModelosEquivalentes([...tokens, ...family]);
  const mergedTokens = splitModeloTokens(merged);

  if (tokens.length === 1 && family.length <= 1) {
    return { modelo: principal, modelos_equivalentes: null };
  }

  if (tokens.length === 1 && family.length > 1) {
    return {
      modelo: principal,
      modelos_equivalentes: formatModelosEquivalentes(family),
    };
  }

  if (mergedTokens.length <= 1) {
    return { modelo: principal, modelos_equivalentes: null };
  }

  return {
    modelo: principal,
    modelos_equivalentes: merged,
  };
}
