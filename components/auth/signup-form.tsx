'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import { resendSignupVerification, signUpWithEmail } from '@/lib/supabase/auth';
import type { User as AppUser } from '@/lib/mock-data';

interface SignupFormProps {
  readonly onBack: () => void;
  readonly onSessionReady: (user: AppUser) => void;
}

type Phase = 'form' | 'sent';

export function SignupForm({ onBack, onSessionReady }: SignupFormProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await signUpWithEmail({
        nombre,
        email,
        password,
        confirmPassword,
      });
      if (result.status === 'session_ready') {
        onSessionReady(result.user);
        return;
      }
      setEmail(result.email);
      setPhase('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setResendNote(null);
    setError(null);
    try {
      await resendSignupVerification(email);
      setResendNote('Correo reenviado. Revise su bandeja y spam.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el correo.');
    } finally {
      setResending(false);
    }
  };

  if (phase === 'sent') {
    return (
      <div className="space-y-4">
        <div className="px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          Cuenta creada. Enviamos un enlace de verificación a <strong>{email}</strong>. Confirme el
          correo antes de iniciar sesión.
        </div>
        {resendNote ? (
          <p className="text-xs text-emerald-700">{resendNote}</p>
        ) : null}
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <button
          type="button"
          onClick={() => void resend()}
          disabled={resending}
          className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-[#cf1b22] hover:bg-[#a01419] disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {resending ? <Loader2 size={16} className="animate-spin" /> : null}
          {resending ? 'Reenviando…' : 'Reenviar correo de verificación'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full text-sm text-gray-500 hover:text-gray-700"
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
        <label htmlFor="signup-nombre" className="block text-sm font-medium text-gray-700 mb-1.5">
          Nombre completo
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <User size={16} />
          </span>
          <input
            id="signup-nombre"
            type="text"
            autoComplete="name"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            disabled={saving}
            className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-all bg-gray-50 text-gray-900 border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Correo electrónico
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Mail size={16} />
          </span>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="tu@partequipos.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={saving}
            className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-all bg-gray-50 text-gray-900 border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Clave
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Lock size={16} />
          </span>
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={saving}
            className="w-full pl-9 pr-11 py-2.5 text-sm border rounded-lg outline-none transition-all bg-gray-50 text-gray-900 border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label
          htmlFor="signup-confirm"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Confirmar clave
        </label>
        <input
          id="signup-confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={saving}
          className="w-full px-4 py-2.5 text-sm border rounded-lg outline-none transition-all bg-gray-50 text-gray-900 border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]"
        />
      </div>

      <p className="text-xs text-gray-500">
        Recibirá un correo para verificar la cuenta. Hasta confirmar, no podrá iniciar sesión.
      </p>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-[#cf1b22] hover:bg-[#a01419] disabled:opacity-70 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : null}
        {saving ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-gray-500 hover:text-gray-700"
      >
        Ya tengo cuenta
      </button>
    </form>
  );
}
