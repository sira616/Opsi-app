-- ═══════════════════════════════════════════════════════════════════════════
-- Lista de la compra.
--
-- La tabla se crea en la fase 0 aunque la funcionalidad sea de la fase 4: así
-- las políticas RLS de todo el esquema se escriben y se prueban de una vez.
-- Volver a pasar por aquí en la fase 4 sería repetir el trabajo de seguridad.
--
-- Principio que esta tabla debe respetar: NADA se añade solo a la lista salvo
-- que el usuario active la opción (user_settings.auto_add_to_shopping_list,
-- que viene desactivada). La columna `source` deja ver de dónde vino cada
-- línea, para poder auditarlo.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.shopping_list_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,

  name          text not null check (length(trim(name)) between 1 and 200),

  -- Cantidad opcional: «papel de cocina» no necesita número. Si se pone, va
  -- en unidad base y respeta D-07 igual que el inventario.
  unit_family   public.unit_family,
  display_unit  public.measurement_unit,
  quantity      numeric check (quantity > 0),

  is_purchased  boolean not null default false,
  purchased_at  timestamptz,

  source        text not null default 'manual'
                check (source in ('manual', 'auto_restock', 'chat')),

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- O la cantidad está completa (valor, familia y unidad) o no hay cantidad.
  constraint shopping_list_items_quantity_ck
    check (num_nonnulls(quantity, unit_family, display_unit) in (0, 3)),

  -- Misma regla de familia/unidad que en el inventario.
  constraint shopping_list_items_unit_ck check (
    unit_family is null
    or (unit_family = 'mass'   and display_unit in ('g', 'kg'))
    or (unit_family = 'volume' and display_unit in ('ml', 'l'))
    or (unit_family = 'count'  and display_unit = 'unit')
  ),

  constraint shopping_list_items_purchased_ck
    check (is_purchased = (purchased_at is not null))
);

comment on column public.shopping_list_items.source is
  'De dónde salió la línea. auto_restock solo aparece si el usuario activó '
  'el añadido automático, que viene desactivado.';

create index shopping_list_items_pending_idx
  on public.shopping_list_items (household_id, created_at desc)
  where not is_purchased;

create trigger shopping_list_items_touch_updated_at
  before update on public.shopping_list_items
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.shopping_list_items enable row level security;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (public.is_household_member(household_id));

create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (public.is_household_member(household_id));

create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (public.is_household_member(household_id));

revoke all on public.shopping_list_items from anon;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
