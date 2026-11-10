import type { UserRole } from '@/lib/mock-data';
import { APP_MODULES, DEFAULT_MODULE_ACCESS } from '@/lib/admin/role-catalog';

export type ModuleAccessMatrix = Record<string, Record<UserRole, boolean>>;

export const PERM_ROLES: UserRole[] = [
  'Administrator',
  'Coordinator',
  'Sales Advisor',
  'Technician',
  'Viewer',
];

export const MODULE_PATHS: Record<string, string> = {
  'Panel Principal': '/dashboard',
  Calculadora: '/calculator',
  'Mantenimiento Proyectado': '/projected-maintenance',
  LCC: '/lcc',
  'Repuestos CPP': '/cpp',
  'Panel Ejecutivo': '/executive-dashboard',
  Administración: '/administration',
};

const PATH_TO_MODULE = Object.fromEntries(
  Object.entries(MODULE_PATHS).map(([mod, path]) => [path, mod])
) as Record<string, string>;

function isUserRole(value: string): value is UserRole {
  return (PERM_ROLES as string[]).includes(value);
}

/** Clona la matriz por defecto del catálogo. */
export function cloneDefaultModuleAccess(): ModuleAccessMatrix {
  const matrix: ModuleAccessMatrix = {};
  for (const mod of APP_MODULES) {
    matrix[mod] = { ...DEFAULT_MODULE_ACCESS[mod] };
  }
  return matrix;
}

/** Fusiona JSON persistido con defaults (nuevos módulos/roles). */
export function normalizeModuleAccessMatrix(raw: unknown): ModuleAccessMatrix {
  const base = cloneDefaultModuleAccess();
  if (!raw || typeof raw !== 'object') return enforceAdministratorFullAccess(base);

  const source = raw as Record<string, unknown>;
  for (const mod of APP_MODULES) {
    const row = source[mod];
    if (!row || typeof row !== 'object') continue;
    for (const [roleKey, allowed] of Object.entries(row as Record<string, unknown>)) {
      if (!isUserRole(roleKey) || typeof allowed !== 'boolean') continue;
      base[mod][roleKey] = allowed;
    }
  }
  return enforceAdministratorFullAccess(base);
}

/** El rol Administrador siempre conserva acceso total. */
export function enforceAdministratorFullAccess(matrix: ModuleAccessMatrix): ModuleAccessMatrix {
  for (const mod of APP_MODULES) {
    if (!matrix[mod]) matrix[mod] = { ...DEFAULT_MODULE_ACCESS[mod] };
    matrix[mod].Administrator = true;
  }
  return matrix;
}

export function canRoleAccessModule(
  matrix: ModuleAccessMatrix,
  module: string,
  role: UserRole
): boolean {
  if (role === 'Administrator') return true;
  return matrix[module]?.[role] ?? DEFAULT_MODULE_ACCESS[module]?.[role] ?? false;
}

export function resolveModuleFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  if (PATH_TO_MODULE[pathname]) return PATH_TO_MODULE[pathname];
  for (const [path, mod] of Object.entries(PATH_TO_MODULE)) {
    if (path !== '/dashboard' && pathname.startsWith(`${path}/`)) return mod;
  }
  return null;
}

export function canRoleAccessPath(
  matrix: ModuleAccessMatrix,
  pathname: string | null | undefined,
  role: UserRole
): boolean {
  const mod = resolveModuleFromPath(pathname);
  if (!mod) return true;
  return canRoleAccessModule(matrix, mod, role);
}

export function matricesEqual(a: ModuleAccessMatrix, b: ModuleAccessMatrix): boolean {
  for (const mod of APP_MODULES) {
    for (const role of PERM_ROLES) {
      if (Boolean(a[mod]?.[role]) !== Boolean(b[mod]?.[role])) return false;
    }
  }
  return true;
}
