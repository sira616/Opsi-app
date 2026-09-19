-- ═══════════════════════════════════════════════════════════════════════════
-- Catálogo de productos.
--
-- Un producto NO es un alimento en tu casa: es una entrada de catálogo
-- («Leche entera Marca X, brick 1 L, EAN 8410…»). Lo que tienes en la nevera
-- es un `inventory_item`, que apunta a un producto. Dos bricks iguales son
-- un producto y dos elementos.
--
-- El catálogo tiene dos mitades:
--   · household_id IS NULL  → catálogo global, compartido por todo el mundo.
--     Lo rellena la Edge Function lookup-barcode desde Open Food Facts (fase 2)
--     y hace de caché: si un usuario escanea un producto, el siguiente ya no
--     provoca una llamada externa.
--   · household_id NOT NULL → producto privado de un hogar, creado a mano
--     cuando Open Food Facts no lo conoce.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.unit_family as enum ('mass', 'volume', 'count');

comment on type public.unit_family is
  'Familia de unidades. Entre familias NO se convierte nunca: 200 g de harina '
  'no son 200 ml de harina.';

create table public.products (
  id                    uuid primary key default gen_random_uuid(),

  -- NULL = catálogo global. Es la única excepción a «todo cuelga de un hogar»,
  -- y es deliberada: sin ella, cada hogar tendría su copia de Open Food Facts.
  household_id          uuid references public.households (id) on delete cascade,

  barcode               text check (barcode ~ '^[0-9]{8,14}$'),
  name                  text not null check (length(trim(name)) between 1 and 200),
  brand                 text check (length(brand) <= 120),

  unit_family           public.unit_family,
  net_quantity          numeric check (net_quantity > 0),

  -- Días de conservación una vez abierto. Alimenta la fecha límite efectiva
  -- de la fase 1. Siempre es orientativo (date_source = 'reference'): lo que
  -- diga el envase manda sobre esto.
  open_shelf_life_days  integer check (open_shelf_life_days between 1 and 3650),

  image_url             text,

  data_source           text not null default 'user'
                        check (data_source in ('user', 'openfoodfacts')),

  -- Respuesta cruda de Open Food Facts. Se guarda entera para poder reprocesar
  -- sin volver a llamar. OJO: es texto de un wiki público, es decir, entrada no
  -- confiable. Nunca se interpola en un prompt sin encapsular.
  off_payload           jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Un producto del catálogo global tiene que venir de algún sitio conocido,
  -- y uno privado no puede fingir que viene de Open Food Facts.
  constraint products_source_ck check (
    (household_id is null and data_source = 'openfoodfacts')
    or (household_id is not null and data_source = 'user')
  )
);

comment on table public.products is
  'Catálogo. household_id NULL = global (caché de Open Food Facts); '
  'NOT NULL = producto privado de un hogar.';

-- Un código de barras identifica un producto: en el catálogo global no puede
-- repetirse. En los privados sí, porque cada hogar puede tener su versión de
-- un producto que Open Food Facts no conoce.
create unique index products_global_barcode_key
  on public.products (barcode)
  where household_id is null and barcode is not null;

create index products_household_id_idx
  on public.products (household_id)
  where household_id is not null;

-- Búsqueda por nombre sin distinguir mayúsculas ni acentos, para el alta manual.
create index products_name_idx on public.products (lower(name));

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.products enable row level security;

-- Todo el mundo lee el catálogo global; los privados, solo su hogar.
create policy products_select on public.products
  for select to authenticated
  using (
    household_id is null
    or public.is_household_member(household_id)
  );

-- is_household_member(NULL) devuelve false, así que estas tres políticas
-- impiden por construcción que un usuario escriba en el catálogo global.
-- Ahí solo escribe lookup-barcode, que usa la service_role key y salta la RLS.
create policy products_insert on public.products
  for insert to authenticated
  with check (public.is_household_member(household_id));

create policy products_update on public.products
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy products_delete on public.products
  for delete to authenticated
  using (public.is_household_member(household_id));

revoke all on public.products from anon;
grant select, insert, update, delete on public.products to authenticated;
