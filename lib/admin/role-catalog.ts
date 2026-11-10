import type { UserRole } from '@/lib/mock-data';
import { mapAppRoleToDb, mapDbRoleToApp } from '@/lib/supabase/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';

export interface RoleCatalogEntry {
  id: string;
  dbRole: string;
  appRole: UserRole;
  name: string;
  description: string;
}

/** Catálogo fijo de roles (enum BD). */
export const ROLE_CATALOG: RoleCatalogEntry[] = [
  {
    id: 'administrator',
    dbRole: 'administrador',
    appRole: 'Administrator',
    name: 'Administrador',
    description: 'Acceso completo a todos los módulos y configuraciones del sistema.',
  },
  {
    id: 'coordinator',
    dbRole: 'coordinador',
    appRole: 'Coordinator',
    name: 'Coordinador',
    description: 'Gestiona cronogramas de mantenimiento y coordina técnicos.',
  },
  {
    id: 'sales_advisor',
    dbRole: 'asesor_comercial',
    appRole: 'Sales Advisor',
    name: 'Asesor Comercial',
    description: 'Crea cotizaciones y gestiona relaciones con clientes.',
  },
  {
    id: 'technician',
    dbRole: 'tecnico',
    appRole: 'Technician',
    name: 'Técnico',
    description: 'Ejecuta órdenes de trabajo y registra diagnósticos de campo.',
  },
  {
    id: 'viewer',
    dbRole: 'visualizador',
    appRole: 'Viewer',
    name: 'Visualizador',
    description: 'Solo lectura de reportes y dashboards.',
  },
];

/** Matriz módulo × rol por defecto (alineada al menú de la app). */
export const DEFAULT_MODULE_ACCESS: Record<string, Record<UserRole, boolean>> = {
  'Panel Principal': {
    Administrator: true,
    Coordinator: true,
    'Sales Advisor': true,
    Technician: true,
    Viewer: true,
  },
  Calculadora: {
    Administrator: true,
    Coordinator: true,
    'Sales Advisor': true,
    Technician: false,
    Viewer: false,
  },
  'Mantenimiento Proyectado': {
    Administrator: true,
    Coordinator: true,
    'Sales Advisor': true,
    Technician: true,
    Viewer: false,
  },
  LCC: {
    Administrator: true,
    Coordinator: true,
    'Sales Advisor': true,
    Technician: true,
    Viewer: true,
  },
  'Repuestos CPP': {
    Administrator: true,
    Coordinator: true,
    'Sales Advisor': true,
    Technician: false,
    Viewer: false,
  },
  'Panel Ejecutivo': {
    Administrator: true,
    Coordinator: true,
    'Sales Advisor': false,
    Technician: false,
    Viewer: true,
  },
  Administración: {
    Administrator: true,
    Coordinator: false,
    'Sales Advisor': false,
    Technician: false,
    Viewer: false,
  },
};

/** @deprecated Use DEFAULT_MODULE_ACCESS or fetchModuleAccessMatrix() */
export const MODULE_ACCESS = DEFAULT_MODULE_ACCESS;

export const APP_MODULES = Object.keys(DEFAULT_MODULE_ACCESS).filter((mod) => {
  if (mod === 'Repuestos CPP') return isFeatureEnabled('cppModule');
  return true;
});

export const PERM_CAPABILITIES: Record<UserRole, string[]> = {
  Administrator: [
    'Ver Dashboard',
    'Editar Datos',
    'Gestionar Usuarios',
    'Importar/Exportar',
    'Ver Reportes',
    'Configurar Sistema',
    'Aprobar Cotizaciones',
    'Gestionar Roles',
  ],
  Coordinator: [
    'Ver Dashboard',
    'Editar Datos',
    'Importar/Exportar',
    'Ver Reportes',
    'Aprobar Cotizaciones',
  ],
  'Sales Advisor': ['Ver Dashboard', 'Editar Datos', 'Ver Reportes'],
  Technician: ['Ver Dashboard', 'Editar Datos'],
  Viewer: ['Ver Dashboard', 'Ver Reportes'],
};

export { mapAppRoleToDb, mapDbRoleToApp };
