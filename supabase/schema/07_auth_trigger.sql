-- Trigger: crear perfil al registrar usuario en Auth
-- Ejecutar en SQL Editor después de 04_shared.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Rol fijo visualizador: el cliente no puede autoasignarse privilegios.
  -- La creación admin hace upsert posterior con el rol correcto.
  INSERT INTO public.perfiles (id, email, nombre, rol, activo)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(COALESCE(NEW.email, 'usuario'), '@', 1)),
    'visualizador',
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS
  'Crea fila en perfiles al registrarse un usuario en Supabase Auth.';
