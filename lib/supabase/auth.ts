import type { User, UserRole } from '@/lib/mock-data';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

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

export type AuthChangeReason = 'signed_out' | 'initial' | 'update';

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
          onUser(null, 'signed_out');
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
