'use client';

import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { requestPasswordReset } from '@/lib/supabase/auth';

interface PasswordRecoveryFormProps {
  readonly onBack: () => void;
}

export function PasswordRecoveryForm({ onBack }: PasswordRecoveryFormProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el enlace.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Si el correo está registrado, recibirá un enlace para crear una nueva clave. Revise
          también la carpeta de spam.
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-[#cf1b22] border border-[#cf1b22]/30 hover:bg-[#cf1b22]/5"
        >
          Volver al inicio de sesión
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div>
        <label htmlFor="recovery-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Correo electrónico
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Mail size={16} />
          </span>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            placeholder="tu@partequipos.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-all bg-gray-50 text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22] border-gray-200"
          />
        </div>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <button
        type="submit"
        disabled={sending}
        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-[#cf1b22] hover:bg-[#a01419] disabled:opacity-70 flex items-center justify-center gap-2"
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : null}
        {sending ? 'Enviando…' : 'Enviar enlace'}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-gray-500 hover:text-gray-700"
      >
        Volver al inicio de sesión
      </button>
    </form>
  );
}
