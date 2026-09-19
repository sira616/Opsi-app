-- ═══════════════════════════════════════════════════════════════════════════
-- Registro de eventos del inventario.
--
-- Append-only: se escribe y no se toca más. No hay política de UPDATE ni de
-- DELETE, así que la RLS las deniega por omisión — un registro que se puede
-- reescribir no es un registro.
--
-- Existe desde la fase 0 aunque no se use hasta después del MVP, y esa es
-- justamente la razón de crearla ahora: los patrones de consumo y desperdicio
-- necesitan historia, y la historia no se puede reconstruir a posteriori.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.inventory_event_type as enum (
  'created',
  'opened',
  'quantity_used',
  'frozen',
  'thawed',
  'finished',
  'discarded',
  'updated'
);

create table public.inventory_events (
  id              bigint generated always as identity primary key,

  -- Denormalizado a propósito: sin esto, la política RLS tendría que hacer un
  -- JOIN con inventory_items en cada fila leída. Y además el evento debe
  -- seguir perteneciendo a un hogar aunque su elemento desaparezca.
  household_id    uuid not null references public.households (id) on delete cascade,

  -- ON DELETE SET NULL, no CASCADE: si se borra el elemento, su historia
  -- sobrevive. «Se tiró un yogur el martes» sigue siendo cierto.
  item_id         uuid references public.inventory_items (id) on delete set null,

  -- Quién lo hizo. Sirve de poco con un usuario por hogar, pero es lo que
  -- permitirá decir «lo abrió Ana» cuando el hogar sea compartido.
  user_id         uuid references auth.users (id) on delete set null,

  type            public.inventory_event_type not null,

  -- Cantidad consumida en este evento, en unidad base y en positivo.
  -- Solo la llevan los eventos que mueven cantidad.
  quantity_used   numeric check (quantity_used > 0),

  -- Contexto libre: estado anterior y posterior, motivo de descarte, si vino
  -- del chat o del escáner… Lo que haga falta sin migrar la tabla.
  payload         jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),

  constraint inventory_events_quantity_ck check (
    (type = 'quantity_used') = (quantity_used is not null)
  )
);

comment on table public.inventory_events is
  'Registro inmutable de acciones sobre el inventario. Sin UPDATE ni DELETE, '
  'por diseño.';

create index inventory_events_household_idx
  on public.inventory_events (household_id, created_at desc);

create index inventory_events_item_idx
  on public.inventory_events (item_id, created_at desc)
  where item_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.inventory_events enable row level security;

create policy inventory_events_select on public.inventory_events
  for select to authenticated
  using (public.is_household_member(household_id));

-- El INSERT directo existe para que la app pueda registrar mientras no estén
-- las funciones RPC de la fase 1. A partir de entonces, la vía buena es la
-- RPC, que actualiza el elemento y escribe el evento en la MISMA transacción:
-- si se hacen como dos llamadas, un fallo de red entre ambas deja el
-- inventario sin su rastro.
create policy inventory_events_insert on public.inventory_events
  for insert to authenticated
  with check (
    public.is_household_member(household_id)
    and (user_id is null or user_id = (select auth.uid()))
  );

-- Sin UPDATE ni DELETE: que no exista la política es lo que los prohíbe.

revoke all on public.inventory_events from anon;
grant select, insert on public.inventory_events to authenticated;
