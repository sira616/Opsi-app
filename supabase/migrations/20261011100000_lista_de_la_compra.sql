-- ═══════════════════════════════════════════════════════════════════════════
-- Lista de la compra (fase 4): las reglas que la tabla sola no impone
--
-- La tabla y sus políticas existen desde la fase 0 (20260919120400): quien es de
-- una nevera ve, añade, cambia y borra las líneas de ESA nevera. Lo que no dice
-- es nada de lo que importa en cuanto la usa alguien con mala intención o un
-- cliente con un fallo:
--
--   · La columna `source` promete que `auto_restock` solo aparece si la persona
--     activó el añadido automático «y viene desactivado». Era una promesa del
--     comentario: cualquier cliente podía escribir `auto_restock` sin que nadie lo
--     hubiera pedido, y el principio de que NADA se apunta solo no lo cumplía nada.
--   · `created_by` lo escribía el cliente: se podía apuntar una línea a nombre de
--     otra persona de la nevera.
--   · `product_id` se enlazaba sin mirar de quién era el producto, igual que le
--     pasaba a `create_item` (arreglado en 20261010100000).
--   · No había tope: una nevera podía acumular líneas sin límite.
--
-- Y una cosa que hay que hacer en UNA transacción: marcar algo como comprado y
-- que entre al inventario. Hacerlo en dos llamadas deja la lista diciendo
-- «comprado» sin que esté en la nevera, o al revés, si la segunda falla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Las reglas, en un trigger ─────────────────────────────────────────────
--
-- SECURITY INVOKER (el valor por omisión) y no DEFINER, a propósito: el trigger
-- lee `user_settings` y `products` con los permisos de quien escribe, y la RLS de
-- esas tablas hace de segunda comprobación. Con DEFINER habría que repetir a mano
-- lo que ya decide la RLS, y un fallo aquí daría más de lo que debe.

create function public.check_shopping_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_tope constant integer := 300;
begin
  if tg_op = 'UPDATE' then
    -- Quién la puso y de dónde salió no cambian: son la prueba de qué pasó.
    if new.source is distinct from old.source then
      raise exception 'De dónde salió una línea de la lista no se puede cambiar.'
        using errcode = '22023';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'Quién apuntó una línea de la lista no se puede cambiar.'
        using errcode = '22023';
    end if;
    if new.product_id is not distinct from old.product_id then
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- A nombre de quien escribe, y de nadie más. Un valor que mande el cliente se
    -- pisa: no hay forma legítima de apuntar algo «de parte de» otra persona.
    new.created_by := (select auth.uid());

    -- El principio del proyecto: nada se apunta solo salvo que la persona lo haya
    -- encendido. Aquí es donde se cumple, y no en un comentario.
    if new.source = 'auto_restock'
       and not coalesce(
         (select s.auto_add_to_shopping_list
            from public.user_settings s
           where s.user_id = (select auth.uid())),
         false
       ) then
      raise exception 'Tienes apagado apuntar lo que se acaba. Se puede encender en Ajustes.'
        using errcode = 'P0001', hint = 'autoanadir_apagado';
    end if;

    -- Un tope por nevera, contando lo ya comprado. Es una red contra un cliente
    -- que se descontrola, no una limitación pensada para nadie: 300 líneas es
    -- mucho más de lo que se compra en un año de uso normal si se vacía lo comprado.
    if (select count(*) from public.shopping_list_items i
         where i.household_id = new.household_id) >= c_tope then
      raise exception 'La lista está llena (% líneas). Quita lo ya comprado o lo que sobre antes de apuntar más.', c_tope
        using errcode = 'P0001', hint = 'lista_llena';
    end if;
  end if;

  -- El producto, si lo hay, es del catálogo global o de ESTA nevera. La clave
  -- foránea solo comprueba que exista; con el uuid de un producto privado ajeno se
  -- podía enlazar. Mismo mensaje para «no existe» y «no es tuyo»: si fueran
  -- distintos, una lista de uuids diría cuáles existen.
  if new.product_id is not null and not exists (
    select 1 from public.products p
     where p.id = new.product_id
       and (p.household_id is null or p.household_id = new.household_id)
  ) then
    raise exception 'Ese producto no existe o no es de esta nevera.'
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

comment on function public.check_shopping_item() is
  'Trigger de la lista de la compra: auto_restock solo si la persona lo encendió, '
  'created_by siempre quien escribe, producto global o de la misma nevera, y un '
  'tope por nevera.';

create trigger shopping_list_items_check
  before insert or update on public.shopping_list_items
  for each row execute function public.check_shopping_item();

revoke all on function public.check_shopping_item() from public, anon, authenticated;

-- ── Comprado → inventario, en una transacción ─────────────────────────────
--
-- Recibe los mismos datos que `create_item` (la nevera NO: sale de la línea, que
-- ya la lleva y ya es de una nevera de quien llama) y devuelve el elemento creado.
--
-- `for update` sobre la línea por la misma razón que `require_item`: dos personas
-- que marcan lo mismo a la vez no pueden crear dos elementos. La segunda espera,
-- ve la línea ya comprada y recibe un mensaje que se entiende.
--
-- SECURITY INVOKER: la lectura de la línea pasa por la RLS, así que una línea de
-- otra nevera «no existe» para quien llama, con el mismo mensaje que una borrada.

create function public.stock_from_list(
  p_list_item_id  uuid,
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
  v_linea public.shopping_list_items;
  v_item  public.inventory_items;
begin
  select * into v_linea
    from public.shopping_list_items
   where id = p_list_item_id
     for update;

  if not found then
    raise exception 'Esa línea de la lista ya no existe.' using errcode = 'P0002';
  end if;

  if v_linea.is_purchased then
    raise exception 'Eso ya está marcado como comprado.' using errcode = 'P0001';
  end if;

  -- Todo lo de `create_item` se comprueba ahí: la cantidad, la fecha, el producto.
  -- Si falla, la línea no se toca (la función entera es una transacción).
  v_item := public.create_item(
    v_linea.household_id, p_name, p_unit_family, p_display_unit, p_quantity,
    p_location, p_limit_date, p_date_kind, p_date_source,
    coalesce(p_product_id, v_linea.product_id), p_notes, p_category
  );

  update public.shopping_list_items
     set is_purchased = true, purchased_at = now()
   where id = v_linea.id;

  return v_item;
end;
$$;

comment on function public.stock_from_list is
  'Marca una línea de la lista como comprada y da de alta el elemento en el '
  'inventario, en la misma transacción. La nevera sale de la línea.';

revoke all on function public.stock_from_list(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
) from public, anon;

grant execute on function public.stock_from_list(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
) to authenticated;
