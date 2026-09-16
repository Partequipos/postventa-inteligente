'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ACTIVITY_THROTTLE_MS,
  INACTIVITY_CHECK_INTERVAL_MS,
  INACTIVITY_LOGOUT_MESSAGE,
  clearLastActivity,
  isInactivityExpired,
  readLastActivity,
  touchLastActivity,
} from '@/lib/session-inactivity';
import { useUserStore } from '@/store';

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'wheel',
] as const;

export function useInactivityLogout(): void {
  const router = useRouter();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const authReady = useUserStore((s) => s.authReady);
  const logout = useUserStore((s) => s.logout);
  const loggingOutRef = useRef(false);
  const lastTouchRef = useRef(0);

  const performInactivityLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      clearLastActivity();
      await logout();
      toast.warning(INACTIVITY_LOGOUT_MESSAGE);
      router.replace('/login');
      router.refresh();
    } catch {
      toast.error('No se pudo cerrar la sesión.');
    } finally {
      loggingOutRef.current = false;
    }
  }, [logout, router]);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastTouchRef.current < ACTIVITY_THROTTLE_MS) return;
    lastTouchRef.current = now;
    touchLastActivity(now);
  }, []);

  const checkExpired = useCallback(() => {
    if (!isAuthenticated || !authReady) return;

    const last = readLastActivity();
    if (last == null) {
      touchLastActivity();
      return;
    }

    if (isInactivityExpired(last)) {
      void performInactivityLogout();
    }
  }, [isAuthenticated, authReady, performInactivityLogout]);

  useEffect(() => {
    // Durante hidratación no tocar el marcador (evita logout falso al recargar).
    if (!authReady) return;

    if (!isAuthenticated) {
      return;
    }

    const last = readLastActivity();
    if (last != null && isInactivityExpired(last)) {
      void performInactivityLogout();
      return;
    }
    if (last == null) {
      touchLastActivity();
    }

    const onActivity = () => recordActivity();

    for (const eventName of ACTIVITY_EVENTS) {
      globalThis.addEventListener(eventName, onActivity, { passive: true });
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkExpired();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const intervalId = globalThis.setInterval(checkExpired, INACTIVITY_CHECK_INTERVAL_MS);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        globalThis.removeEventListener(eventName, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      globalThis.clearInterval(intervalId);
    };
  }, [isAuthenticated, authReady, recordActivity, checkExpired, performInactivityLogout]);
}
