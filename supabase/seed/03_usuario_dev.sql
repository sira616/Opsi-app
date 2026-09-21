-- ═══════════════════════════════════════════════════════════════════════════
-- Usuario de desarrollo.
--
--     usuario:     syreta
--     contraseña:  opsi-dev-2026
--
-- ⚠️  SOLO PARA DESARROLLO LOCAL.
--
-- Los seeds corren con `db:reset`, que es un comando local. Aun así, esto es
-- una cuenta con contraseña conocida escrita en un repositorio: si algún día
-- se ejecutan los seeds contra un proyecto de la nube, hay que borrar este
-- fichero antes. No hay forma de que una contraseña en git sea segura.
--
-- Se escribe directamente en auth.users porque GoTrue no tiene forma de
-- sembrar usuarios, y hace falta un usuario listo tras cada reinicio de la
-- base sin tener que registrarse a mano.
--
-- Los detalles que hacen que GoTrue lo acepte, y que se descubren por las
-- malas:
--   · Las columnas de token van a cadena vacía, NO a null: GoTrue las lee como
--     texto y revienta con null.
--   · Hace falta una fila en auth.identities, o el inicio de sesión por
--     contraseña falla en las versiones recientes.
--   · email_confirmed_at relleno, o pediría confirmar un correo que no existe.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_id       uuid := 'dec0de00-0000-4000-8000-000000000001';
  v_email    text;
  v_password text := 'opsi-dev-2026';
begin
  -- El correo sintético: lo que la app construye a partir del usuario.
  v_email := 'syreta@' || public.dominio_sintetico();

  if exists (select 1 from auth.users where email = v_email) then
    raise notice 'El usuario syreta ya existe.';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"syreta"}'::jsonb,
    '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    v_id::text,
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  raise notice 'Usuario de desarrollo listo: syreta / %', v_password;
end;
$$;
