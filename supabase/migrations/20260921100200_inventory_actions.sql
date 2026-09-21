-- ═══════════════════════════════════════════════════════════════════════════
-- Acciones del inventario: abrir, usar, congelar, descongelar, terminar, tirar.
--
-- Cada acción es DOS escrituras: cambiar el elemento y anotar el evento. Si se
-- hicieran desde el cliente como dos llamadas, un fallo de red entre ambas
-- dejaría el inventario sin su rastro. Aquí van en la misma transacción,
-- porque el cuerpo de una función es una transacción.
--
-- SECURITY INVOKER (el valor por omisión, y aquí se quiere): las funciones
-- corren con los permisos de quien llama, así que la RLS decide a qué
-- elementos llega. Si el elemento no es visible, el UPDATE no encuentra fila y
-- la función falla; no hace falta comprobar el hogar a mano, y no se puede
-- olvidar hacerlo. Es también lo que limitará lo que la asistente puede tocar
-- en la fase 5: llamará a estas mismas funciones con el token del usuario.
-- ═══════════════════════════════════════════════════════════════════════════

-- Anota el evento. Interna: se llama desde las acciones, no desde el cliente.
create function public.record_inventory_event(
  p_item          public.inventory_items,
  p_type          public.inventory_event_type,
  p_quantity_used numeric default null,
  p_payload       jsonb default '{}'::jsonb
)
returns void
language sql
as $$
  insert into public.inventory_events
    (household_id, item_id, user_id, type, quantity_used, payload)
  values
    (p_item.household_id, p_item.id, (select auth.uid()), p_type, p_quantity_used, p_payload);
$$;

-- Busca el elemento y falla si no existe o no es tuyo. La RLS hace el trabajo:
-- un elemento de otro hogar simplemente no aparece.
create function public.require_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  select * into v_item from public.inventory_items where id = p_item_id;
  if not found then
    raise exception 'El elemento no existe o no pertenece a tu hogar'
      using errcode = 'P0002';
  end if;
  if v_item.state in ('finished', 'discarded') then
    raise exception 'El elemento ya está cerrado (%). No admite más acciones', v_item.state
      using errcode = 'P0001';
  end if;
  return v_item;
end;
$$;

-- ── Abrir ─────────────────────────────────────────────────────────────────
create function public.open_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  v_item := public.require_item(p_item_id);

  if v_item.opened_at is not null then
    raise exception 'El elemento ya estaba abierto' using errcode = 'P0001';
  end if;
  if v_item.state = 'frozen' then
    raise exception 'Descongélalo antes de abrirlo' using errcode = 'P0001';
  end if;

  update public.inventory_items
     set state = 'open', opened_at = now()
   where id = p_item_id
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'opened');
  return v_item;
end;
$$;

-- ── Usar cantidad ─────────────────────────────────────────────────────────
-- p_amount va en unidad base (g, ml o piezas), como todo lo demás (D-07).
create function public.use_quantity(p_item_id uuid, p_amount numeric)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  v_item := public.require_item(p_item_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'La cantidad usada tiene que ser mayor que cero'
      using errcode = '22023';
  end if;
  if p_amount > v_item.remaining_quantity then
    raise exception 'Quieres usar % pero solo quedan %', p_amount, v_item.remaining_quantity
      using errcode = '22023';
  end if;

  update public.inventory_items
     set remaining_quantity = remaining_quantity - p_amount,
         -- Usar algo lo abre: no se gasta de un envase cerrado.
         opened_at     = coalesce(opened_at, now()),
         -- Llegar a cero es terminarlo. Es lo que dispara la pregunta de
         -- reposición de la fase 4.
         -- Los literales de un CASE se resuelven como text, y la columna es un
         -- enum: sin el cast explicito, Postgres rechaza el UPDATE entero.
         state         = case
                           when remaining_quantity - p_amount = 0
                             then 'finished'::public.item_state
                           else 'partially_consumed'::public.item_state
                         end,
         closed_out_at = case
                           when remaining_quantity - p_amount = 0 then now()
                           else null::timestamptz
                         end
   where id = p_item_id
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'quantity_used', p_amount);
  if v_item.state = 'finished' then
    perform public.record_inventory_event(v_item, 'finished', null,
      jsonb_build_object('reason', 'quantity_reached_zero'));
  end if;
  return v_item;
end;
$$;

-- ── Congelar ──────────────────────────────────────────────────────────────
create function public.freeze_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  v_item := public.require_item(p_item_id);

  if v_item.state = 'frozen' then
    raise exception 'El elemento ya está congelado' using errcode = 'P0001';
  end if;

  -- frozen_at abre el tramo; la cuenta atrás queda parada mientras dure.
  update public.inventory_items
     set state = 'frozen', frozen_at = now(), location = 'freezer'
   where id = p_item_id
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'frozen');
  return v_item;
end;
$$;

-- ── Descongelar ───────────────────────────────────────────────────────────
create function public.thaw_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item     public.inventory_items;
  v_days     integer;
begin
  v_item := public.require_item(p_item_id);

  if v_item.state <> 'frozen' then
    raise exception 'El elemento no está congelado' using errcode = 'P0001';
  end if;

  -- El tramo que termina se suma al acumulado y frozen_at se limpia: es lo
  -- que permite congelar y descongelar varias veces sin perder días (D-12).
  v_days := greatest((now()::date - v_item.frozen_at::date), 0);

  update public.inventory_items
     set state       = 'thawed',
         frozen_days = frozen_days + v_days,
         frozen_at   = null,
         thawed_at   = now(),
         location    = 'fridge'
   where id = p_item_id
  returning * into v_item;

  -- A partir de aquí manda el tope de 24 h de la vista de prioridad (D-14),
  -- por encima de la fecha reanudada.
  perform public.record_inventory_event(v_item, 'thawed', null,
    jsonb_build_object('frozen_days_added', v_days));
  return v_item;
end;
$$;

-- ── Terminar ──────────────────────────────────────────────────────────────
create function public.finish_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  v_item := public.require_item(p_item_id);

  update public.inventory_items
     set state              = 'finished',
         remaining_quantity = 0,
         opened_at          = coalesce(opened_at, now()),
         frozen_at          = null,
         closed_out_at      = now()
   where id = p_item_id
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'finished');
  return v_item;
end;
$$;

-- ── Tirar ─────────────────────────────────────────────────────────────────
-- El motivo no es un adorno: es lo que alimentará los patrones de desperdicio
-- después del MVP. Por eso se pide, aunque pueda ir vacío.
create function public.discard_item(p_item_id uuid, p_reason text default null)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  v_item := public.require_item(p_item_id);

  update public.inventory_items
     set state         = 'discarded',
         frozen_at     = null,
         closed_out_at = now()
   where id = p_item_id
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'discarded', null,
    jsonb_build_object(
      'reason', p_reason,
      'wasted_quantity', v_item.remaining_quantity,
      'unit_family', v_item.unit_family
    ));
  return v_item;
end;
$$;

-- ── Permisos ──────────────────────────────────────────────────────────────
-- Las auxiliares TIENEN que estar al alcance de authenticated. Las acciones
-- son SECURITY INVOKER, o sea que corren como quien llama, y si el usuario no
-- puede ejecutar require_item, no puede ejecutar ninguna accion. Exponerlas no
-- concede nada nuevo, porque las dos siguen sujetas a la RLS:
--   · require_item solo lee, y lo que no es de tu hogar no aparece.
--   · record_inventory_event inserta un evento con tus permisos, asi que la
--     politica de inventory_events rechaza un household_id que no sea tuyo.
--     Y el usuario ya podia insertar eventos en su hogar de todas formas.
revoke all on function public.record_inventory_event(public.inventory_items, public.inventory_event_type, numeric, jsonb) from public, anon;
revoke all on function public.require_item(uuid) from public, anon;

grant execute on function public.record_inventory_event(public.inventory_items, public.inventory_event_type, numeric, jsonb) to authenticated;
grant execute on function public.require_item(uuid) to authenticated;

revoke all on function public.open_item(uuid)             from public, anon;
revoke all on function public.use_quantity(uuid, numeric) from public, anon;
revoke all on function public.freeze_item(uuid)           from public, anon;
revoke all on function public.thaw_item(uuid)             from public, anon;
revoke all on function public.finish_item(uuid)           from public, anon;
revoke all on function public.discard_item(uuid, text)    from public, anon;

grant execute on function public.open_item(uuid)             to authenticated;
grant execute on function public.use_quantity(uuid, numeric) to authenticated;
grant execute on function public.freeze_item(uuid)           to authenticated;
grant execute on function public.thaw_item(uuid)             to authenticated;
grant execute on function public.finish_item(uuid)           to authenticated;
grant execute on function public.discard_item(uuid, text)    to authenticated;
