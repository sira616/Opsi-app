-- ═══════════════════════════════════════════════════════════════════════════
-- Elementos del inventario: el alimento concreto que tienes en casa.
--
-- Esta tabla es donde viven los principios del proyecto, convertidos en
-- restricciones que la base de datos hace cumplir:
--
--   · «No inventar datos»       → no puede haber fecha sin su origen.
--   · «Caducidad ≠ consumo      → date_kind distingue las dos, y nunca se
--      preferente»                 guarda una fecha sin decir cuál es.
--   · Unidades (decisión D-07)  → la cantidad se guarda en unidad base y la
--                                 familia limita qué unidades son válidas.
--
-- Un check no es burocracia: es la diferencia entre que el dato malo entre y
-- se propague, o que reviente donde se escribió.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.item_state as enum (
  'closed',              -- cerrado: vale la fecha del envase
  'open',                -- abierto: manda la conservación tras apertura
  'partially_consumed',  -- abierto y con menos cantidad de la inicial
  'frozen',              -- congelado: la cuenta atrás se detiene
  'thawed',              -- descongelado: consumo rápido
  'finished',            -- agotado: puede disparar la reposición
  'discarded'            -- desechado: alimenta los patrones de desperdicio
);

create type public.storage_location as enum ('pantry', 'fridge', 'freezer', 'other');

create type public.date_kind as enum (
  'expiry',       -- caducidad: pasada la fecha es SEGURIDAD alimentaria
  'best_before'   -- consumo preferente: pasada la fecha es CALIDAD
);

create type public.date_source as enum (
  'package',       -- leída del envase. La más fiable
  'user',          -- introducida a mano
  'manufacturer',  -- de la ficha del producto
  'reference',     -- de una tabla de conservación general. ORIENTATIVA
  'estimate'       -- calculada por la app. ORIENTATIVA
);

create type public.measurement_unit as enum ('g', 'kg', 'ml', 'l', 'unit');

comment on type public.date_kind is
  'Caducidad y consumo preferente NO son lo mismo y no se comunican igual: '
  'una es seguridad, la otra calidad.';

create table public.inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households (id) on delete cascade,

  -- Puede ser NULL: un alta manual no necesita catálogo. ON DELETE SET NULL
  -- porque si el producto desaparece, el yogur sigue en tu nevera.
  product_id          uuid references public.products (id) on delete set null,

  -- Copia denormalizada a propósito: el elemento tiene que poder nombrarse
  -- aunque el producto se borre o se renombre en el catálogo global.
  name                text not null check (length(trim(name)) between 1 and 200),

  state               public.item_state not null default 'closed',
  location            public.storage_location not null default 'pantry',

  -- ── Cantidad (decisión D-07) ──────────────────────────────────────────
  -- Se guarda SIEMPRE en unidad base: gramos, mililitros o piezas.
  -- display_unit es solo para enseñarla como la escribió el usuario: quien
  -- compra «1 kg de arroz» quiere leer «1 kg», no «1000 g».
  unit_family         public.unit_family not null,
  display_unit        public.measurement_unit not null,
  initial_quantity    numeric not null check (initial_quantity > 0),
  remaining_quantity  numeric not null check (remaining_quantity >= 0),

  -- ── Fechas ────────────────────────────────────────────────────────────
  limit_date          date,
  date_kind           public.date_kind,
  date_source         public.date_source,

  -- ── Rastro temporal de los cambios de estado ──────────────────────────
  opened_at           timestamptz,
  frozen_at           timestamptz,
  thawed_at           timestamptz,
  closed_out_at       timestamptz,   -- cuando pasó a finished o discarded

  notes               text check (length(notes) <= 2000),
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- No puedes tener más de lo que compraste.
  constraint inventory_items_quantity_ck
    check (remaining_quantity <= initial_quantity),

  -- El corazón de D-07: la familia manda sobre las unidades admitidas.
  -- Así es imposible guardar «2 kg» de algo medido en volumen.
  constraint inventory_items_unit_ck check (
    (unit_family = 'mass'   and display_unit in ('g', 'kg'))
    or (unit_family = 'volume' and display_unit in ('ml', 'l'))
    or (unit_family = 'count'  and display_unit = 'unit')
  ),

  -- «No inventar datos»: o hay fecha, tipo y origen, o no hay nada de los
  -- tres. Una fecha suelta, sin saber si es caducidad o preferente y de dónde
  -- salió, es justo el dato que este proyecto se niega a tener.
  constraint inventory_items_date_ck
    check (num_nonnulls(limit_date, date_kind, date_source) in (0, 3)),

  -- Coherencia entre estado y rastro temporal.
  constraint inventory_items_opened_ck
    check (state <> 'closed' or opened_at is null),
  constraint inventory_items_closed_out_ck
    check ((state in ('finished', 'discarded')) = (closed_out_at is not null))
);

comment on table public.inventory_items is
  'El alimento real en casa, con su estado y sus fechas. No confundir con '
  'products: dos bricks iguales son un producto y dos elementos.';
comment on column public.inventory_items.remaining_quantity is
  'En unidad base (g, ml o piezas), nunca en display_unit.';
comment on column public.inventory_items.date_source is
  'De dónde sale la fecha. La interfaz lo muestra siempre: es un principio '
  'del proyecto, no un detalle.';

-- La consulta que más se va a repetir: lo activo de un hogar, por urgencia.
create index inventory_items_active_idx
  on public.inventory_items (household_id, limit_date)
  where state not in ('finished', 'discarded');

create index inventory_items_product_id_idx
  on public.inventory_items (product_id)
  where product_id is not null;

create trigger inventory_items_touch_updated_at
  before update on public.inventory_items
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.inventory_items enable row level security;

create policy inventory_items_select on public.inventory_items
  for select to authenticated
  using (public.is_household_member(household_id));

create policy inventory_items_insert on public.inventory_items
  for insert to authenticated
  with check (public.is_household_member(household_id));

-- USING filtra qué filas puedes tocar; WITH CHECK, cómo pueden quedar. Sin el
-- segundo, alguien podría mover un elemento suyo a otro hogar con un UPDATE.
create policy inventory_items_update on public.inventory_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy inventory_items_delete on public.inventory_items
  for delete to authenticated
  using (public.is_household_member(household_id));

revoke all on public.inventory_items from anon;
grant select, insert, update, delete on public.inventory_items to authenticated;
