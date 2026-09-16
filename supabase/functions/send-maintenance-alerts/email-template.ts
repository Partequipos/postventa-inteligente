import { resolveNearestSede } from './nearest-sede.ts';

export type TipoAlerta = 'primer' | 'segundo' | 'tercer';

export interface EquipoAlertaRow {
  id: string;
  legacy_id: number | null;
  serie: string;
  modelo: string;
  marca: string;
  titulo: string | null;
  asesor_email: string | null;
  sede: string | null;
  horometro: number | null;
  latitud: number | null;
  longitud: number | null;
  nit: string | null;
  telefono: string | null;
  email: string | null;
  observaciones: string | null;
  tipo_mtto: number | null;
  fecha_primer_mtto: string | null;
  fecha_segundo_mtto: string | null;
  fecha_tercer_mtto: string | null;
  distancia_bogota?: number | null;
  distancia_medellin?: number | null;
  distancia_barranquilla?: number | null;
  distancia_monteria?: number | null;
  distancia_cali?: number | null;
  distancia_bucaramanga?: number | null;
  distancia_ibague?: number | null;
  distancia_istmina?: number | null;
  distancia_caucasia?: number | null;
  distancia_villavicencio?: number | null;
}

export const PARTEQUIPOS_LOGO_URL =
  'https://res.cloudinary.com/dbufrzoda/image/upload/v1750457354/Captura_de_pantalla_2025-06-20_170819_wzmyli.png';

const BRAND = '#cf1b22';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return v ? escapeHtml(v) : '—';
}

function formatHorometro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value)).toLocaleString('es-CO')} horas`;
}

function formatCoord(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return String(Number(value));
}

function resolveOpportunityId(row: EquipoAlertaRow): string {
  if (row.legacy_id != null && Number.isFinite(row.legacy_id)) {
    return String(Math.trunc(row.legacy_id));
  }
  return row.id.slice(0, 8).toUpperCase();
}

export function maintenanceTypeLabel(
  tipoMtto: number | null,
  tipoAlerta: TipoAlerta
): string {
  if (tipoMtto != null && tipoMtto >= 250) {
    return `Mantenimiento de ${Math.trunc(tipoMtto)} horas`;
  }
  const labels: Record<TipoAlerta, string> = {
    primer: 'Primer mantenimiento preventivo',
    segundo: 'Segundo mantenimiento preventivo',
    tercer: 'Tercer mantenimiento preventivo',
  };
  return labels[tipoAlerta];
}

function buildContactObservations(row: EquipoAlertaRow): string {
  const parts: string[] = [];
  if (row.nit?.trim()) parts.push(`NIT: ${row.nit.trim()}`);
  if (row.email?.trim()) parts.push(row.email.trim());
  if (row.telefono?.trim()) parts.push(row.telefono.trim());
  const contact = parts.length > 0 ? parts.join(' / ') : 'Sin datos de contacto';
  const base = row.observaciones?.trim();
  if (base) {
    return `Contactar email o teléfono o tener presente: ${contact}. ${base}`;
  }
  return `Contactar email o teléfono o tener presente: ${contact}`;
}

export function buildAlertSubject(row: EquipoAlertaRow): string {
  const cliente = (row.titulo ?? 'Cliente').trim();
  return `🌟 Oportunidad MTTO Preventivo — ${cliente} — ${row.modelo} ${row.serie}`;
}

export function buildAlertHtml(
  row: EquipoAlertaRow,
  tipoAlerta: TipoAlerta,
  fechaProgramada: string
): string {
  const cliente = text(row.titulo);
  const modelo = text(row.modelo);
  const serie = text(row.serie);
  const tipoLabel = maintenanceTypeLabel(row.tipo_mtto, tipoAlerta);
  const opportunityId = resolveOpportunityId(row);
  const sedeCercana = text(resolveNearestSede(row as unknown as Record<string, unknown>, row.sede));
  const observaciones = escapeHtml(buildContactObservations(row));
  const bannerLine = `SE GENERA PARA DENTRO DE UNA SEMANA UNA OPORTUNIDAD DE MANTENIMIENTO PREVENTIVO CON EL CLIENTE: ${(row.titulo ?? 'CLIENTE').toUpperCase()} CON EL EQUIPO: ${(row.modelo ?? '').toUpperCase()} SERIE: ${(row.serie ?? '').toUpperCase()} CON ${tipoLabel.toUpperCase()}.`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Oportunidad de Mantenimiento Preventivo</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:20px 24px;border-bottom:3px solid ${BRAND};">
              <img src="${PARTEQUIPOS_LOGO_URL}" alt="PARTEQUIPOS" width="180" style="display:block;max-width:180px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;background:#fff7ed;font-size:13px;line-height:1.5;color:#9a3412;">
              🌟 🌟 ${escapeHtml(bannerLine)}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 16px;font-size:20px;color:${BRAND};">Oportunidad de Mantenimiento Preventivo</h1>

              <h2 style="margin:24px 0 8px;font-size:14px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Detalles del Servicio</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;">
                <tr><td style="padding:4px 0;width:160px;color:#64748b;">ID</td><td style="padding:4px 0;"><strong>${opportunityId}</strong></td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Cliente</td><td style="padding:4px 0;">${cliente}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Modelo</td><td style="padding:4px 0;">${modelo}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Sede más Cercana</td><td style="padding:4px 0;">${sedeCercana}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Latitud</td><td style="padding:4px 0;">${formatCoord(row.latitud)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Longitud</td><td style="padding:4px 0;">${formatCoord(row.longitud)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Tipo</td><td style="padding:4px 0;"><strong>${escapeHtml(tipoLabel)}</strong></td></tr>
              </table>

              <h2 style="margin:24px 0 8px;font-size:14px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">Gestiona la Oportunidad</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;">
                <tr><td style="padding:4px 0;width:160px;color:#64748b;">ID</td><td style="padding:4px 0;">${opportunityId}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Cliente</td><td style="padding:4px 0;">${cliente}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Modelo</td><td style="padding:4px 0;">${modelo}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Serie</td><td style="padding:4px 0;"><strong>${serie}</strong></td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Horómetro</td><td style="padding:4px 0;">${formatHorometro(row.horometro)}</td></tr>
                <tr><td style="padding:4px 0;color:#64748b;">Fecha de Oportunidad</td><td style="padding:4px 0;"><strong>${escapeHtml(fechaProgramada)}</strong></td></tr>
                <tr><td style="padding:4px 0;color:#64748b;vertical-align:top;">Observaciones</td><td style="padding:4px 0;">${observaciones}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;line-height:1.5;">
              © ${new Date().getFullYear()} PARTEQUIPOS | (+57) 317 670 7071 | info@partequipos.com<br/>
              Alerta automática — 7 días antes del mantenimiento proyectado (telemetría).
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
