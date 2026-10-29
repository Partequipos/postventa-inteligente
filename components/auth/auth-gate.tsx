'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useUserStore } from '@/store';

import { isPasswordRecoveryPending } from '@/lib/supabase/auth';

const PUBLIC_PATHS = ['/login'] as const;
const RECOVERY_PATH = '/auth/nueva-clave';

function isRecoveryPath(pathname: string): boolean {
  return pathname === RECOVERY_PATH || pathname.startsWith(`${RECOVERY_PATH}/`);
}

function isPublicPath(pathname: string): boolean {
  return (
    isRecoveryPath(pathname) ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-[#cf1b22]" aria-hidden />
        <p className="text-sm">Verificando sesión…</p>
      </div>
    </div>
  );
}

/**
 * Bloquea rutas privadas hasta validar sesión Supabase.
 * Sin sesión → /login. Evita el “Usuario Visualizador” fantasma.
 */
export function AuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const authReady = useUserStore((s) => s.authReady);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  const path = pathname ?? '';
  const publicRoute = isPublicPath(path);
  const recoveryRoute = isRecoveryPath(path);

  useEffect(() => {
    if (!authReady) return;

    if (isPasswordRecoveryPending() && !recoveryRoute) {
      router.replace(RECOVERY_PATH);
      return;
    }

    if (!isAuthenticated && !publicRoute) {
      router.replace('/login');
      return;
    }

    if (isAuthenticated && publicRoute && !recoveryRoute) {
      router.replace('/dashboard');
    }
  }, [authReady, isAuthenticated, path, publicRoute, recoveryRoute, router]);

  if (!authReady) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated && !publicRoute) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated && publicRoute && !recoveryRoute) {
    return <AuthLoadingScreen />;
  }

  return <>{children}</>;
}
