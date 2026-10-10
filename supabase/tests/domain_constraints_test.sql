-- ═══════════════════════════════════════════════════════════════════════════
-- Los principios del proyecto, comprobados como restricciones de la base.
--
-- No se prueba RLS aquí (eso es rls_isolation_test.sql), así que estos casos
-- corren como `postgres`: lo que se mira es si la base rechaza el dato malo,
-- no quién lo escribe.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '3333cccc-3333-4333-8333-333333333333',
   'authenticated', 'authenticated', 'clara@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config(
  'opsi.household',
  (select household_id::text from public.household_members
    where user_id = '3333cccc-3333-4333-8333-333333333333'),
  true
);

-- ── «No inventar datos»: ninguna fecha sin su origen ──────────────────────

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity,
         remaining_quantity, limit_date)
      values (%L, 'Yogur', 'mass', 'g', 125, 125, current_date + 5)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'una fecha sin tipo ni origen es rechazada'
);

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity,
         remaining_quantity, limit_date, date_kind)
      values (%L, 'Yogur', 'mass', 'g', 125, 125, current_date + 5, 'expiry')$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'una fecha con tipo pero sin origen tambien es rechazada'
);

select lives_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity,
         remaining_quantity, limit_date, date_kind, date_source)
      values (%L, 'Yogur', 'mass', 'g', 125, 125, current_date + 5, 'expiry', 'package')$$,
    current_setting('opsi.household')
  ),
  'una fecha completa (valor + tipo + origen) se acepta'
);

select lives_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Sal', 'mass', 'g', 1000, 1000)$$,
    current_setting('opsi.household')
  ),
  'un elemento sin ninguna fecha se acepta: "sin fecha" no es lo mismo que "sin urgencia"'
);

-- ── Decision D-07: la familia manda sobre las unidades ────────────────────

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Aceite', 'volume', 'kg', 1000, 1000)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'kg en algo medido en volumen es rechazado'
);

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Huevos', 'count', 'g', 6, 6)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'gramos en algo contado por piezas es rechazado'
);

-- ── Coherencia de cantidades y estados ────────────────────────────────────

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Arroz', 'mass', 'kg', 1000, 2000)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'no se puede tener mas cantidad restante que inicial'
);

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity,
         remaining_quantity, opened_at)
      values (%L, 'Arroz', 'mass', 'kg', 1000, 1000, now())$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'un elemento cerrado no puede tener fecha de apertura'
);

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, state, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Arroz', 'discarded', 'mass', 'kg', 1000, 0)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'algo desechado tiene que decir cuando se desecho'
);

-- ── Congelado: la cuenta atras se pausa y se reanuda (D-12) ───────────────

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, state, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Pan', 'frozen', 'mass', 'g', 460, 460)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'algo congelado tiene que decir desde cuando'
);

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity, frozen_at)
      values (%L, 'Pan', 'mass', 'g', 460, 460, now())$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'algo que no esta congelado no puede arrastrar un tramo abierto'
);

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity, frozen_days)
      values (%L, 'Pan', 'mass', 'g', 460, 460, -3)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'los dias acumulados en el congelador no pueden ser negativos'
);

select lives_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, state, unit_family, display_unit, initial_quantity,
         remaining_quantity, frozen_at, frozen_days)
      values (%L, 'Pan', 'frozen', 'mass', 'g', 460, 460, now(), 12)$$,
    current_setting('opsi.household')
  ),
  'congelado por segunda vez: tramo en curso mas dias ya acumulados'
);

-- ── El registro de eventos ────────────────────────────────────────────────

select throws_ok(
  format(
    $$insert into public.inventory_events (household_id, type)
      values (%L, 'quantity_used')$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'un evento de consumo sin cantidad es rechazado'
);

select throws_ok(
  format(
    $$insert into public.inventory_events (household_id, type, quantity_used)
      values (%L, 'opened', 100)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'un evento que no mueve cantidad no puede traerla'
);

-- ── El catalogo ───────────────────────────────────────────────────────────

select lives_ok(
  $$insert into public.products (household_id, barcode, name, data_source)
    values (null, '8410000000001', 'Leche entera 1 L', 'openfoodfacts')$$,
  'se puede dar de alta un producto en el catalogo global'
);

select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source)
    values (null, '8410000000001', 'Duplicado', 'openfoodfacts')$$,
  '23505',
  null,
  'un codigo de barras no se repite en el catalogo global'
);

select throws_ok(
  $$insert into public.products (household_id, name, data_source)
    values (null, 'Global inventado', 'user')$$,
  '23514',
  null,
  'un producto global tiene que venir de una fuente conocida'
);

select throws_ok(
  $$insert into public.products (household_id, name, barcode)
    values (null, 'Codigo invalido', 'ABC')$$,
  '23514',
  null,
  'un codigo de barras que no son digitos es rechazado'
);

-- ── Lista de la compra ────────────────────────────────────────────────────

select lives_ok(
  format(
    $$insert into public.shopping_list_items (household_id, name)
      values (%L, 'Papel de cocina')$$,
    current_setting('opsi.household')
  ),
  'una linea de la lista sin cantidad se acepta'
);

select throws_ok(
  format(
    $$insert into public.shopping_list_items (household_id, name, quantity)
      values (%L, 'Arroz', 1000)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'una cantidad sin unidad ni familia es rechazada'
);

select throws_ok(
  format(
    $$insert into public.shopping_list_items (household_id, name, is_purchased)
      values (%L, 'Arroz', true)$$,
    current_setting('opsi.household')
  ),
  '23514',
  null,
  'algo marcado como comprado tiene que decir cuando'
);

-- ── Ajustes ───────────────────────────────────────────────────────────────

select throws_ok(
  $$update public.user_settings set digest_hour = 24$$,
  '23514',
  null,
  'la hora del resumen tiene que ser una hora real'
);

select throws_ok(
  $$update public.user_settings set digest_minute = 60$$,
  '23514',
  null,
  'y los minutos, minutos de verdad'
);

select throws_ok(
  $$update public.user_settings set digest_minute = -1$$,
  '23514',
  null,
  'sin negativos'
);

select throws_ok(
  $$update public.user_settings set push_token = 'ExponentPushToken[xxx]'$$,
  '23514',
  null,
  'guardar un token push obliga a registrar cuando se guardo'
);

select * from finish();
rollback;
