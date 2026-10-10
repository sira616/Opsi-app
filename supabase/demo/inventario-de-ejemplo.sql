-- ═══════════════════════════════════════════════════════════════════════════
-- Inventario de ejemplo, para tener algo que mirar.
--
-- CÓMO SE USA
--   1. Créate una cuenta en la app (eso crea tu hogar).
--   2. Abre el Studio en http://127.0.0.1:54323 → SQL Editor.
--   3. Pega esto entero y ejecútalo.
--
-- NO va en supabase/seed/: los seeds corren con `db:reset`, cuando todavía no
-- existe ningún usuario y por tanto ningún hogar del que colgar esto.
--
-- Se puede ejecutar varias veces: borra antes lo que haya creado él mismo.
--
-- Los elementos están elegidos para que se vea CADA grupo de prioridad, y en
-- particular los dos casos que cuesta creer hasta que se ven:
--   · La merluza descongelada, donde el tope de 24 h gana a una fecha lejana.
--   · El arroz sin fecha, que va a su propio grupo y no al final de la lista.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_household uuid;
  v_user      uuid;
begin
  -- Solo en el Supabase local. Este script escribe como `postgres` en «la nevera
  -- privada de la primera persona que encuentre»: pegado por error en el SQL
  -- Editor de un proyecto de la nube, llenaría de comida de ejemplo la cuenta de
  -- alguien real. La base local trae el secreto JWT por defecto de la CLI; la de
  -- la nube, otro. Misma guarda que el seed de desarrollo.
  if coalesce(current_setting('app.settings.jwt_secret', true), '')
       is distinct from 'super-secret-jwt-token-with-at-least-32-characters-long'
  then
    raise notice 'Demo omitida: esto no es el Supabase local.';
    return;
  end if;

  -- Tu nevera privada. Con neveras compartidas hay más de una, y «la más
  -- antigua» ya no es una forma fiable de elegir: se pide la personal, que es
  -- una por persona. Si hay varias personas en la base, la de la primera.
  select h.id, m.user_id into v_household, v_user
  from public.households h
  join public.household_members m on m.household_id = h.id
  where h.kind = 'personal'
  order by h.created_at
  limit 1;

  if v_household is null then
    raise exception 'No hay ningún hogar. Créate una cuenta en la app primero.';
  end if;

  -- Limpieza: solo lo que puso este script. Los eventos se quedan, que para
  -- eso son inmutables; sus item_id pasan a NULL.
  delete from public.inventory_items
   where household_id = v_household
     and notes = 'demo';

  insert into public.inventory_items (
    household_id, product_id, name, state, location,
    unit_family, display_unit, initial_quantity, remaining_quantity,
    limit_date, date_kind, date_source,
    opened_at, frozen_at, frozen_days, thawed_at,
    notes, created_by
  )
  values
    -- ── Prioridad alta ───────────────────────────────────────────────────
    (v_household,
     (select id from public.products where barcode = '8400000000062'),
     'Bacon en lonchas', 'partially_consumed', 'fridge',
     'mass', 'g', 200, 120,
     current_date, 'expiry', 'package',
     now() - interval '2 days', null, 0, null,
     'demo', v_user),

    (v_household,
     (select id from public.products where barcode = '8400000000017'),
     'Leche entera', 'partially_consumed', 'fridge',
     'volume', 'l', 1000, 400,
     current_date + 6, 'best_before', 'package',
     now() - interval '3 days', null, 0, null,
     'demo', v_user),

    -- El caso que demuestra el tope de 24 h: la fecha del envase está a un mes
    -- y estuvo 20 días congelada, o sea que «reanudando» le quedarían casi
    -- dos meses. Pero se descongeló ayer, así que vence HOY.
    (v_household, null,
     'Merluza', 'thawed', 'fridge',
     'mass', 'g', 500, 500,
     current_date + 30, 'expiry', 'package',
     null, null, 20, now() - interval '1 day',
     'demo', v_user),

    -- ── Prioridad media ──────────────────────────────────────────────────
    (v_household,
     (select id from public.products where barcode = '8400000000024'),
     'Yogur natural', 'closed', 'fridge',
     'count', 'unit', 4, 3,
     current_date + 4, 'best_before', 'package',
     null, null, 0, null,
     'demo', v_user),

    (v_household,
     (select id from public.products where barcode = '8400000000079'),
     'Tomate frito', 'open', 'fridge',
     'mass', 'g', 400, 250,
     current_date + 20, 'best_before', 'package',
     now() - interval '1 day', null, 0, null,
     'demo', v_user),

    -- ── Sin urgencia ─────────────────────────────────────────────────────
    (v_household,
     (select id from public.products where barcode = '8400000000048'),
     'Aceite de oliva virgen', 'closed', 'pantry',
     'volume', 'l', 1000, 1000,
     current_date + 240, 'best_before', 'package',
     null, null, 0, null,
     'demo', v_user),

    -- ── Congelado: la cuenta atrás está parada ───────────────────────────
    (v_household,
     (select id from public.products where barcode = '8400000000109'),
     'Pan de molde integral', 'frozen', 'freezer',
     'mass', 'g', 460, 460,
     current_date + 2, 'best_before', 'package',
     null, now() - interval '5 days', 0, null,
     'demo', v_user),

    -- ── Sin fecha: su propio grupo, no el final de la lista ──────────────
    (v_household,
     (select id from public.products where barcode = '8400000000031'),
     'Arroz redondo', 'closed', 'pantry',
     'mass', 'kg', 1000, 1000,
     null, null, null,
     null, null, 0, null,
     'demo', v_user),

    (v_household, null,
     'Garbanzos a granel', 'open', 'pantry',
     'mass', 'g', 800, 500,
     null, null, null,
     now() - interval '10 days', null, 0, null,
     'demo', v_user);

  raise notice 'Listo: % elementos en tu inventario.',
    (select count(*) from public.inventory_items where household_id = v_household);
end;
$$;

-- Cómo queda, ordenado como lo mostrará «Consumir primero».
select
  priority,
  name,
  state,
  effective_limit_date,
  days_left,
  effective_date_reason,
  effective_date_source
from public.inventory_with_priority
order by
  array_position(
    array['high','medium','low','undated','frozen','closed_out']::public.priority_group[],
    priority
  ),
  effective_limit_date nulls last,
  name;
