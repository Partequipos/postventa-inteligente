'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { getSessionUser, subscribeAuthChanges } from '@/lib/supabase/auth';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { AuthGate } from '@/components/auth/auth-gate';
import { InactivityGuard } from '@/components/auth/inactivity-guard';
import { purgeStaleUserPersistence, useUserStore } from '@/store';
import { touchLastActivity } from '@/lib/session-inactivity';

const AUTH_HYDRATE_FALLBACK_MS = 4_000;

function AuthHydrator({ children }: Readonly<{ children: React.ReactNode }>) {
  const setUser = useUserStore((s) => s.setUser);
  const clearSession = useUserStore((s) => s.clearSession);
  const setAuthReady = useUserStore((s) => s.setAuthReady);

  useEffect(() => {
    purgeStaleUserPersistence();

    let cancelled = false;
    let ready = false;

    const finishReady = () => {
      if (cancelled || ready) return;
      ready = true;
      setAuthReady(true);
    };

    const applyUser = (user: Parameters<typeof setUser>[0] | null) => {
      if (cancelled) return;
      if (user) {
        setUser(user);
        touchLastActivity();
      } else {
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
      (user) => {
        applyUser(user);
      },
      () => {
        finishReady();
      }
    );

    // Respaldo si INITIAL_SESSION no dispara (casos raros de cliente)
    const fallbackId = globalThis.setTimeout(() => {
      if (cancelled || ready) return;
      void (async () => {
        try {
          const sessionUser = await getSessionUser();
          if (cancelled || ready) return;
          applyUser(sessionUser);
        } catch {
          if (!cancelled && !ready) clearSession();
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
