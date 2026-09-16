'use client';

import { useEffect, useRef } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import {
  getSessionUser,
  subscribeAuthChanges,
  type AuthChangeReason,
} from '@/lib/supabase/auth';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { AuthGate } from '@/components/auth/auth-gate';
import { InactivityGuard } from '@/components/auth/inactivity-guard';
import { purgeStaleUserPersistence, useUserStore } from '@/store';
import type { User } from '@/lib/mock-data';

const AUTH_HYDRATE_FALLBACK_MS = 3_000;

function AuthHydrator({ children }: Readonly<{ children: React.ReactNode }>) {
  const setUser = useUserStore((s) => s.setUser);
  const clearSession = useUserStore((s) => s.clearSession);
  const setAuthReady = useUserStore((s) => s.setAuthReady);
  const readyRef = useRef(false);

  useEffect(() => {
    purgeStaleUserPersistence();

    let cancelled = false;

    const finishReady = () => {
      if (cancelled || readyRef.current) return;
      readyRef.current = true;
      setAuthReady(true);
    };

    const applyUser = (user: User | null, reason: AuthChangeReason) => {
      if (cancelled) return;

      if (user) {
        setUser(user);
        return;
      }

      // Solo cerrar UI en logout real o en hidratación inicial sin JWT.
      // Ignorar nulls espurios durante refresh / Actualizar.
      if (reason === 'signed_out' || reason === 'initial') {
        clearSession();
      }
    };

    if (!isSupabaseConfigured()) {
      clearSession();
      finishReady();
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = subscribeAuthChanges(
      (user, reason) => {
        applyUser(user, reason);
      },
      () => {
        finishReady();
      }
    );

    const fallbackId = globalThis.setTimeout(() => {
      if (cancelled || readyRef.current) return;
      void (async () => {
        try {
          const sessionUser = await getSessionUser();
          if (cancelled || readyRef.current) return;
          applyUser(sessionUser, 'initial');
        } catch {
          // No forzar logout: esperar a que INITIAL_SESSION termine el ciclo
        } finally {
          finishReady();
        }
      })();
    }, AUTH_HYDRATE_FALLBACK_MS);

    return () => {
      cancelled = true;
      globalThis.clearTimeout(fallbackId);
      unsubscribe();
    };
  }, [setUser, clearSession, setAuthReady]);

  return <>{children}</>;
}

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydrator>
        <AuthGate>
          <InactivityGuard>{children}</InactivityGuard>
        </AuthGate>
      </AuthHydrator>
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
