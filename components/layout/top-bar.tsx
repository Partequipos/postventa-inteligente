'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, ChevronDown, LogOut, User, Settings, Menu, Loader2, KeyRound } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/auth/change-password-dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUserStore } from '@/store';
import { toast } from 'sonner';

interface TopBarProps {
  readonly onMenuToggle?: () => void;
  readonly sidebarOpen?: boolean;
  readonly className?: string;
}

function useNotificationCount() {
  return 3;
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    Administrator: 'Administrador',
    Coordinator: 'Coordinador',
    'Sales Advisor': 'Asesor comercial',
    Technician: 'Técnico',
    Viewer: 'Visualizador',
  };
  return map[role] ?? role;
}

export function TopBar({ onMenuToggle, sidebarOpen = true, className }: TopBarProps) {
  const router = useRouter();
  const notificationCount = useNotificationCount();
  const { currentUser, role, isAuthenticated, logout } = useUserStore();
  const [searchFocused, setSearchFocused] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const displayName = isAuthenticated
    ? currentUser?.name?.trim() || currentUser?.email?.trim() || 'Usuario'
    : 'Invitado';
  const displayEmail = isAuthenticated ? currentUser?.email?.trim() || '' : '';
  const displayRole = isAuthenticated ? roleLabel(role) : 'Sin sesión';

  const initials =
    currentUser?.avatar ||
    displayName
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    'U';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      toast.success('Sesión cerrada');
    } catch {
      toast.error('No se pudo cerrar la sesión correctamente');
    } finally {
      router.replace('/login');
      router.refresh();
      setIsLoggingOut(false);
    }
  };

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-border',
        'flex items-center px-4 gap-4',
        'shadow-sm',
        className
      )}
    >
      <div className="flex items-center gap-3 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
          aria-label={sidebarOpen ? 'Ocultar menú lateral' : 'Mostrar menú lateral'}
          aria-expanded={sidebarOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm select-none shadow-brand flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #cf1b22 0%, #a51519 100%)' }}
            aria-hidden="true"
          >
            PM
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-bold text-foreground text-sm tracking-tight">
              PARTEQUIPOS MAQUINARIA
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
              Posventa Inteligente
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-xl mx-auto hidden md:block">
        <div
          className={cn(
            'relative flex items-center transition-all duration-200',
            searchFocused && 'ring-2 ring-ring ring-offset-1 rounded-lg'
          )}
        >
          <Search
            className={cn(
              'absolute left-3 h-4 w-4 pointer-events-none transition-colors duration-150',
              searchFocused ? 'text-primary' : 'text-muted-foreground'
            )}
          />
          <Input
            ref={searchRef}
            type="search"
            placeholder="Buscar equipos, repuestos, mantenimiento…"
            className="pl-9 pr-16 h-9 bg-muted/50 border-transparent focus-visible:ring-0 focus-visible:border-transparent focus-visible:bg-white transition-colors duration-150"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className="absolute right-3 hidden lg:flex items-center gap-0.5 text-[10px] text-muted-foreground font-mono bg-background border border-border rounded px-1 py-0.5 pointer-events-none">
            <span>⌘</span>
            <span>K</span>
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 relative text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
          aria-label={`${notificationCount} notificaciones`}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span
              className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none"
              aria-hidden="true"
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 pl-2 pr-2 gap-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 rounded-lg"
              aria-label="Menú de usuario"
              disabled={isLoggingOut}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src="" alt={`Avatar de ${displayName}`} />
                <AvatarFallback
                  className="text-xs font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #cf1b22 0%, #a51519 100%)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start leading-none">
                <span className="text-xs font-semibold text-foreground max-w-[120px] truncate">
                  {displayName}
                </span>
                <span className="text-[10px] text-muted-foreground">{displayRole}</span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 hidden md:block transition-transform duration-150 group-data-[state=open]:rotate-180" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold text-sm text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{displayEmail || '—'}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onSelect={() => router.push('/administration')}
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onSelect={() => router.push('/administration')}
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>Configuración</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              disabled={!isAuthenticated}
              onSelect={() => {
                globalThis.setTimeout(() => setPasswordOpen(true), 0);
              }}
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span>Actualizar clave</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              disabled={isLoggingOut}
              onSelect={(event) => {
                event.preventDefault();
                void handleLogout();
              }}
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              <span>{isLoggingOut ? 'Cerrando…' : 'Cerrar sesión'}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </header>
  );
}
