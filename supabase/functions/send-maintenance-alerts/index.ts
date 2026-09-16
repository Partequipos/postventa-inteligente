/**
 * Edge Function: send-maintenance-alerts
 * Cron diario 08:00 COT: envía alertas 7 días antes de fecha_primer/segundo/tercer_mtto.
 *
 * Deploy: supabase functions deploy send-maintenance-alerts
 * Schedule: 0 13 * * * (08:00 America/Bogota)
 *
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   GMAIL_USER=storageentrenapartequipos@gmail.com
 *   GMAIL_APP_PASSWORD=<contraseña de aplicación Gmail>
 *   ALERT_FROM_EMAIL=storageentrenapartequipos@gmail.com  (opcional)
 *   ALERT_FALLBACK_EMAIL=centrodemonitoreo@partequipos.com  (opcional)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {
  buildAlertHtml,
  buildAlertSubject,
  type EquipoAlertaRow,
  type TipoAlerta,
} from './email-template.ts';
import { sendAlertEmail } from './gmail-sender.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const BOGOTA_TZ = 'America/Bogota';
const TELEMETRIA_SELECT =
  'id, legacy_id, serie, modelo, marca, titulo, asesor_email, sede, horometro, latitud, longitud, nit, telefono, email, observaciones, tipo_mtto, fecha_primer_mtto, fecha_segundo_mtto, fecha_tercer_mtto, distancia_bogota, distancia_medellin, distancia_barranquilla, distancia_monteria, distancia_cali, distancia_bucaramanga, distancia_ibague, distancia_istmina, distancia_caucasia, distancia_villavicencio';

function todayBogotaIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ }).format(new Date());
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function alertCandidates(
  equipo: EquipoAlertaRow,
  targetDate: string
): Array<{ tipo: TipoAlerta; fecha: string }> {
  const out: Array<{ tipo: TipoAlerta; fecha: string }> = [];
  if (equipo.fecha_primer_mtto === targetDate) {
    out.push({ tipo: 'primer', fecha: equipo.fecha_primer_mtto });
  }
  if (equipo.fecha_segundo_mtto === targetDate) {
    out.push({ tipo: 'segundo', fecha: equipo.fecha_segundo_mtto! });
  }
  if (equipo.fecha_tercer_mtto === targetDate) {
    out.push({ tipo: 'tercer', fecha: equipo.fecha_tercer_mtto! });
  }
  return out;
}

function resolveDestinatario(equipo: EquipoAlertaRow): string {
  const email = equipo.asesor_email?.trim();
  if (email?.includes('@')) return email;
  return (
    Deno.env.get('ALERT_FALLBACK_EMAIL')?.trim() ?? 'centrodemonitoreo@partequipos.com'
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== cronSecret && req.method !== 'OPTIONS') {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(supabaseUrl, serviceKey);

    const today = todayBogotaIso();
    const targetDate = addDaysIso(today, 7);

    const { data: equipos, error } = await admin
      .from('telemetria_equipos')
      .select(TELEMETRIA_SELECT)
      .or(
        `fecha_primer_mtto.eq.${targetDate},fecha_segundo_mtto.eq.${targetDate},fecha_tercer_mtto.eq.${targetDate}`
      );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let created = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const hasMailConfig =
      Boolean(Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')) ||
      Boolean(Deno.env.get('RESEND_API_KEY'));

    for (const raw of equipos ?? []) {
      const equipo = raw as EquipoAlertaRow;
      const candidates = alertCandidates(equipo, targetDate);

      for (const candidate of candidates) {
        const destinatario = resolveDestinatario(equipo);

        const { data: existing } = await admin
          .from('alertas_mantenimiento')
          .select('id, estado')
          .eq('telemetria_id', equipo.id)
          .eq('tipo_alerta', candidate.tipo)
          .eq('fecha_programada', candidate.fecha)
          .maybeSingle();

        if (existing?.estado === 'enviado') {
          skipped += 1;
          continue;
        }

        let alertaId = existing?.id as string | undefined;
        if (!alertaId) {
          const { data: inserted, error: insertError } = await admin
            .from('alertas_mantenimiento')
            .insert({
              telemetria_id: equipo.id,
              tipo_alerta: candidate.tipo,
              fecha_programada: candidate.fecha,
              destinatario,
              estado: 'pendiente',
            })
            .select('id')
            .single();

          if (insertError) {
            console.error(insertError.message);
            continue;
          }
          alertaId = inserted.id;
          created += 1;
        }

        const subject = buildAlertSubject(equipo);
        const html = buildAlertHtml(equipo, candidate.tipo, candidate.fecha);

        const ok = hasMailConfig
          ? await sendAlertEmail({ to: destinatario, subject, html })
          : false;

        const estado = ok ? 'enviado' : hasMailConfig ? 'fallido' : 'pendiente';
        const nowIso = new Date().toISOString();

        await admin
          .from('alertas_mantenimiento')
          .update({
            estado,
            destinatario,
            fecha_envio: ok ? nowIso : null,
          })
          .eq('id', alertaId);

        if (ok) {
          sent += 1;
          await admin
            .from('telemetria_equipos')
            .update({
              correo_enviado: nowIso.slice(0, 10),
              updated_at: nowIso,
            })
            .eq('id', equipo.id);
        } else if (hasMailConfig) {
          failed += 1;
        }
      }
    }

    return new Response(
      JSON.stringify({
        todayBogota: today,
        targetMaintenanceDate: targetDate,
        equiposEvaluados: equipos?.length ?? 0,
        alertasCreadas: created,
        alertasEnviadas: sent,
        alertasFallidas: failed,
        omitidas: skipped,
        mailConfigured: hasMailConfig,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
