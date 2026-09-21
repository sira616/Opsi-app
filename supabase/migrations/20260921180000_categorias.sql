-- ═══════════════════════════════════════════════════════════════════════════
-- Categorías de supermercado.
--
-- El nombre de un alimento es texto libre —y tiene que seguir siéndolo: nadie
-- va a buscar «Leche semidesnatada sin lactosa» en un desplegable—, pero eso
-- deja el inventario sin ninguna forma de agruparlo que no sea la urgencia.
-- La categoría es esa forma: los pasillos del supermercado, que es como ya
-- tiene la gente organizada la cabeza al hacer la compra.
--
-- Por qué un enum y no `products.categories_tags`:
--
--   · categories_tags viene de Open Food Facts, son decenas de etiquetas por
--     producto y sirven para BUSCAR la conservación tras apertura (D-15). No
--     es una taxonomía con la que se pueda pintar una lista.
--   · Un elemento dado de alta a mano no tiene producto de catálogo, así que
--     no tendría ninguna etiqueta. Y el alta manual es el camino principal.
--
-- Diez valores, ni uno más: una fila de filtros que no cabe en una pantalla de
-- móvil es una fila que nadie usa. Cuando llegue el escáner (fase 2), el
-- catálogo rellenará esto solo a partir de sus etiquetas.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.food_category as enum (
  'frutas_verduras',
  'carne',
  'pescado',
  'lacteos',
  'panaderia',
  'despensa',
  'congelados',
  'bebidas',
  'dulces',
  'otros'
);

alter table public.inventory_items
  add column category public.food_category not null default 'otros';

comment on column public.inventory_items.category is
  'Pasillo del supermercado. La app la propone a partir del nombre y el '
  'usuario la corrige: preguntar sin proponer sería un formulario más largo '
  'a cambio de nada.';

-- El filtro de la lista es «mi hogar, esta categoría», y ese es exactamente
-- el orden del índice. Sin él, filtrar recorrería el inventario entero.
create index inventory_items_category_idx
  on public.inventory_items (household_id, category);

-- ── El alta acepta la categoría ───────────────────────────────────────────
--
-- Se borra y se vuelve a crear en vez de añadir un parámetro con `create or
-- replace`: en PostgreSQL eso crearía una SEGUNDA función con el mismo nombre,
-- y PostgREST no sabría a cuál llamar. Con dos sobrecargas vivas, el alta
-- fallaría con un error de ambigüedad que no se parece en nada a su causa.
drop function public.create_item(
  text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text
);

create function public.create_item(
  p_name          text,
  p_unit_family   public.unit_family,
  p_display_unit  public.measurement_unit,
  p_quantity      numeric,
  p_location      public.storage_location default 'pantry',
  p_limit_date    date                    default null,
  p_date_kind     public.date_kind        default null,
  p_date_source   public.date_source      default null,
  p_product_id    uuid                    default null,
  p_notes         text                    default null,
  p_category      public.food_category    default 'otros'
)
returns public.inventory_items
language plpgsql
as $$
declare
  v_household uuid;
  v_item      public.inventory_items;
begin
  -- La RLS ya limita esto a los hogares del usuario, así que no hace falta
  -- comprobar nada: o sale el suyo, o no sale ninguno.
  select household_id into v_household
  from public.household_members
  limit 1;

  if v_household is null then
    raise exception 'No tienes ningún hogar' using errcode = 'P0002';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero' using errcode = '22023';
  end if;

  -- Las tres van juntas o no va ninguna. La restricción de la tabla lo
  -- impone igualmente, pero fallar aquí da un mensaje que se entiende en vez
  -- de un nombre de constraint.
  if num_nonnulls(p_limit_date, p_date_kind, p_date_source) not in (0, 3) then
    raise exception 'Una fecha necesita saber de qué tipo es y de dónde sale'
      using errcode = '22023';
  end if;

  insert into public.inventory_items (
    household_id, product_id, name, location, category,
    unit_family, display_unit, initial_quantity, remaining_quantity,
    limit_date, date_kind, date_source, notes, created_by
  )
  values (
    v_household, p_product_id, trim(p_name), p_location, coalesce(p_category, 'otros'),
    p_unit_family, p_display_unit, p_quantity, p_quantity,
    p_limit_date, p_date_kind, p_date_source, p_notes, (select auth.uid())
  )
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'created');
  return v_item;
end;
$$;

comment on function public.create_item is
  'Da de alta un elemento y registra su evento created, en la misma '
  'transacción. El hogar se resuelve aquí: el cliente no lo manda.';

revoke all on function public.create_item(
  text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
) from public, anon;

grant execute on function public.create_item(
  text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
) to authenticated;

-- ── La vista tiene que volver a crearse ───────────────────────────────────
--
-- Esto no es opcional y no se ve venir: PostgreSQL guarda el `select i.*` de
-- una vista YA EXPANDIDO en columnas, en el momento de crearla. Añadir una
-- columna a la tabla no la añade a la vista, así que `category` existiría en
-- inventory_items y no en inventory_with_priority, que es justo de donde lee
-- la lista. El síntoma sería «column category does not exist» al filtrar.
--
-- Y se borra en vez de reemplazarse porque `create or replace view` solo deja
-- AÑADIR columnas al final, y al expandirse `i.*` la nueva cae en medio.
--
-- La definición va copiada literal de 20260921100100. Duplicarla es el precio
-- de la regla del proyecto: una migración aplicada no se edita jamás.
drop view public.inventory_with_priority;

create view public.inventory_with_priority
with (security_invoker = true) as
with candidates as (
  select
    i.*,

    -- 1) La del envase, más los días que estuvo parada en el congelador.
    case
      when i.limit_date is not null then i.limit_date + i.frozen_days
    end as date_from_label,

    -- 2) La de conservación tras apertura: primero la del producto, si no la
    --    de su categoría, y de las categorías que encajen la MÁS CORTA.
    case
      when i.opened_at is not null then
        i.opened_at::date + coalesce(
          p.open_shelf_life_days,
          (
            select min(r.days)
            from public.open_shelf_life_reference r
            where r.category_tag = any (p.categories_tags)
          )
        )
    end as date_from_opening,

    -- 3) El tope de seguridad: 24 h desde que se descongeló.
    case
      when i.state = 'thawed' and i.thawed_at is not null
      then i.thawed_at::date + 1
    end as date_from_thaw

  from public.inventory_items i
  left join public.products p on p.id = i.product_id
),
resolved as (
  select
    c.*,
    case
      -- Lo agotado y lo tirado ya no tiene fecha que vigilar.
      when c.state in ('finished', 'discarded') then null
      -- Mientras está congelado, la cuenta atrás está parada: no vence.
      when c.state = 'frozen' then null
      else least(c.date_from_thaw, c.date_from_opening, c.date_from_label)
    end as effective_limit_date
  from candidates c
)
select
  r.*,

  -- Por qué esa fecha y no otra. La pantalla de detalle lo explica con esto,
  -- en vez de soltar un número sin más.
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'after_thawing'
    when r.effective_limit_date = r.date_from_opening then 'after_opening'
    else 'label'
  end::public.effective_date_reason as effective_date_reason,

  -- El origen que se muestra al usuario. Todo lo que no venga del envase es
  -- orientativo, y se dice.
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'reference'
    when r.effective_limit_date = r.date_from_opening then 'reference'
    else r.date_source
  end::public.date_source as effective_date_source,

  (r.effective_limit_date - current_date) as days_left,

  case
    when r.state in ('finished', 'discarded')     then 'closed_out'
    when r.state = 'frozen'                        then 'frozen'
    when r.effective_limit_date is null            then 'undated'
    when r.effective_limit_date <= current_date + 1 then 'high'
    when r.effective_limit_date <= current_date + 4 then 'medium'
    else 'low'
  end::public.priority_group as priority

from resolved r;

comment on view public.inventory_with_priority is
  'Inventario con la fecha límite efectiva, por qué es esa y su urgencia. '
  'security_invoker: la RLS de inventory_items se aplica igual que en la tabla.';

revoke all on public.inventory_with_priority from anon;
grant select on public.inventory_with_priority to authenticated;
