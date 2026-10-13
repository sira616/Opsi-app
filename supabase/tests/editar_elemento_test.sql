-- ═══════════════════════════════════════════════════════════════════════════
-- Editar un elemento: lo que se puede corregir y lo que NO
--
-- `update_item` (20261012100000) cambia un elemento y escribe su evento `updated`
-- en la misma transacción. Aquí se prueba que:
--
--   · lo corregible se corrige y deja su rastro, con lo de antes y lo de ahora;
--   · lo que no cambia no genera un evento vacío;
--   · la cantidad solo se corrige en lo que está sin abrir;
--   · no se edita lo cerrado ni lo de otra nevera;
--   · las reglas de siempre se mantienen (fecha completa o ninguna, unidad de su familia).
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
  ('00000000-0000-0000-0000-000000000000', 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111',
   'authenticated', 'authenticated', 'ana@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222',
   'authenticated', 'authenticated', 'bruno@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.ana',   'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', true);
select set_config('opsi.bruno', 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', true);
select set_config('opsi.priv_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.ana')::uuid), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select set_config('opsi.leche',
  (select (public.create_item(
     p_household_id => current_setting('opsi.priv_ana')::uuid,
     p_name => 'Lche', p_unit_family => 'volume', p_display_unit => 'ml',
     p_quantity => 1000, p_location => 'pantry',
     p_limit_date => '2027-01-31', p_date_kind => 'best_before', p_date_source => 'package',
     p_category => 'otros')).id::text), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Corregir lo corregible
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, '  Leche entera  ', 'lacteos', 'fridge',
      '2027-01-31', 'best_before', 'package')$$,
  'se corrige el nombre, el pasillo y el sitio'
);

select is(
  (select name || '|' || category::text || '|' || location::text
     from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  'Leche entera|lacteos|fridge',
  'el nombre sin espacios sobrantes, y el pasillo y el sitio nuevos'
);

select is(
  (select count(*) from public.inventory_events
    where item_id = current_setting('opsi.leche')::uuid and type = 'updated'),
  1::bigint,
  'y queda UN evento «updated»'
);

select is(
  (select payload -> 'cambios' -> 'name' ->> 'de' || ' → ' || (payload -> 'cambios' -> 'name' ->> 'a')
     from public.inventory_events
    where item_id = current_setting('opsi.leche')::uuid and type = 'updated'),
  'Lche → Leche entera',
  'con lo de antes y lo de ahora'
);

select ok(
  (select not (payload -> 'cambios' ? 'date') and payload -> 'cambios' ? 'category'
          and payload -> 'cambios' ? 'location'
     from public.inventory_events
    where item_id = current_setting('opsi.leche')::uuid and type = 'updated'),
  'solo lo que cambió: la fecha no, porque era la misma'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Lo que no cambia no deja rastro
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      '2027-01-31', 'best_before', 'package')$$,
  'mandar lo mismo no falla...'
);

select is(
  (select count(*) from public.inventory_events
    where item_id = current_setting('opsi.leche')::uuid and type = 'updated'),
  1::bigint,
  '...ni escribe otro evento'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · La fecha: completa o ninguna
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      '2027-02-15', null, null)$$,
  '22023', null,
  'una fecha sin tipo ni origen se rechaza'
);

select lives_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      '2027-02-15', 'expiry', 'user')$$,
  'una fecha completa se acepta'
);

select is(
  (select limit_date::text || '|' || date_kind::text || '|' || date_source::text
     from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  '2027-02-15|expiry|user',
  'y se guarda con su tipo y su origen'
);

select lives_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge')$$,
  'se puede quitar la fecha entera'
);

select is(
  (select num_nonnulls(limit_date, date_kind, date_source)
     from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  0,
  'y no queda ninguna de las tres'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Nombre, pasillo y sitio
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, '   ', 'lacteos', 'fridge')$$,
  '22023', null,
  'un nombre vacío se rechaza con un mensaje que se entiende'
);

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, repeat('a', 201), 'lacteos', 'fridge')$$,
  '22023', null,
  'y uno de más de 200 caracteres'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · La cantidad: solo sin abrir, y en su familia
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      null, null, null, 1500, 'ml')$$,
  'sin abrir se corrige la cantidad'
);

select is(
  (select initial_quantity::text || '|' || remaining_quantity::text
     from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  '1500|1500',
  'lo comprado y lo que queda a la vez: sin abrir es lo mismo'
);

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      null, null, null, 2, 'kg')$$,
  '22023', null,
  'no se cambia de familia: kilos de algo medido en volumen'
);

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      null, null, null, 1500, null)$$,
  '22023', null,
  'la cantidad va con su unidad'
);

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      null, null, null, -5, 'ml')$$,
  '22023', null,
  'y mayor que cero'
);

select lives_ok($$select public.open_item(current_setting('opsi.leche')::uuid)$$, 'se abre la leche');

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera', 'lacteos', 'fridge',
      null, null, null, 800, 'ml')$$,
  'P0001', null,
  'abierta, la cantidad ya no se reescribe: para eso está «Usar»'
);

select lives_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Leche entera abierta', 'lacteos', 'fridge',
      null, null, null, 1500, 'ml')$$,
  'pero se puede seguir corrigiendo lo demás (mandando la misma cantidad)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- F · Lo ajeno y lo cerrado
-- ══════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Robada', 'otros', 'pantry')$$,
  'P0002', null,
  'Bruno no puede editar lo de la nevera de Ana: para él no existe'
);

set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok($$select public.finish_item(current_setting('opsi.leche')::uuid)$$, 'se termina la leche');

select throws_ok(
  $$select public.update_item(
      current_setting('opsi.leche')::uuid, 'Otra vez', 'otros', 'pantry')$$,
  'P0001', null,
  'lo cerrado no se edita'
);

reset role;

select is(
  (select name from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  'Leche entera abierta',
  'y no cambió nada: ni lo de Bruno ni lo de después de cerrar'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G · Permisos
-- ══════════════════════════════════════════════════════════════════════════

set local role anon;

select throws_ok(
  $$select public.update_item(gen_random_uuid(), 'x', 'otros', 'pantry')$$,
  '42501', null,
  'sin sesión no se ejecuta'
);

reset role;

select * from finish();
rollback;
