-- ═══════════════════════════════════════════════════════════════════════════
-- El alta dice en qué nevera va.
--
-- El bug: `create_item` (20260921180000) resolvía el hogar con
--
--     select household_id from public.household_members limit 1;
--
-- SIN `order by`. Con una sola pertenencia da igual, y por eso pasó todas las
-- pruebas. Con varias —la privada más una compartida— devuelve la que Postgres
-- encuentre antes: el alimento aparece en una nevera al azar, en silencio y sin
-- ningún error. Es la peor clase de fallo posible en esta app: el usuario
-- guarda la leche, ve «Guardado», y la leche está en la nevera del piso.
--
-- La reparación no es ordenar la consulta (elegiría SIEMPRE la privada, y
-- nadie podría dar de alta nada en la compartida): es que la nevera deje de
-- adivinarse. La manda el cliente y se comprueba aquí que es de quien llama.
--
-- ── Qué se conserva ───────────────────────────────────────────────────────
--
-- Todo lo demás, tal cual: la categoría, la validación de la cantidad y de la
-- fecha, el evento `created` en la misma transacción, SECURITY INVOKER, y los
-- permisos. Sigue con mensajes de 22023 para lo que ya los tenía, y sigue
-- dejando que la restricción de la tabla rechace una unidad que no encaja con
-- su familia (23514).
--
-- ── Por qué el hogar va PRIMERO, y es obligatorio ─────────────────────────
--
-- En PostgreSQL, un parámetro con valor por omisión obliga a que todos los
-- siguientes lo tengan. El hogar no puede tener uno —un valor por omisión sería
-- exactamente la adivinanza de antes con otra forma—, así que va delante de los
-- demás, con los otros obligatorios. La app llama por parámetros con nombre
-- (`supabase.rpc('create_item', { p_household_id: ..., p_name: ... })`), así que
-- la posición solo importa a quien lo llame desde SQL.
--
-- ── Por qué INVOKER sigue bastando ────────────────────────────────────────
--
-- La RLS de inventory_items ya rechaza escribir en una nevera ajena
-- (`with check is_household_member(household_id)`), pero con un error del motor
-- que no dice qué ha pasado. La comprobación de aquí es lo que da el mensaje.
-- Las dos capas se quieren: esta explica, la RLS es la que de verdad protege.
--
-- Al recrearla se le añade `set search_path = ''`, que la versión anterior no
-- tenía. Que sea INVOKER no escala privilegios, pero tampoco hay motivo para
-- dejar que un esquema ajeno se cuele por delante: todos los nombres del
-- cuerpo ya van cualificados.
-- ═══════════════════════════════════════════════════════════════════════════

-- Se borra la firma vigente EXACTA, y no se usa `create or replace`: con un
-- parámetro nuevo, PostgreSQL crearía una SEGUNDA función con el mismo nombre y
-- PostgREST no sabría a cuál llamar. Con las dos sobrecargas vivas, el alta
-- fallaría con un error de ambigüedad que no se parece en nada a su causa. Y
-- dejar la vieja viva sería peor todavía: seguiría eligiendo la nevera al azar.
drop function public.create_item(
  text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
);

create function public.create_item(
  p_household_id  uuid,
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
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  -- Sin nevera no hay dónde guardarlo. Es un caso aparte del de abajo porque
  -- tiene otra causa —un cliente que no la ha mandado— y otro arreglo.
  if p_household_id is null then
    raise exception 'Elige en qué nevera lo guardas.' using errcode = '22023';
  end if;

  -- «No existe» y «no es tuya» dan el mismo mensaje, y no es pereza: si fueran
  -- distintos, con una lista de uuids se sabría qué neveras existen.
  if not public.is_household_member(p_household_id) then
    raise exception 'Esa nevera no existe o no es tuya. Elige una de tus neveras y vuelve a probar.'
      using errcode = 'P0002';
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
    p_household_id, p_product_id, trim(p_name), p_location, coalesce(p_category, 'otros'),
    p_unit_family, p_display_unit, p_quantity, p_quantity,
    p_limit_date, p_date_kind, p_date_source, p_notes, (select auth.uid())
  )
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'created');
  return v_item;
end;
$$;

comment on function public.create_item is
  'Da de alta un elemento en la nevera indicada y registra su evento created, '
  'en la misma transacción. La nevera la manda el cliente y se comprueba aquí '
  'que es de quien llama: nunca se adivina.';

revoke all on function public.create_item(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
) from public, anon;

grant execute on function public.create_item(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
) to authenticated;
