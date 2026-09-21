-- ═══════════════════════════════════════════════════════════════════════════
-- El usuario pasa a ser la identidad; el correo, opcional.
--
-- Supabase Auth (GoTrue) solo sabe autenticar por correo o por teléfono: no
-- existe el inicio de sesión por nombre de usuario. La salida estándar, y la
-- que se toma aquí, es darle un correo SINTÉTICO derivado del usuario:
--
--     syreta  →  syreta@usuarios.opsi.local
--
-- Ese correo no recibe nada y nunca sale de la base. Para el usuario, la app
-- pide usuario y contraseña y no menciona ningún correo.
--
-- Ventaja lateral y nada pequeña: GoTrue ya exige que el correo sea único, así
-- que el nombre de usuario es único gratis, sin una consulta previa desde el
-- cliente que permitiría averiguar qué usuarios existen.
--
-- Cuando alguien quiera recuperar su contraseña, añadirá un correo de verdad
-- desde los ajustes. Eso REEMPLAZA el correo sintético por el real —GoTrue lo
-- confirma con un enlace—, y a partir de ahí la recuperación estándar de
-- Supabase funciona sin que tengamos que inventar nada.
-- ═══════════════════════════════════════════════════════════════════════════

/** El dominio del correo sintético. Nada se envía nunca aquí. */
create function public.dominio_sintetico()
returns text
language sql
immutable
as $$ select 'usuarios.opsi.local'::text $$;

comment on function public.dominio_sintetico() is
  'Dominio de los correos sintéticos. Un correo que acaba así significa que '
  'ese usuario todavía no ha añadido uno de verdad.';

-- ── El nombre de usuario ──────────────────────────────────────────────────
alter table public.user_settings
  add column username text;

update public.user_settings s
   set username = split_part(u.email, '@', 1)
  from auth.users u
 where u.id = s.user_id
   and s.username is null;

alter table public.user_settings
  alter column username set not null,
  add constraint user_settings_username_ck
    check (username ~ '^[a-z0-9_]{3,20}$');

-- Único de verdad, sin distinguir mayúsculas: «Syreta» y «syreta» son el
-- mismo. El nombre se guarda ya en minúsculas, pero el índice lo garantiza
-- aunque algún día se inserte desde otro sitio.
create unique index user_settings_username_key
  on public.user_settings (lower(username));

comment on column public.user_settings.username is
  'La identidad visible. Inmutable en el MVP: cambiarlo obligaría a cambiar '
  'también el correo sintético, y eso rompería las sesiones abiertas.';

-- ── El trigger de alta lo rellena ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_username     text;
begin
  -- Del metadato que manda la app al registrarse; si no llega, de la parte
  -- local del correo, que con el correo sintético es el propio usuario.
  v_username := lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  ));

  insert into public.households (name)
  values ('Mi casa')
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  insert into public.user_settings (user_id, username)
  values (new.id, v_username)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ── Saber si ya hay un correo de verdad ───────────────────────────────────
--
-- La app necesita distinguir «sin correo» de «con correo» para la pantalla de
-- ajustes, y el correo vive en auth.users, que no es consultable desde el
-- cliente. Esta función expone solo lo justo: el correo del propio usuario, y
-- null cuando todavía es el sintético.
create function public.mi_correo()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when u.email like ('%@' || public.dominio_sintetico()) then null
           else u.email
         end
  from auth.users u
  where u.id = (select auth.uid());
$$;

comment on function public.mi_correo() is
  'El correo real del usuario que pregunta, o null si aún usa el sintético. '
  'SECURITY DEFINER porque auth.users no es consultable desde el cliente, y '
  'filtrada por auth.uid(): nadie puede leer el correo de otro.';

revoke all on function public.mi_correo() from public, anon;
grant execute on function public.mi_correo() to authenticated;
revoke all on function public.dominio_sintetico() from public;
grant execute on function public.dominio_sintetico() to anon, authenticated;

-- ── El usuario no se cambia ───────────────────────────────────────────────
--
-- Cambiarlo dejaría el correo sintético apuntando al nombre viejo: se
-- seguiría entrando con el anterior mientras la app enseña el nuevo. Hasta
-- que exista un flujo que cambie las dos cosas a la vez, se impide en el
-- motor y no solo en la app.
--
-- Se hace quitando el UPDATE de tabla y devolviéndolo por columnas: revocar
-- una sola columna de un permiso concedido a nivel de tabla no surte efecto
-- en PostgreSQL, el permiso de tabla sigue cubriéndolas todas.
--
-- Contrapartida: cada columna nueva que deba poder editarse hay que añadirla
-- aquí. Es el precio de que la inmutabilidad sea real.
revoke update on public.user_settings from authenticated;
grant update (
  timezone,
  digest_enabled,
  digest_hour,
  push_token,
  push_token_updated_at,
  auto_add_to_shopping_list,
  locale
) on public.user_settings to authenticated;
