"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  Loader2,
  CheckCircle2,
  Cpu,
  Wrench,
  BarChart3,
} from "lucide-react";
import { useUserStore } from "@/store";
import { signInWithPassword } from "@/lib/supabase/auth";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

// ── Validation schema ──────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "El correo electrónico o usuario es obligatorio")
    .email("Introduce un correo electrónico válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ── Corporate SVG illustration ─────────────────────────────────────────────────

function IndustrialIllustration() {
  return (
    <svg
      viewBox="0 0 600 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-[520px] mx-auto"
      aria-hidden="true"
    >
      {/* Background grid */}
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff08" strokeWidth="1" />
        </pattern>
        <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cf1b22" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#9b0f14" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e40af" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id="gearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#374151" stopOpacity="1" />
          <stop offset="100%" stopColor="#1f2937" stopOpacity="1" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="600" height="520" fill="url(#grid)" />

      {/* ── Back large gear ── */}
      <g transform="translate(420, 260)" opacity="0.25">
        <circle cx="0" cy="0" r="110" stroke="#ffffff" strokeWidth="6" fill="none" />
        <circle cx="0" cy="0" r="70" stroke="#ffffff" strokeWidth="4" fill="none" />
        <circle cx="0" cy="0" r="20" fill="#ffffff" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const x1 = Math.cos(rad) * 75;
          const y1 = Math.sin(rad) * 75;
          const x2 = Math.cos(rad) * 110;
          const y2 = Math.sin(rad) * 110;
          return (
            <rect
              key={angle}
              x={x1 - 6}
              y={y1 - 6}
              width="12"
              height="36"
              fill="#ffffff"
              transform={`rotate(${angle}, ${x1}, ${y1})`}
            />
          );
        })}
      </g>

      {/* ── Front main gear (red accent) ── */}
      <g transform="translate(160, 300)" filter="url(#glow)">
        <circle cx="0" cy="0" r="88" fill="url(#redGrad)" opacity="0.9" />
        <circle cx="0" cy="0" r="56" fill="#1a1f2e" />
        <circle cx="0" cy="0" r="22" fill="url(#redGrad)" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const cx = Math.cos(rad) * 72;
          const cy = Math.sin(rad) * 72;
          return (
            <ellipse
              key={angle}
              cx={cx}
              cy={cy}
              rx="14"
              ry="20"
              fill="url(#redGrad)"
              transform={`rotate(${angle}, ${cx}, ${cy})`}
            />
          );
        })}
        {/* Spoke lines */}
        {[22.5, 67.5, 112.5, 157.5].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line
              key={angle}
              x1={Math.cos(rad) * 24}
              y1={Math.sin(rad) * 24}
              x2={Math.cos(rad) * 54}
              y2={Math.sin(rad) * 54}
              stroke="#0f1219"
              strokeWidth="5"
            />
          );
        })}
      </g>

      {/* ── Medium gear (blue tint) ── */}
      <g transform="translate(295, 185)" opacity="0.7">
        <circle cx="0" cy="0" r="58" fill="url(#blueGrad)" />
        <circle cx="0" cy="0" r="36" fill="#0f1219" />
        <circle cx="0" cy="0" r="14" fill="#1e40af" opacity="0.8" />
        {[0, 60, 120, 180, 240, 300].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const cx = Math.cos(rad) * 47;
          const cy = Math.sin(rad) * 47;
          return (
            <ellipse
              key={angle}
              cx={cx}
              cy={cy}
              rx="10"
              ry="14"
              fill="#1e40af"
              opacity="0.8"
              transform={`rotate(${angle}, ${cx}, ${cy})`}
            />
          );
        })}
      </g>

      {/* ── Connection shaft ── */}
      <rect x="243" y="280" width="8" height="80" rx="4" fill="#4b5563" opacity="0.8" />
      <rect x="243" y="262" width="8" height="20" rx="4" fill="#cf1b22" opacity="0.9" />

      {/* ── Dashboard screen element ── */}
      <g transform="translate(330, 310)">
        <rect x="0" y="0" width="200" height="130" rx="10" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
        <rect x="0" y="0" width="200" height="30" rx="10" fill="#0f172a" />
        <rect x="0" y="20" width="200" height="10" fill="#0f172a" />
        {/* Screen top dots */}
        <circle cx="14" cy="15" r="4" fill="#ef4444" opacity="0.8" />
        <circle cx="26" cy="15" r="4" fill="#f59e0b" opacity="0.8" />
        <circle cx="38" cy="15" r="4" fill="#22c55e" opacity="0.8" />
        {/* Chart bars */}
        <rect x="20" y="70" width="18" height="45" rx="3" fill="#cf1b22" opacity="0.8" />
        <rect x="46" y="55" width="18" height="60" rx="3" fill="#cf1b22" opacity="0.6" />
        <rect x="72" y="80" width="18" height="35" rx="3" fill="#cf1b22" opacity="0.8" />
        <rect x="98" y="48" width="18" height="67" rx="3" fill="#cf1b22" opacity="0.9" />
        <rect x="124" y="65" width="18" height="50" rx="3" fill="#cf1b22" opacity="0.6" />
        <rect x="150" y="58" width="18" height="57" rx="3" fill="#cf1b22" opacity="0.75" />
        {/* Trend line */}
        <polyline
          points="29,68 55,52 81,77 107,46 133,62 159,56"
          stroke="#fbbf24"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* ── Floating data nodes ── */}
      {/* Node 1 */}
      <g transform="translate(60, 130)">
        <circle cx="0" cy="0" r="28" fill="#cf1b22" opacity="0.15" />
        <circle cx="0" cy="0" r="18" fill="#cf1b22" opacity="0.3" />
        <circle cx="0" cy="0" r="8" fill="#cf1b22" />
      </g>
      {/* Node 2 */}
      <g transform="translate(510, 130)">
        <circle cx="0" cy="0" r="20" fill="#1e40af" opacity="0.2" />
        <circle cx="0" cy="0" r="10" fill="#1e40af" opacity="0.5" />
      </g>
      {/* Node 3 */}
      <g transform="translate(520, 420)">
        <circle cx="0" cy="0" r="16" fill="#16a34a" opacity="0.2" />
        <circle cx="0" cy="0" r="8" fill="#16a34a" opacity="0.5" />
      </g>

      {/* ── Connection lines ── */}
      <line x1="60" y1="130" x2="160" y2="220" stroke="#cf1b22" strokeWidth="1" strokeDasharray="6 4" opacity="0.4" />
      <line x1="510" y1="130" x2="430" y2="200" stroke="#1e40af" strokeWidth="1" strokeDasharray="6 4" opacity="0.3" />
      <line x1="520" y1="420" x2="430" y2="370" stroke="#16a34a" strokeWidth="1" strokeDasharray="6 4" opacity="0.3" />

      {/* ── Hex accent shapes ── */}
      <polygon
        points="540,70 555,79 555,97 540,106 525,97 525,79"
        fill="#cf1b22"
        opacity="0.25"
      />
      <polygon
        points="50,390 61,397 61,411 50,418 39,411 39,397"
        fill="#1e40af"
        opacity="0.2"
      />

      {/* ── Small particles ── */}
      {[
        [120, 80], [380, 100], [480, 320], [90, 450], [440, 470],
        [220, 460], [570, 240], [40, 250],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3 : 2} fill="#ffffff" opacity={0.12 + (i % 4) * 0.05} />
      ))}

      {/* ── Bottom baseline ── */}
      <rect x="0" y="490" width="600" height="30" fill="#0f1219" opacity="0.5" />
      <line x1="40" y1="490" x2="560" y2="490" stroke="#cf1b22" strokeWidth="2" opacity="0.4" />
    </svg>
  );
}

// ── Feature bullet item ────────────────────────────────────────────────────────

interface FeatureBulletProps {
  icon: React.ReactNode;
  text: string;
  delay: number;
}

function FeatureBullet({ icon, text, delay }: FeatureBulletProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
      className="flex items-center gap-3"
    >
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#cf1b22]/20 border border-[#cf1b22]/30 flex items-center justify-center text-[#cf1b22]">
        {icon}
      </span>
      <span className="text-slate-300 text-sm font-medium">{text}</span>
    </motion.div>
  );
}

// ── Main Login Page ────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);

    try {
      const { user } = await signInWithPassword(data.email, data.password);
      setUser(user);
      setLoginSuccess(true);
      await new Promise((r) => setTimeout(r, 400));
      router.push("/dashboard");
    } catch (err) {
      setLoginError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar sesión. Verifique sus credenciales."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const EASE_OUT = "easeOut" as const;

  // ── Framer Motion variants ─────────────────────────────────────────────────

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden">
      {/* ── LEFT PANEL (60%) ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative hidden lg:flex flex-col justify-between w-3/5 min-h-screen p-10 xl:p-14 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1a1f2e 0%, #0f1219 100%)",
        }}
      >
        {/* Subtle radial glow behind illustration */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 40% 55%, rgba(207,27,34,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Top-left brand mark */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg bg-[#cf1b22]">
            PM
          </div>
          <div>
            <p className="text-white font-bold text-base leading-none">PARTEQUIPOS MAQUINARIA</p>
            <p className="text-slate-400 text-xs leading-tight">Posventa Inteligente</p>
          </div>
        </div>

        {/* Illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
          className="relative z-10 flex-1 flex items-center justify-center py-8"
        >
          <IndustrialIllustration />
        </motion.div>

        {/* Tagline + feature bullets */}
        <div className="relative z-10 space-y-6">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-3xl xl:text-4xl font-extrabold text-white leading-tight"
            >
              Plataforma de
              <br />
              <span className="text-[#cf1b22]">Posventa Inteligente</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="mt-2 text-slate-400 text-sm"
            >
              Gestión del ciclo de vida de equipos industriales, redefinida.
            </motion.p>
          </div>

          <div className="space-y-3">
            <FeatureBullet
              delay={0.8}
              icon={<Wrench size={16} />}
              text="Calculadora de Mantenimiento Preventivo"
            />
            <FeatureBullet
              delay={0.9}
              icon={<Cpu size={16} />}
              text="Consulta de Repuestos (CPP)"
            />
            <FeatureBullet
              delay={1.0}
              icon={<BarChart3 size={16} />}
              text="Analítica Ejecutiva"
            />
          </div>
        </div>
      </motion.div>

      {/* ── RIGHT PANEL (40%) ────────────────────────────────────────────────── */}
      <div className="flex-1 lg:w-2/5 bg-white flex flex-col min-h-screen">
        {/* Mobile-only gradient header */}
        <div
          className="lg:hidden flex items-center gap-3 px-6 py-5"
          style={{ background: "linear-gradient(135deg, #1a1f2e, #0f1219)" }}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-white text-sm bg-[#cf1b22]">
            PM
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">PARTEQUIPOS MAQUINARIA</p>
            <p className="text-slate-400 text-xs leading-tight">Posventa Inteligente</p>
          </div>
        </div>

        {/* Form container */}
        <div className="flex-1 flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-12 xl:px-16">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-sm mx-auto"
          >
            {/* Logo / heading */}
            <motion.div variants={itemVariants} className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-xl shadow-lg"
                  style={{ background: "#cf1b22" }}
                >
                  PM
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900 leading-none">
                    PARTEQUIPOS MAQUINARIA
                  </h2>
                  <p className="text-[#cf1b22] text-xs font-semibold tracking-wide uppercase mt-0.5">
                    Posventa Inteligente
                  </p>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-gray-700">
                {showRecovery ? "Recuperar clave" : "Bienvenido de nuevo"}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {showRecovery
                  ? "Le enviaremos un enlace para crear una nueva clave"
                  : "Inicia sesión en tu cuenta para continuar"}
              </p>
            </motion.div>

            {/* Form */}
            {showRecovery ? (
              <PasswordRecoveryForm onBack={() => setShowRecovery(false)} />
            ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {/* Email field */}
              <motion.div variants={itemVariants}>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Correo electrónico / Usuario
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <User size={16} />
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@partequipos.com"
                    {...register("email")}
                    className={`w-full pl-9 pr-4 py-2.5 text-sm border rounded-lg outline-none transition-all
                      bg-gray-50 text-gray-900 placeholder-gray-400
                      focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]
                      ${errors.email ? "border-red-400 bg-red-50" : "border-gray-200"}`}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
                )}
              </motion.div>

              {/* Password field */}
              <motion.div variants={itemVariants}>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Lock size={16} />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register("password")}
                    className={`w-full pl-9 pr-11 py-2.5 text-sm border rounded-lg outline-none transition-all
                      bg-gray-50 text-gray-900 placeholder-gray-400
                      focus:bg-white focus:ring-2 focus:ring-[#cf1b22]/30 focus:border-[#cf1b22]
                      ${errors.password ? "border-red-400 bg-red-50" : "border-gray-200"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
                )}
              </motion.div>

              {/* Remember me + forgot password */}
              <motion.div
                variants={itemVariants}
                className="flex items-center justify-between"
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    {...register("rememberMe")}
                    className="w-4 h-4 rounded border-gray-300 text-[#cf1b22] accent-[#cf1b22] cursor-pointer"
                  />
                  <span className="text-sm text-gray-600">Recuérdame</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowRecovery(true)}
                  className="text-sm text-[#cf1b22] hover:text-[#a01419] font-medium transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </motion.div>

              {/* Error banner */}
              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                      <span className="w-4 h-4 flex-shrink-0">⚠️</span>
                      {loginError}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.div variants={itemVariants}>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-white transition-all
                    flex items-center justify-center gap-2 shadow-md
                    ${loginSuccess
                      ? "bg-green-500 hover:bg-green-500"
                      : "bg-[#cf1b22] hover:bg-[#a01419] active:scale-[0.98]"
                    }
                    disabled:opacity-70 disabled:cursor-not-allowed`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {loginSuccess ? "Redirigiendo…" : "Iniciando sesión…"}
                    </>
                  ) : (
                    <>
                      <LogIn size={16} />
                      Iniciar sesión
                    </>
                  )}
                  {loginSuccess && !isLoading && <CheckCircle2 size={16} />}
                </button>
              </motion.div>
            </form>
            )}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 text-center">
          <p className="text-xs text-gray-400">
            © 2026 PARTEQUIPOS MAQUINARIA. Plataforma Empresarial de Posventa
          </p>
        </div>
      </div>
    </div>
  );
}
