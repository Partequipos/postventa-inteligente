-- Equivalencias de modelo LCC (ej. ZX200-6 ≡ ZX210LC-6 / ZX210K-6 / ZX210LCH-6)
-- Ejecutar en SQL Editor de Supabase.

ALTER TABLE public.lcc_componentes
  ADD COLUMN IF NOT EXISTS modelos_equivalentes TEXT;

COMMENT ON COLUMN public.lcc_componentes.modelos_equivalentes IS
  'Modelos equivalentes separados por " / ". Si el catálogo trae ZX200-6, aplica a ZX210LC-6, etc.';
