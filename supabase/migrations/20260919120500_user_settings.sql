-- ═══════════════════════════════════════════════════════════════════════════
-- Ajustes del usuario.
--
-- Única tabla que NO cuelga de un hogar: la hora a la que quieres el aviso y
-- el token de tu móvil son tuyos, no de tu casa. Cuando el hogar sea
-- compartido, cada miembro tendrá su propio resumen a su propia hora.
--
-- Por eso su política RLS no usa is_household_member(), sino la comparación
-- directa con auth.uid().
-- ═══════════════════════════════════════════════════════════════════════════

create table public.user_settings (
  user_id                    uuid primary key
                             references auth.users (id) on delete cascade,

  -- Necesaria para el resumen diario (fase 3): «las 9:00» significa cosas
  -- distintas según dónde estés, y el aviso se programa en UTC.
  timezone                   text not null default 'Europe/Madrid'
                             check (length(timezone) between 1 and 64),

  digest_enabled             boolean not null default true,
  digest_hour                smallint not null default 9
                             check (digest_hour between 0 and 23),

  -- Token de notificaciones push de Expo. Es un identificador de dispositivo,
  -- no una credencial, pero solo su dueño lo ve: la RLS lo garantiza.
  push_token                 text,
  push_token_updated_at      timestamptz,

  -- Desactivado por defecto, y esto no es una preferencia de diseño: es el
  -- principio «nada se añade solo a la lista salvo que el usuario lo active
  -- expresamente» convertido en un valor por defecto.
  auto_add_to_shopping_list  boolean not null default false,

  locale                     text not null default 'es'
                             check (locale in ('es', 'en')),

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint user_settings_push_token_ck
    check ((push_token is null) = (push_token_updated_at is null))
);

comment on column public.user_settings.timezone is
  'Nombre IANA, p. ej. Europe/Madrid. No se valida contra pg_timezone_names '
  'porque un CHECK no admite subconsultas; lo valida la aplicación.';

-- El resumen diario (fase 3) barre por hora: «dame todos los usuarios que
-- quieren su aviso a esta hora». Este índice es para esa consulta.
create index user_settings_digest_idx
  on public.user_settings (digest_hour)
  where digest_enabled;

create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.user_settings enable row level security;

create policy user_settings_select on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- El INSERT normalmente no hace falta (la fila la crea el trigger de alta),
-- pero se permite para que un usuario anterior a esta tabla pueda crearla.
create policy user_settings_insert on public.user_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_settings_update on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Sin DELETE: los ajustes desaparecen con la cuenta, por el ON DELETE CASCADE.

revoke all on public.user_settings from anon;
grant select, insert, update on public.user_settings to authenticated;
