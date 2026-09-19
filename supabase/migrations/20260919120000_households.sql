-- ═══════════════════════════════════════════════════════════════════════════
-- Hogares y pertenencia.
--
-- Es la migración fundacional: `household_members` define quién ve qué, y
-- todas las políticas RLS del resto del esquema se apoyan en la función
-- `is_household_member()` que se crea aquí.
--
-- En el MVP hay exactamente un hogar por usuario, creado por el trigger de
-- alta (ver 20260919120600_new_user_trigger.sql). El hogar compartido está
-- fuera del MVP, pero el modelo ya lo soporta: solo falta poder invitar.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.household_role as enum ('owner', 'member');

-- ── Utilidad compartida: mantener updated_at al día ───────────────────────
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'Trigger BEFORE UPDATE: refresca updated_at. Se reutiliza en todas las tablas.';

-- ── households ────────────────────────────────────────────────────────────
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Mi casa'
              check (length(trim(name)) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.households is
  'Unidad de aislamiento de datos. Todo lo demás cuelga de aquí.';

create trigger households_touch_updated_at
  before update on public.households
  for each row execute function public.touch_updated_at();

-- ── household_members ─────────────────────────────────────────────────────
create table public.household_members (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.household_role not null default 'member',
  created_at    timestamptz not null default now(),

  primary key (household_id, user_id)
);

comment on table public.household_members is
  'Quién pertenece a qué hogar. La tabla de la que depende toda la seguridad.';

-- La clave primaria ya indexa (household_id, user_id). Este índice sirve al
-- camino contrario, que es el que recorre is_household_member(): dado un
-- usuario, sus hogares.
create index household_members_user_id_idx
  on public.household_members (user_id);

-- ── La función sobre la que se construye toda la RLS ──────────────────────
--
-- SECURITY DEFINER no es un descuido: es imprescindible. Esta función se usa
-- dentro de la política de la propia tabla household_members, y si se
-- ejecutase con los permisos de quien consulta, leer la tabla volvería a
-- evaluar la política, que volvería a llamar a la función: recursión infinita
-- (Postgres corta con "infinite recursion detected in policy"). Ejecutándose
-- como el propietario, la lectura interna no pasa por RLS y el ciclo se rompe.
--
-- El precio de SECURITY DEFINER es que hay que blindarla:
--   · search_path = '' obliga a cualificar cada nombre, así nadie puede
--     colar un esquema propio por delante y suplantar una tabla.
--   · No recibe más parámetro que el hogar a comprobar, y el usuario sale
--     siempre de auth.uid(), nunca de un argumento.
create function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
  );
$$;

comment on function public.is_household_member(uuid) is
  '¿El usuario autenticado pertenece a este hogar? Única definición de la '
  'frontera entre hogares: todas las políticas RLS la usan.';

revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.households        enable row level security;
alter table public.household_members enable row level security;

create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- Sin política de INSERT ni de DELETE, a propósito:
--   · Los hogares los crea el trigger de alta, que es SECURITY DEFINER.
--     Nadie necesita crear uno a mano, y permitirlo abriría la puerta a
--     hogares huérfanos sin miembros.
--   · Borrar un hogar dejaría al usuario sin ninguno, y todas las políticas
--     asumen que siempre tiene uno. Si algún día hace falta, será una función
--     con su lógica, no un DELETE suelto.

create policy household_members_select on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

-- Sin políticas de escritura: las invitaciones son posteriores al MVP. Cuando
-- lleguen, serán una función RPC que valide el rol de quien invita, no un
-- INSERT abierto — si no, cualquiera podría añadirse a un hogar ajeno.

-- ── Permisos de tabla ─────────────────────────────────────────────────────
-- RLS filtra filas; los GRANT deciden quién puede siquiera intentarlo. Las
-- dos capas son necesarias: sin GRANT, la RLS nunca llega a evaluarse.
revoke all on public.households        from anon;
revoke all on public.household_members from anon;

grant select, update on public.households        to authenticated;
grant select         on public.household_members to authenticated;
