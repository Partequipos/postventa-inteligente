/** Tiempo máximo sin interacción antes de cerrar sesión (30 min). */
export const SESSION_INACTIVITY_MS = 30 * 60 * 1000;

/** Intervalo de comprobación del temporizador. */
export const INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000;

/** Frecuencia mínima para persistir actividad (evita escrituras excesivas). */
export const ACTIVITY_THROTTLE_MS = 5 * 1000;

export const SESSION_LAST_ACTIVITY_KEY = 'partequipos-last-activity';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLastActivity(): number | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(SESSION_LAST_ACTIVITY_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function touchLastActivity(now = Date.now()): void {
  const store = storage();
  if (!store) return;
  store.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
}

export function clearLastActivity(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(SESSION_LAST_ACTIVITY_KEY);
}

export function isInactivityExpired(lastActivity: number, now = Date.now()): boolean {
  return now - lastActivity >= SESSION_INACTIVITY_MS;
}

export const INACTIVITY_LOGOUT_MESSAGE =
  'Su sesión se cerró por inactividad (30 minutos).';
