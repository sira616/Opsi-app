-- ═══════════════════════════════════════════════════════════════════════════
-- Editar un elemento del inventario
--
-- Hasta ahora lo que se daba de alta no se podía corregir: un nombre mal escrito,
-- una fecha copiada del envase con un dígito cambiado o un elemento en el sitio
-- equivocado obligaba a tirarlo y volver a darlo de alta (y a que el historial
-- contara que se tiró algo que nunca se tiró).
--
-- La vía es una función y no un UPDATE suelto. El permiso de UPDATE sobre la tabla
-- ya lo tiene quien pertenece a la nevera, pero un cambio escrito a pelo no deja
-- rastro, y el registro de eventos existe justo para que lo que le pasa a un
-- elemento se pueda contar. Aquí el cambio y su evento `updated` van en la misma
-- transacción, con lo que había antes y lo que hay ahora.
--
-- ── Qué se puede cambiar, y qué NO ────────────────────────────────────────
--
--   · El nombre, el pasillo, dónde está y la fecha (con su tipo y su origen).
--   · La cantidad, SOLO en lo que está sin abrir. En lo ya empezado la cantidad
--     que queda es el resultado de lo que se fue usando, cada uso con su evento:
--     reescribirla dejaría el historial diciendo una cosa y el elemento otra. Para
--     eso está «Usar».
--
--   Lo que no se toca desde aquí: el estado, la nevera, el producto enlazado y las
--   marcas de tiempo. Cada una tiene su acción o su regla.
--
-- Un elemento cerrado (agotado o tirado) no se edita, como no admite ninguna otra
-- acción: `require_item` lo rechaza. Y si lo que se manda es lo que ya había, no
-- pasa nada y tampoco se escribe un evento vacío.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.update_item(
  p_item_id       uuid,
  p_name          text,
  p_category      public.food_category,
  p_location      public.storage_location,
  p_limit_date    date                    default null,
  p_date_kind     public.date_kind        default null,
  p_date_source   public.date_source      default null,
  p_quantity      numeric                 default null,
  p_display_unit  public.measurement_unit default null
)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  v_viejo   public.inventory_items;
  v_nuevo   public.inventory_items;
  v_nombre  text := trim(p_name);
  v_cambios jsonb := '{}'::jsonb;
begin
  -- Bloquea la fila, pasa por la RLS (un elemento de otra nevera «no existe») y
  -- rechaza lo ya cerrado.
  v_viejo := public.require_item(p_item_id);

  if v_nombre is null or length(v_nombre) not between 1 and 200 then
    raise exception 'Ponle un nombre, aunque sea «eso verde del cajón».'
      using errcode = '22023';
  end if;

  if p_category is null or p_location is null then
    raise exception 'Faltan el pasillo o el sitio donde lo guardas.' using errcode = '22023';
  end if;

  if num_nonnulls(p_limit_date, p_date_kind, p_date_source) not in (0, 3) then
    raise exception 'Una fecha necesita saber de qué tipo es y de dónde sale'
      using errcode = '22023';
  end if;

  -- La cantidad y su unidad van juntas o no va ninguna, y solo se corrige sin abrir.
  if p_quantity is not null or p_display_unit is not null then
    if p_quantity is null or p_display_unit is null then
      raise exception 'La cantidad y su unidad van juntas.' using errcode = '22023';
    end if;
    if p_quantity <= 0 then
      raise exception 'La cantidad tiene que ser mayor que cero' using errcode = '22023';
    end if;
    -- Misma regla que la tabla (D-07), dicha en español: entre familias no se convierte.
    if not (
      (v_viejo.unit_family = 'mass'   and p_display_unit in ('g', 'kg'))
      or (v_viejo.unit_family = 'volume' and p_display_unit in ('ml', 'l'))
      or (v_viejo.unit_family = 'count'  and p_display_unit = 'unit')
    ) then
      raise exception 'Esa unidad no encaja con lo que estás midiendo.' using errcode = '22023';
    end if;
    if v_viejo.state <> 'closed'
       and (p_quantity is distinct from v_viejo.initial_quantity
            or p_display_unit is distinct from v_viejo.display_unit) then
      raise exception 'La cantidad solo se corrige en lo que está sin abrir. Para lo demás, usa «Usar».'
        using errcode = 'P0001';
    end if;
  end if;

  -- Qué cambia de verdad. Cada entrada guarda lo de antes y lo de ahora: es lo que
  -- el historial enseña, y lo único que lo distingue de un «tocó algo».
  if v_nombre is distinct from v_viejo.name then
    v_cambios := v_cambios || jsonb_build_object(
      'name', jsonb_build_object('de', v_viejo.name, 'a', v_nombre));
  end if;
  if p_category is distinct from v_viejo.category then
    v_cambios := v_cambios || jsonb_build_object(
      'category', jsonb_build_object('de', v_viejo.category, 'a', p_category));
  end if;
  if p_location is distinct from v_viejo.location then
    v_cambios := v_cambios || jsonb_build_object(
      'location', jsonb_build_object('de', v_viejo.location, 'a', p_location));
  end if;
  if (p_limit_date, p_date_kind, p_date_source)
       is distinct from (v_viejo.limit_date, v_viejo.date_kind, v_viejo.date_source) then
    v_cambios := v_cambios || jsonb_build_object('date', jsonb_build_object(
      'de', jsonb_build_object('limit_date', v_viejo.limit_date, 'kind', v_viejo.date_kind,
                               'source', v_viejo.date_source),
      'a',  jsonb_build_object('limit_date', p_limit_date, 'kind', p_date_kind,
                               'source', p_date_source)));
  end if;
  if p_quantity is not null
     and (p_quantity is distinct from v_viejo.initial_quantity
          or p_display_unit is distinct from v_viejo.display_unit) then
    v_cambios := v_cambios || jsonb_build_object('quantity', jsonb_build_object(
      'de', jsonb_build_object('quantity', v_viejo.initial_quantity, 'unit', v_viejo.display_unit),
      'a',  jsonb_build_object('quantity', p_quantity, 'unit', p_display_unit)));
  end if;

  -- Nada que cambiar: ni UPDATE ni evento.
  if v_cambios = '{}'::jsonb then
    return v_viejo;
  end if;

  update public.inventory_items
     set name               = v_nombre,
         category           = p_category,
         location           = p_location,
         limit_date         = p_limit_date,
         date_kind          = p_date_kind,
         date_source        = p_date_source,
         -- Sin abrir, lo que queda ES lo que había: las dos van juntas.
         initial_quantity   = coalesce(p_quantity, initial_quantity),
         remaining_quantity = case when p_quantity is not null and state = 'closed'
                                   then p_quantity else remaining_quantity end,
         display_unit       = coalesce(p_display_unit, display_unit)
   where id = p_item_id
  returning * into v_nuevo;

  perform public.record_inventory_event(
    v_nuevo, 'updated', null, jsonb_build_object('cambios', v_cambios));

  return v_nuevo;
end;
$$;

comment on function public.update_item is
  'Corrige un elemento (nombre, pasillo, sitio, fecha y, sin abrir, cantidad) y '
  'escribe su evento `updated` con lo de antes y lo de ahora, en la misma '
  'transacción. No toca el estado, la nevera ni el producto.';

revoke all on function public.update_item(
  uuid, text, public.food_category, public.storage_location, date, public.date_kind,
  public.date_source, numeric, public.measurement_unit
) from public, anon;

grant execute on function public.update_item(
  uuid, text, public.food_category, public.storage_location, date, public.date_kind,
  public.date_source, numeric, public.measurement_unit
) to authenticated;
