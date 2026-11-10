-- ═══════════════════════════════════════════════════════════════════════════════
-- MÓDULO LCC — ciclo de vida de componentes por tipo/modelo y horómetro
-- Ejecutar en SQL Editor de Supabase (producción).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lcc_componentes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clave             TEXT NOT NULL,
  tipo_maquina      TEXT NOT NULL,
  modelo            TEXT NOT NULL,
  componente        TEXT NOT NULL,
  horometro_horas   NUMERIC(18, 2) NOT NULL CHECK (horometro_horas > 0),
  n_parte           TEXT,
  descripcion       TEXT,
  cantidad          NUMERIC(18, 3),
  grupo             TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  import_batch_id   UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT,
  updated_by        TEXT,
  CONSTRAINT uq_lcc_componentes_clave UNIQUE (clave)
);

CREATE INDEX IF NOT EXISTS idx_lcc_activo ON public.lcc_componentes (activo);
CREATE INDEX IF NOT EXISTS idx_lcc_tipo ON public.lcc_componentes (tipo_maquina);
CREATE INDEX IF NOT EXISTS idx_lcc_modelo ON public.lcc_componentes (modelo);
CREATE INDEX IF NOT EXISTS idx_lcc_grupo ON public.lcc_componentes (grupo);
CREATE INDEX IF NOT EXISTS idx_lcc_horometro ON public.lcc_componentes (horometro_horas);
CREATE INDEX IF NOT EXISTS idx_lcc_batch ON public.lcc_componentes (import_batch_id);

COMMENT ON TABLE public.lcc_componentes IS
  'Catálogo LCC: componentes a verificar/cambiar según horómetro del fabricante.';

-- importaciones.modulo: permitir 'lcc'
ALTER TABLE public.importaciones DROP CONSTRAINT IF EXISTS importaciones_modulo_check;
ALTER TABLE public.importaciones
  ADD CONSTRAINT importaciones_modulo_check
  CHECK (modulo IN ('calculadora', 'proyectados', 'cpp', 'lcc'));

-- estado revertido (lotes eliminados)
ALTER TABLE public.importaciones DROP CONSTRAINT IF EXISTS importaciones_estado_check;
ALTER TABLE public.importaciones
  ADD CONSTRAINT importaciones_estado_check
  CHECK (estado IN ('procesando', 'completado', 'fallido', 'parcial', 'revertido'));

ALTER TABLE public.lcc_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcc_select ON public.lcc_componentes;
CREATE POLICY lcc_select ON public.lcc_componentes FOR SELECT
  TO authenticated USING (activo = TRUE OR auth_user_rol() IN ('administrador', 'coordinador'));

DROP POLICY IF EXISTS lcc_insert ON public.lcc_componentes;
CREATE POLICY lcc_insert ON public.lcc_componentes FOR INSERT
  TO authenticated WITH CHECK (auth_user_rol() IN ('administrador', 'coordinador'));

DROP POLICY IF EXISTS lcc_update ON public.lcc_componentes;
CREATE POLICY lcc_update ON public.lcc_componentes FOR UPDATE
  TO authenticated USING (auth_user_rol() IN ('administrador', 'coordinador'));

DROP POLICY IF EXISTS lcc_delete ON public.lcc_componentes;
CREATE POLICY lcc_delete ON public.lcc_componentes FOR DELETE
  TO authenticated USING (auth_user_rol() IN ('administrador'));
