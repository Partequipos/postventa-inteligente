'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { getSessionUser } from '@/lib/supabase/auth';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useUserStore } from '@/store';

type Phase = 'checking' | 'ready' | 'invalid';

function linkErrorMessage(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('error') && !params.get('error_description')) return null;
  return 'El enlace de verificación venció o no es válido. Solicite uno nuevo desde el registro.';
}

export default function VerificarCorreoPage() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    if (linkErrorMessage() || !isSupabaseConfigured()) {
      setPhase('invalid');
      return;
    }

    let settled = false;
    const finish = (next: Phase) => {
      if (settled) return;
      settled = true;
      setPhase(next);
    };

    const acceptSession = async () => {
      const sessionUser = await getSessionUser();
      if (!sessionUser) return false;
      setUser(sessionUser);
      finish('ready');
      return true;
    };

    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        void acceptSession();
      }
    });

    void acceptSession();

    const timer = window.setTimeout(() => {
      void acceptSession().then((ok) => {
        if (!ok) finish('invalid');
      });
    }, 8000);

    return () => {
      settled = true;
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [setUser]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = window.setTimeout(() => {
      router.replace('/dashboard');
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [phase, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm bg-[#cf1b22]">
            PM
          </div>
          <div>
            <p className="font-bold text-gray-900 leading-none">Verificación de correo</p>
            <p className="text-xs text-gray-500 mt-1">Posventa Inteligente</p>
          </div>
        </div>

        {phase === 'checking' ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#cf1b22]" />
            Confirmando su correo…
          </div>
        ) : null}

        {phase === 'ready' ? (
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Correo verificado. Entrando a la plataforma…
          </div>
        ) : null}

        {phase === 'invalid' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              El enlace de verificación venció o no es válido. Vuelva al inicio de sesión y cree la
              cuenta de nuevo, o solicite el reenvío del correo.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-[#cf1b22] hover:bg-[#a01419]"
            >
              Ir al inicio de sesión
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
