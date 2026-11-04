-- Perfil al registrarse: siempre visualizador (evita escalada vía user_metadata.rol).
-- Los administradores siguen asignando rol con upsert en create-admin-user / API.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

COMMENT ON FUNCTION public.handle_new_user IS
  'Crea perfil visualizador al registrarse. El rol privilegiado solo lo asigna un administrador.';
