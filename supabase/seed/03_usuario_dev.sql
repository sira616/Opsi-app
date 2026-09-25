-- ═══════════════════════════════════════════════════════════════════════════
-- Usuarios de desarrollo.
--
--     usuario:     syreta   contraseña: opsi-dev-2026
--     usuario:     compi    contraseña: opsi-dev-2026
--
-- Son DOS y no uno desde que existen las neveras compartidas: crear una,
-- invitar, aceptar sin salir de la propia, echar y los dos límites (neveras por
-- persona y plazas por nevera) no se pueden probar con una sola cuenta, y
-- registrar la segunda a mano después de cada `db:reset` es la clase de paso
-- manual que se acaba saltando.
--
-- Cada una sale con SU nevera privada, que no crea este fichero sino el trigger
-- de alta (`handle_new_user`), y sin compartir NADA. Lo compartido se crea
-- desde la app o con `create_shared_household()`: sembrarlo aquí dejaría
-- cuentas de desarrollo que ya no empiezan como las de cualquier usuario nuevo,
-- y el primer «tengo el tope de neveras» sería un misterio.
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
  -- Usuario → uuid fijo. Fijos a propósito: con un uuid estable se puede
  -- escribir una consulta de depuración que siga valiendo tras el siguiente
  -- `db:reset`, y los dos se distinguen de un vistazo por el último dígito.
  v_usuarios constant jsonb := jsonb_build_object(
    'syreta', 'dec0de00-0000-4000-8000-000000000001',
    'compi',  'dec0de00-0000-4000-8000-000000000002'
  );
  v_usuario  text;
  v_id       uuid;
  v_email    text;
  v_password text := 'opsi-dev-2026';
begin
  -- ── La guarda: esto solo se siembra en el Supabase LOCAL ─────────────────
  --
  -- Estas cuentas tienen una contraseña escrita en el repositorio. El aviso de
  -- arriba dice que hay que borrar el fichero antes de enlazar un proyecto de la
  -- nube, pero eso depende de acordarse en el momento de más prisa: la CLI sube
  -- los seeds con `supabase db push --include-seed` y con `supabase db reset
  -- --linked` (que además «empieza limpio», que es justo lo que uno hace al
  -- estrenar un proyecto).
  --
  -- La base local trae `app.settings.jwt_secret` con el secreto por defecto de la
  -- CLI, que es público; un proyecto en la nube tiene otro, o ninguno. Si no es
  -- el de aquí, esto NO es el Supabase local y no se siembra nada.
  if coalesce(current_setting('app.settings.jwt_secret', true), '')
       is distinct from 'super-secret-jwt-token-with-at-least-32-characters-long'
  then
    raise notice 'Seed de desarrollo omitido: esto no es el Supabase local.';
    return;
  end if;

  for v_usuario in select jsonb_object_keys(v_usuarios) loop
    v_id := (v_usuarios ->> v_usuario)::uuid;

    -- El correo sintético: lo que la app construye a partir del usuario.
    v_email := v_usuario || '@' || public.dominio_sintetico();

    if exists (select 1 from auth.users where email = v_email) then
      raise notice 'El usuario % ya existe.', v_usuario;
      continue;
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
      jsonb_build_object('username', v_usuario),
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

    -- El trigger de alta acaba de crear la privada. Si no lo hubiera hecho, o
    -- hubiera creado otra cosa, es mejor que el reset falle aquí y diga cuál que
    -- descubrirlo al abrir la app con una cuenta sin nevera.
    if (
      select count(*)
      from public.household_members m
      join public.households h on h.id = m.household_id
      where m.user_id = v_id and h.kind = 'personal' and m.role = 'owner'
    ) <> 1
    or exists (
      select 1
      from public.household_members m
      join public.households h on h.id = m.household_id
      where m.user_id = v_id and h.kind <> 'personal'
    ) then
      raise exception 'El usuario de desarrollo % no ha quedado con una sola nevera privada y nada compartido', v_usuario;
    end if;

    raise notice 'Usuario de desarrollo listo: % / %', v_usuario, v_password;
  end loop;
end;
$$;
