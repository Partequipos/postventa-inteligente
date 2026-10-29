'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  clearPasswordRecoveryPending,
  completePasswordReset,
  isPasswordRecoveryPending,
  newPasswordFormError,
  signOut,
} from '@/lib/supabase/auth';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ResetPhase = 'checking' | 'ready' | 'invalid';

function linkLooksLikeRecovery(): boolean {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) return false;
  return (
    hash.includes('type=recovery') ||
    hash.includes('access_token') ||
    params.get('type') === 'recovery' ||
    params.has('code')
  );
}

function linkErrorMessage(): string | null {
  const params = new URLSearchParams(window.location.search);
  const description = params.get('error_description');
  if (!params.get('error') && !description) return null;
  return 'El enlace venció o no es válido. Solicite uno nuevo desde el inicio de sesión.';
}

export default function NuevaClavePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<ResetPhase>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const urlError = linkErrorMessage();
    if (urlError || !isSupabaseConfigured()) {
      setPhase('invalid');
      return;
    }

    let settled = false;
    const finish = (next: ResetPhase) => {
      if (settled) return;
      settled = true;
      setPhase(next);
    };

    const hasLink = linkLooksLikeRecovery();
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) finish('ready');
    });

    void supabase.auth.getSession().then(({ data: sessionData }) => {
      if (sessionData.session && (hasLink || isPasswordRecoveryPending())) {
        finish('ready');
      }
    });

    const timer = window.setTimeout(() => {
      finish(isPasswordRecoveryPending() ? 'ready' : 'invalid');
    }, 8000);

    return () => {
      settled = true;
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const backToLogin = async () => {
    clearPasswordRecoveryPending();
    if (phase === 'ready') await signOut();
    router.replace('/login');
  };

  const submit = async () => {
    const validation = newPasswordFormError(password, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await completePasswordReset(password);
      toast.success('Clave actualizada');
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la clave.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm bg-[#cf1b22]">
            PM
          </div>
          <div>
            <p className="font-bold text-gray-900 leading-none">Nueva clave</p>
            <p className="text-xs text-gray-500 mt-1">Posventa Inteligente</p>
          </div>
        </div>

        {phase === 'checking' ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#cf1b22]" />
            Verificando el enlace…
          </div>
        ) : null}

        {phase === 'invalid' ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              El enlace venció o no es válido. Solicite uno nuevo desde el inicio de sesión.
            </p>
            <button
              type="button"
              onClick={() => void backToLogin()}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-[#cf1b22] hover:bg-[#a01419]"
            >
              Ir al inicio de sesión
            </button>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p className="text-sm text-gray-600">
              Defina la clave de su cuenta. Debe tener al menos 8 caracteres.
            </p>
            <label className="block text-sm font-medium text-gray-700" htmlFor="nueva-clave">
              Nueva clave
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="nueva-clave"
                type="password"
                autoComplete="new-password"
                value={password}
                disabled={saving}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]"
              />
            </div>
            <label className="block text-sm font-medium text-gray-700" htmlFor="confirmar-clave">
              Confirmar clave
            </label>
            <input
              id="confirmar-clave"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              disabled={saving}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]"
            />
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white bg-[#cf1b22] hover:bg-[#a01419] disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {saving ? 'Guardando…' : 'Guardar clave'}
            </button>
            <button
              type="button"
              onClick={() => void backToLogin()}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
