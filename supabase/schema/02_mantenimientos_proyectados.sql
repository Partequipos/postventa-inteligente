-- ═══════════════════════════════════════════════════════════════════════════════
-- MÓDULO: Mantenimientos Proyectados (Telemetría)
-- Clientes, asesores, equipos telemetría, oportunidades de mantenimiento
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clientes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titulo      TEXT NOT NULL,
  nit         TEXT,
  telefono    TEXT,
  email       TEXT,
  ciudad      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nit ON clientes (nit);
CREATE INDEX IF NOT EXISTS idx_clientes_titulo ON clientes USING gin (titulo gin_trgm_ops);

CREATE TABLE IF NOT EXISTS asesores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  sede        TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetria_equipos (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_id               INTEGER,
  titulo                  TEXT,
  email                   TEXT,
  nit                     TEXT,
  telefono                TEXT,
  serie                   TEXT NOT NULL,
  modelo                  TEXT NOT NULL,
  horometro               NUMERIC(18, 3) NOT NULL DEFAULT 0,
  promedio_h              NUMERIC(18, 6),
  ciudad                  TEXT,
  ultima_fecha_comunicacion TIMESTAMPTZ,
  latitud                 NUMERIC(18, 10),
  longitud                NUMERIC(18, 10),
  dias_primer_mtto        NUMERIC(18, 6),
  proximo_primer_mtto     NUMERIC(18, 6),
  dias_segundo_mtto       NUMERIC(18, 6),
  proximo_segundo_mtto    NUMERIC(18, 6),
  dias_tercer_mtto        NUMERIC(18, 6),
  proximo_tercer_mtto     NUMERIC(18, 6),
  fecha_primer_mtto       DATE,
  fecha_segundo_mtto      DATE,
  fecha_tercer_mtto       DATE,
  distancia_bogota        NUMERIC(18, 6),
  distancia_medellin      NUMERIC(18, 6),
  distancia_barranquilla  NUMERIC(18, 6),
  distancia_monteria       NUMERIC(18, 6),
  distancia_cali          NUMERIC(18, 6),
  distancia_bucaramanga   NUMERIC(18, 6),
  distancia_ibague        NUMERIC(18, 6),
  distancia_istmina       NUMERIC(18, 6),
  distancia_caucasia      NUMERIC(18, 6),
  distancia_villavicencio NUMERIC(18, 6),
  distancia_minima        NUMERIC(18, 6),
  sede                    TEXT,
  asesor_secundario_email TEXT,
  asesor_email            TEXT,
  marca                   TEXT NOT NULL,
  tipo_mtto               INTEGER,
  numero_serie            TEXT,
  tipo_oportunidad        TEXT,
  estado                  TEXT DEFAULT 'Pendiente',
  estado2                 TEXT,
  detalle                 TEXT,
  observaciones           TEXT,
  reenviar_correo         BOOLEAN DEFAULT FALSE,
  mes_creado              TEXT,
  correo_enviado          TEXT,
  anio                    INTEGER,
  tipo_maquina            TEXT,
  cliente_compra          TEXT,
  que_compra              TEXT,
  factura                 TEXT,
  cliente_id              UUID REFERENCES clientes(id),
  asesor_id               UUID REFERENCES asesores(id),
  import_batch_id         UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetria_serie ON telemetria_equipos (serie);
CREATE INDEX IF NOT EXISTS idx_telemetria_marca ON telemetria_equipos (marca);
CREATE INDEX IF NOT EXISTS idx_telemetria_sede ON telemetria_equipos (sede);
CREATE INDEX IF NOT EXISTS idx_telemetria_estado ON telemetria_equipos (estado);
CREATE INDEX IF NOT EXISTS idx_telemetria_fecha_primer ON telemetria_equipos (fecha_primer_mtto);
CREATE INDEX IF NOT EXISTS idx_telemetria_asesor ON telemetria_equipos (asesor_email);

COMMENT ON TABLE telemetria_equipos IS
  'Base de datos mensual de telemetría por fabricante. Importación Excel.';

-- Registro de envíos automáticos de correo (1 semana de antelación)
CREATE TABLE IF NOT EXISTS alertas_mantenimiento (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telemetria_id     UUID NOT NULL REFERENCES telemetria_equipos(id) ON DELETE CASCADE,
  tipo_alerta       TEXT NOT NULL CHECK (tipo_alerta IN ('primer', 'segundo', 'tercer')),
  fecha_programada  DATE NOT NULL,
  fecha_envio       TIMESTAMPTZ,
  destinatario      TEXT NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'cancelado')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_fecha ON alertas_mantenimiento (fecha_programada, estado);

-- Insumos proyectados (vinculados a temparios + telemetría)
CREATE OR REPLACE VIEW v_insumos_proyectados AS
SELECT
  te.id AS telemetria_id,
  te.serie,
  te.modelo,
  te.marca,
  te.horometro,
  te.fecha_primer_mtto,
  te.sede,
  te.titulo AS cliente,
  tm.tipo_item,
  tm.item,
  tm.cantidad,
  tm.unidad_medida,
  tm.ref_sap_original,
  tm.frecuencia_horas,
  tm.precio_unitario,
  (tm.cantidad * COALESCE(tm.precio_unitario, 0)) AS valor_proyectado
FROM telemetria_equipos te
JOIN temparios_mantenimiento tm
  ON LOWER(tm.marca) = LOWER(te.marca)
 AND LOWER(tm.modelo) = LOWER(te.modelo)
WHERE te.estado NOT IN ('Completado', 'Cancelado')
  AND tm.activo = TRUE;

-- KPIs materializados (opcional — refrescar con cron)
CREATE OR REPLACE VIEW v_kpi_oportunidades_mes AS
SELECT
  DATE_TRUNC('month', COALESCE(fecha_primer_mtto, created_at::DATE)) AS mes,
  COUNT(*) AS total_oportunidades,
  COUNT(*) FILTER (WHERE estado = 'Enviado') AS enviadas,
  COUNT(*) FILTER (WHERE estado = 'Pendiente') AS pendientes
FROM telemetria_equipos
GROUP BY 1
ORDER BY 1;

CREATE OR REPLACE VIEW v_kpi_oportunidades_sede AS
SELECT sede, COUNT(*) AS total, marca
FROM telemetria_equipos
WHERE sede IS NOT NULL
GROUP BY sede, marca;

CREATE OR REPLACE VIEW v_kpi_oportunidades_cliente AS
SELECT titulo AS cliente, COUNT(*) AS total, SUM(horometro) AS horometro_acumulado
FROM telemetria_equipos
GROUP BY titulo
ORDER BY total DESC;

CREATE OR REPLACE VIEW v_kpi_oportunidades_marca AS
SELECT marca, COUNT(*) AS total
FROM telemetria_equipos
GROUP BY marca
ORDER BY total DESC;

-- Calendario de servicios proyectados
CREATE OR REPLACE VIEW v_calendario_mantenimientos AS
SELECT
  id,
  serie,
  modelo,
  marca,
  titulo AS cliente,
  sede,
  asesor_email,
  fecha_primer_mtto AS fecha_servicio,
  'primer' AS tipo_servicio,
  estado
FROM telemetria_equipos
WHERE fecha_primer_mtto IS NOT NULL
UNION ALL
SELECT id, serie, modelo, marca, titulo, sede, asesor_email, fecha_segundo_mtto, 'segundo', estado
FROM telemetria_equipos WHERE fecha_segundo_mtto IS NOT NULL
UNION ALL
SELECT id, serie, modelo, marca, titulo, sede, asesor_email, fecha_tercer_mtto, 'tercer', estado
FROM telemetria_equipos WHERE fecha_tercer_mtto IS NOT NULL;
