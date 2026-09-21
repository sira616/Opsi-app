-- ═══════════════════════════════════════════════════════════════════════════
-- Alta de un elemento, como acción.
--
-- Cierra un hueco que estaba anotado en PENDIENTES: el enum de eventos tenía
-- el valor 'created' y NADIE lo emitía, porque el alta se hacía con un INSERT
-- suelto desde la app. El historial de un alimento empezaba en su primera
-- acción y no cuando entró en casa.
--
-- De las dos salidas posibles —un trigger AFTER INSERT o una función— se elige
-- la función, por coherencia: las otras seis acciones ya son RPC, y así el
-- alta se parece a abrir o a tirar en lugar de ser un caso aparte. Además
-- permite resolver el hogar aquí dentro, y que el cliente no tenga que
-- averiguarlo ni mandarlo.
--
-- SECURITY INVOKER como las demás: la RLS decide en qué hogar se puede
-- escribir, y si el usuario no tuviera ninguno, la función falla sola.
-- ═══════════════════════════════════════════════════════════════════════════

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
  p_notes         text                    default null
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
    household_id, product_id, name, location,
    unit_family, display_unit, initial_quantity, remaining_quantity,
    limit_date, date_kind, date_source, notes, created_by
  )
  values (
    v_household, p_product_id, trim(p_name), p_location,
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
  public.storage_location, date, public.date_kind, public.date_source, uuid, text
) from public, anon;

grant execute on function public.create_item(
  text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text
) to authenticated;
