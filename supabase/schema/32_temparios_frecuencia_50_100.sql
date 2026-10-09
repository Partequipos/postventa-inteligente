-- Frecuencias “Primeras N horas”, independientes de la fórmula 250/1000/2000/4000/5000.
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE temparios_mantenimiento
  ADD COLUMN IF NOT EXISTS frecuencia_grupo TEXT NOT NULL DEFAULT 'intervalo';

ALTER TABLE temparios_mantenimiento
  DROP CONSTRAINT IF EXISTS temparios_mantenimiento_frecuencia_grupo_check;

ALTER TABLE temparios_mantenimiento
  ADD CONSTRAINT temparios_mantenimiento_frecuencia_grupo_check
  CHECK (frecuencia_grupo IN ('intervalo', 'primeras'));

ALTER TABLE temparios_mantenimiento
  DROP CONSTRAINT IF EXISTS temparios_mantenimiento_frecuencia_horas_check;

ALTER TABLE temparios_mantenimiento
  ADD CONSTRAINT temparios_mantenimiento_frecuencia_horas_check
  CHECK (frecuencia_horas IN (50, 100, 250, 500, 1000, 2000, 2500, 4000, 5000));

UPDATE temparios_mantenimiento
SET frecuencia_grupo = 'primeras'
WHERE frecuencia_horas IN (50, 100, 500, 2500);

CREATE OR REPLACE FUNCTION get_frecuencias_por_horometro(p_horometro INTEGER)
RETURNS INTEGER[] AS $$
DECLARE
  v_row maintenance_frequency_matrix%ROWTYPE;
  v_freqs INTEGER[] := '{}';
BEGIN
  SELECT * INTO v_row
  FROM maintenance_frequency_matrix
  WHERE horometro = p_horometro
  LIMIT 1;

  IF NOT FOUND THEN
    IF p_horometro >= 250 AND p_horometro % 250 = 0 THEN
      v_freqs := array_append(v_freqs, 250);
    END IF;
    RETURN v_freqs;
  END IF;

  IF v_row.frecuencia_250 THEN v_freqs := array_append(v_freqs, 250); END IF;
  IF v_row.frecuencia_1000 THEN v_freqs := array_append(v_freqs, 1000); END IF;
  IF v_row.frecuencia_2000 THEN v_freqs := array_append(v_freqs, 2000); END IF;
  IF v_row.frecuencia_4000 THEN v_freqs := array_append(v_freqs, 4000); END IF;
  IF v_row.frecuencia_5000 THEN v_freqs := array_append(v_freqs, 5000); END IF;

  RETURN v_freqs;
END;
$$ LANGUAGE plpgsql STABLE;
