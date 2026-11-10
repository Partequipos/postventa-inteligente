'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calculator,
  Calendar,
  Package,
  BarChart3,
  Settings,
  PanelLeftClose,
  Cog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { isFeatureEnabled, type FeatureFlagKey } from '@/lib/feature-flags';
import {
  canRoleAccessModule,
  cloneDefaultModuleAccess,
  MODULE_PATHS,
} from '@/lib/admin/module-access';
import { useModuleAccessMatrix } from '@/hooks/use-administration';
import { useUserStore } from '@/store';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

const navItems: {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  feature?: FeatureFlagKey;
}[] = [
  { label: 'Panel Principal', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Calculadora', href: '/calculator', icon: Calculator },
  { label: 'Mantenimiento Proyectado', href: '/projected-maintenance', icon: Calendar },
  { label: 'LCC', href: '/lcc', icon: Cog },
  { label: 'Repuestos CPP', href: '/cpp', icon: Package, feature: 'cppModule' },
  { label: 'Panel Ejecutivo', href: '/executive-dashboard', icon: BarChart3 },
  { label: 'Administración', href: '/administration', icon: Settings },
];

export function Sidebar({ isOpen, onToggle, className }: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const { role } = useUserStore();
  const { data: matrix } = useModuleAccessMatrix();
  const accessMatrix = matrix ?? cloneDefaultModuleAccess();

  const visibleNav = navItems.filter((item) => {
    if (item.feature != null && !isFeatureEnabled(item.feature)) return false;
    const moduleName =
      Object.entries(MODULE_PATHS).find(([, path]) => path === item.href)?.[0] ?? item.label;
    return canRoleAccessModule(accessMatrix, moduleName, role);
  });

  return (
    <aside
      className={cn(
        'fixed left-0 top-16 bottom-0 z-40 flex flex-col bg-white border-r border-border',
        'transition-all duration-300 ease-in-out overflow-hidden',
        isOpen ? 'w-60 translate-x-0' : 'w-0 -translate-x-full border-r-0',
        className
      )}
      aria-hidden={!isOpen}
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin min-w-[15rem]">
        <ul className="flex flex-col gap-1 px-2">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname?.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium',
                    'transition-all duration-150 ease-in-out group relative overflow-hidden',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  tabIndex={isOpen ? 0 : -1}
                >
                  {isActive ? (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{ backgroundColor: '#cf1b22' }}
                      aria-hidden="true"
                    />
                  ) : null}
                  <Icon
                    className={cn(
                      'h-5 w-5 flex-shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2 flex-shrink-0 min-w-[15rem]">
        <Button
          variant="ghost"
          onClick={onToggle}
          className="h-9 w-full justify-start gap-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label="Ocultar menú lateral"
        >
          <PanelLeftClose className="h-4 w-4" />
          <span className="text-sm">Ocultar menú</span>
        </Button>
      </div>
    </aside>
  );
}
