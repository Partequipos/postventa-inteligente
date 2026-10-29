import type { User, UserRole } from '@/lib/mock-data';
import {
  createEphemeralSupabaseClient,
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';

const ROLE_MAP: Record<string, UserRole> = {
  administrador: 'Administrator',
  coordinador: 'Coordinator',
  asesor_comercial: 'Sales Advisor',
  tecnico: 'Technician',
  visualizador: 'Viewer',
};

const PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  Administrator: ['*'],
  Coordinator: [
    'machines:read',
    'machines:write',
    'maintenance:read',
    'maintenance:write',
    'parts:read',
    'customers:read',
  ],
  'Sales Advisor': [
    'customers:read',
    'customers:write',
    'parts:read',
    'quotes:read',
    'quotes:write',
    'machines:read',
  ],
  Technician: ['machines:read', 'maintenance:read', 'maintenance:write', 'parts:read'],
  Viewer: ['dashboard:read', 'reports:read'],
};

export function mapDbRoleToApp(rol: string | null | undefined): UserRole {
  if (!rol) return 'Viewer';
  return ROLE_MAP[rol.toLowerCase()] ?? 'Viewer';
}

export function mapAppRoleToDb(role: UserRole): string {
  const reverse: Record<UserRole, string> = {
    Administrator: 'administrador',
    Coordinator: 'coordinador',
    'Sales Advisor': 'asesor_comercial',
    Technician: 'tecnico',
    Viewer: 'visualizador',
  };
  return reverse[role];
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function buildUser(params: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  isActive?: boolean;
}): User {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: params.name,
    email: params.email,
    role: params.role,
    avatar: initialsFromName(params.name) || 'U',
    phone: '',
    department: params.department ?? 'Posventa',
    isActive: params.isActive ?? true,
    lastLogin: now,
    createdAt: now,
    permissions: PERMISSIONS_BY_ROLE[params.role],
  };
}

interface PerfilRow {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  sede?: string | null;
  activo?: boolean;
}

export async function fetchProfileAsUser(userId: string, emailFallback: string): Promise<User> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('perfiles')
    .select('id, email, nombre, rol, sede, activo')
    .eq('id', userId)
    .maybeSingle();

  const perfil = data as PerfilRow | null;
  const email = (perfil?.email || emailFallback || '').trim();
  const fallbackName = email.includes('@') ? email.split('@')[0] : email || 'Usuario';

  if (!perfil) {
    return buildUser({
      id: userId,
      email: email || emailFallback,
      name: fallbackName,
      role: 'Viewer',
    });
  }

  return buildUser({
    id: perfil.id,
    name: (perfil.nombre || '').trim() || fallbackName,
    email: email || emailFallback,
    role: mapDbRoleToApp(perfil.rol),
    department: perfil.sede ?? 'Posventa',
    isActive: perfil.activo ?? true,
  });
}

export interface AuthResult {
  user: User;
  sessionExists: boolean;
}

export type AuthChangeReason = 'signed_out' | 'initial' | 'update' | 'recovery';

const PASSWORD_RECOVERY_KEY = 'postventa-password-recovery';

export function markPasswordRecoveryPending(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(PASSWORD_RECOVERY_KEY, '1');
}

export function clearPasswordRecoveryPending(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
}

export function isPasswordRecoveryPending(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === '1';
}

/**
 * Login con Supabase Auth. Si Supabase no está configurado, usa mock local.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    const { USERS } = await import('@/lib/mock-data');
    const normalized = email.toLowerCase();
    const found =
      normalized === 'admin@partequipos.com' && password === 'password123'
        ? USERS[0]
        : USERS.find((u) => u.email.toLowerCase() === normalized);

    if (!found) {
      throw new Error('Credenciales inválidas');
    }

    return { user: found, sessionExists: true };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Credenciales inválidas');
  }

  const user = await fetchProfileAsUser(data.user.id, data.user.email ?? email);
  return { user, sessionExists: Boolean(data.session) };
}

export const MIN_USER_PASSWORD_LENGTH = 8;

/** Valida la clave nueva y su confirmación. */
export function newPasswordFormError(newPassword: string, confirmPassword: string): string | null {
  if (newPassword.length < MIN_USER_PASSWORD_LENGTH) {
    return `La nueva clave debe tener al menos ${MIN_USER_PASSWORD_LENGTH} caracteres.`;
  }
  if (newPassword !== confirmPassword) {
    return 'La confirmación no coincide con la nueva clave.';
  }
  return null;
}

/** Valida el formulario de cambio de clave. Devuelve el mensaje o null si es válido. */
export function passwordChangeError(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): string | null {
  if (!currentPassword) return 'Ingrese la clave actual.';
  const nextError = newPasswordFormError(newPassword, confirmPassword);
  if (nextError) return nextError;
  if (newPassword === currentPassword) {
    return 'La nueva clave debe ser distinta de la actual.';
  }
  return null;
}

function passwordUpdateMessage(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes('same') || message.includes('different from the old')) {
    return 'La nueva clave debe ser distinta de la actual.';
  }
  if (message.includes('weak') || message.includes('at least') || message.includes('pwned')) {
    return 'La nueva clave no cumple la política de seguridad. Use una más larga y menos común.';
  }
  return raw;
}

/**
 * Cada usuario actualiza su propia clave.
 * Primero se comprueba la clave actual en un cliente aparte y luego se guarda la nueva en la sesión activa.
 */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('La actualización de clave requiere una sesión de Supabase.');
  }

  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user?.email?.trim();
  if (!email) {
    throw new Error('No hay una sesión activa. Vuelva a iniciar sesión.');
  }

  const verifier = createEphemeralSupabaseClient();
  const { error: currentError } = await verifier.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (currentError) {
    throw new Error('La clave actual no es correcta.');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(passwordUpdateMessage(error.message));
  }
}

function recoveryRedirectUrl(): string {
  return `${window.location.origin}/auth/nueva-clave`;
}

function resetRequestError(raw: string): string | null {
  const message = raw.toLowerCase();
  if (message.includes('rate') || message.includes('too many') || message.includes('once every')) {
    return 'Espere un momento antes de solicitar otro enlace.';
  }
  if (message.includes('not found')) {
    return null;
  }
  return 'No se pudo enviar el enlace de recuperación.';
}

/** Envía el enlace de recuperación. No indica si el correo existe. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    throw new Error('Ingrese un correo electrónico válido.');
  }
  if (!isSupabaseConfigured()) {
    throw new Error('La recuperación de clave no está disponible en este momento.');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo: recoveryRedirectUrl(),
  });
  if (!error) return;

  const mapped = resetRequestError(error.message);
  if (mapped) throw new Error(mapped);
}

/** Guarda la clave nueva abierta desde el enlace del correo. */
export async function completePasswordReset(newPassword: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('La recuperación de clave no está disponible en este momento.');
  }

  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new Error('El enlace venció o no es válido. Solicite uno nuevo desde el inicio de sesión.');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(passwordUpdateMessage(error.message));
  }
  clearPasswordRecoveryPending();
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}

/**
 * Restaura el usuario desde el JWT en localStorage.
 * Usa solo getSession (sin getUser/refresh agresivo) para no borrar el token
 * ante fallos de red al recargar o al pulsar Actualizar.
 */
export async function getSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData.session?.user ?? null;
  if (!authUser) return null;

  try {
    const user = await fetchProfileAsUser(authUser.id, authUser.email ?? '');
    if (user.isActive === false) {
      await supabase.auth.signOut();
      return null;
    }
    return user;
  } catch {
    // Perfil no disponible: mantener sesión con datos mínimos del JWT
    return buildUser({
      id: authUser.id,
      email: authUser.email ?? '',
      name: authUser.email?.split('@')[0] || 'Usuario',
      role: 'Viewer',
    });
  }
}

async function resolveUserFromAuthUser(
  userId: string,
  email: string
): Promise<User | null> {
  try {
    const user = await fetchProfileAsUser(userId, email);
    if (user.isActive === false) {
      await getSupabaseClient().auth.signOut();
      return null;
    }
    return user;
  } catch {
    return buildUser({
      id: userId,
      email,
      name: email.includes('@') ? email.split('@')[0] : email || 'Usuario',
      role: 'Viewer',
    });
  }
}

/**
 * Diferir trabajo async fuera del lock interno de GoTrue
 * (evitar deadlock / SIGNED_OUT fantasma al refrescar token).
 */
function deferAuthWork(work: () => void): void {
  globalThis.setTimeout(work, 0);
}

/** Suscripción a cambios de sesión Supabase. */
export function subscribeAuthChanges(
  onUser: (user: User | null, reason: AuthChangeReason) => void,
  onReady?: () => void
): () => void {
  if (!isSupabaseConfigured()) {
    onReady?.();
    return () => undefined;
  }

  const supabase = getSupabaseClient();
  let initialHandled = false;

  const markReady = () => {
    if (initialHandled) return;
    initialHandled = true;
    onReady?.();
  };

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    deferAuthWork(() => {
      void (async () => {
        if (event === 'SIGNED_OUT') {
          clearPasswordRecoveryPending();
          onUser(null, 'signed_out');
          markReady();
          return;
        }

        if (event === 'PASSWORD_RECOVERY') {
          markPasswordRecoveryPending();
          if (session?.user) {
            const user = await resolveUserFromAuthUser(
              session.user.id,
              session.user.email ?? ''
            );
            if (user) onUser(user, 'recovery');
          }
          markReady();
          return;
        }

        if (event === 'INITIAL_SESSION') {
          if (session?.user) {
            const user = await resolveUserFromAuthUser(
              session.user.id,
              session.user.email ?? ''
            );
            onUser(user, 'initial');
          } else {
            onUser(null, 'initial');
          }
          markReady();
          return;
        }

        // No limpiar sesión en eventos intermedios sin user (p. ej. refresh en curso).
        if (!session?.user) {
          return;
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          const user = await resolveUserFromAuthUser(
            session.user.id,
            session.user.email ?? ''
          );
          if (user) onUser(user, 'update');
        }
      })();
    });
  });

  return () => {
    subscription.unsubscribe();
  };
}
