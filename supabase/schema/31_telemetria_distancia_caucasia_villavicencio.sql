-- ═══════════════════════════════════════════════════════════════════════════════
-- 31 · Telemetría: distancias Caucasia y Villavicencio
-- Ejecutar en Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE telemetria_equipos
  ADD COLUMN IF NOT EXISTS distancia_caucasia NUMERIC(18, 6);

ALTER TABLE telemetria_equipos
  ADD COLUMN IF NOT EXISTS distancia_villavicencio NUMERIC(18, 6);

COMMENT ON COLUMN telemetria_equipos.distancia_caucasia IS
  'Distancia (km) a sede Caucasia — columna Excel Distancia Caucasia.';

COMMENT ON COLUMN telemetria_equipos.distancia_villavicencio IS
  'Distancia (km) a sede Villavicencio — columna Excel Distancia Villavicencio.';
