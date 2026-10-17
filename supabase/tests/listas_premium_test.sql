-- ═══════════════════════════════════════════════════════════════════════════
-- Varias listas de la compra, el plan y lo que más gastas
--
-- 20261017100000 añade `shopping_lists`, el plan y el color de `user_settings`, y
-- `most_used_products`. Aquí se prueba que:
--
--   · cada nevera tiene su lista desde que nace, y siempre queda una;
--   · el plan básico llega a 3 listas, premium a 20, y no se salta desde el cliente;
--   · una línea cae en la primera lista si no se elige, y nunca en la de otra nevera;
--   · el plan no lo escribe el cliente, y los colores son de premium;
--   · lo que más gastas es premium, y no deja ver una nevera ajena.
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

select set_config('opsi.priv_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'::uuid), true);
select set_config('opsi.priv_bruno',
  (select m.household_id::text from public.household_members m
    where m.user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'::uuid), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Cada nevera nace con su lista
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*) from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid),
  1::bigint,
  'la nevera de Ana nació con una lista'
);

select is(
  (select name from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid),
  'La compra',
  'y se llama «La compra»'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select set_config('opsi.lista_ana',
  (select id::text from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid), true);

-- ══════════════════════════════════════════════════════════════════════════
-- B · El plan básico: hasta 3, la primera incluida
-- ══════════════════════════════════════════════════════════════════════════

select is(public.my_plan(), 'basic', 'Ana empieza en el plan básico');

select lives_ok(
  $$insert into public.shopping_lists (household_id, name)
    values (current_setting('opsi.priv_ana')::uuid, '  Fiesta  ')$$,
  'se crea una segunda lista'
);

select is(
  (select name from public.shopping_lists
    where household_id = current_setting('opsi.priv_ana')::uuid and name like 'Fiesta%'),
  'Fiesta',
  'el nombre se guarda sin espacios sobrantes'
);

select lives_ok(
  $$insert into public.shopping_lists (household_id, name)
    values (current_setting('opsi.priv_ana')::uuid, 'Cumple')$$,
  'y una tercera'
);

select throws_ok(
  $$insert into public.shopping_lists (household_id, name)
    values (current_setting('opsi.priv_ana')::uuid, 'Una más')$$,
  'P0001', null,
  'la cuarta se rechaza en el plan básico'
);

select is(
  (select created_by from public.shopping_lists where name = 'Cumple'),
  'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'::uuid,
  'quién la creó lo pone el servidor'
);

select throws_ok(
  $$insert into public.shopping_lists (household_id, name)
    values (current_setting('opsi.priv_bruno')::uuid, 'Colada')$$,
  '42501', null,
  'no se crea una lista en la nevera de otra persona'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Nombre y renombrar
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$update public.shopping_lists set name = '   ' where name = 'Cumple'$$,
  '23514', null,
  'un nombre vacío se rechaza'
);

select throws_ok(
  $$update public.shopping_lists set name = repeat('a', 41) where name = 'Cumple'$$,
  '23514', null,
  'y uno de más de 40 caracteres'
);

select lives_ok(
  $$update public.shopping_lists set name = ' Cumpleaños ' where name = 'Cumple'$$,
  'se renombra'
);

select is(
  (select count(*) from public.shopping_lists where name = 'Cumpleaños'),
  1::bigint,
  'sin espacios sobrantes'
);

select throws_ok(
  $$update public.shopping_lists set household_id = current_setting('opsi.priv_bruno')::uuid where name = 'Cumpleaños'$$,
  '42501', null,
  'una lista no cambia de nevera: el permiso es solo del nombre'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Las líneas caen en su lista
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.shopping_list_items (household_id, name)
    values (current_setting('opsi.priv_ana')::uuid, 'Leche')$$,
  'una línea sin lista se apunta'
);

select is(
  (select list_id from public.shopping_list_items where name = 'Leche'),
  current_setting('opsi.lista_ana')::uuid,
  'y va a la primera lista de la nevera'
);

select set_config('opsi.lista_fiesta',
  (select id::text from public.shopping_lists where name = 'Fiesta'), true);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, name, list_id)
    values (current_setting('opsi.priv_ana')::uuid, 'Globos', current_setting('opsi.lista_fiesta')::uuid)$$,
  'una línea con lista se apunta en ESA lista'
);

select lives_ok(
  $$update public.shopping_list_items set list_id = current_setting('opsi.lista_fiesta')::uuid where name = 'Leche'$$,
  'una línea pasa a otra lista de la misma nevera'
);

-- La lista de Bruno, vista por quien administra: Ana no la ve y no puede usarla.
reset role;
select set_config('opsi.lista_bruno',
  (select id::text from public.shopping_lists where household_id = current_setting('opsi.priv_bruno')::uuid), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.shopping_list_items (household_id, name, list_id)
    values (current_setting('opsi.priv_ana')::uuid, 'Colada', current_setting('opsi.lista_bruno')::uuid)$$,
  'P0002', null,
  'una línea de mi nevera no cuelga de la lista de otra nevera'
);

select throws_ok(
  $$update public.shopping_list_items set list_id = current_setting('opsi.lista_bruno')::uuid where name = 'Globos'$$,
  'P0002', null,
  'ni se mueve a ella'
);

select is(
  (select count(*) from public.shopping_lists where id = current_setting('opsi.lista_bruno')::uuid),
  0::bigint,
  'y la lista de otra nevera no se ve'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · Borrar: siempre queda una, y las líneas se van con su lista
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$delete from public.shopping_lists where id = current_setting('opsi.lista_fiesta')::uuid$$,
  'se borra una lista'
);

select is(
  (select count(*) from public.shopping_list_items where name in ('Leche', 'Globos')),
  0::bigint,
  'y sus líneas con ella'
);

select lives_ok(
  $$delete from public.shopping_lists where name = 'Cumpleaños'$$,
  'se borra otra'
);

select throws_ok(
  $$delete from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid$$,
  'P0001', null,
  'la última no se borra'
);

-- ══════════════════════════════════════════════════════════════════════════
-- F · El plan no lo escribe el cliente, y los colores son de premium
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$update public.user_settings set plan = 'premium'$$,
  '42501', null,
  'el cliente no puede subirse el plan'
);

select throws_ok(
  $$update public.user_settings set accent = 'blue'$$,
  '42501', null,
  'un color que no es el verde es de premium'
);

select lives_ok(
  $$update public.user_settings set accent = 'green'$$,
  'el verde lo puede tener cualquiera'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G · Premium
-- ══════════════════════════════════════════════════════════════════════════

reset role;
update public.user_settings set plan = 'premium' where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(public.my_plan(), 'premium', 'con el plan premium...');

select lives_ok(
  $$update public.user_settings set accent = 'blue'$$,
  '...se puede elegir otro color'
);

select throws_ok(
  $$update public.user_settings set accent = 'rojo'$$,
  '23514', null,
  'pero no uno que no existe'
);

select lives_ok(
  $$insert into public.shopping_lists (household_id, name)
    select current_setting('opsi.priv_ana')::uuid, 'L' || g from generate_series(1, 19) g$$,
  'se llega a 20 listas'
);

select is(
  (select count(*) from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid),
  20::bigint,
  'exactamente 20'
);

select throws_ok(
  $$insert into public.shopping_lists (household_id, name)
    values (current_setting('opsi.priv_ana')::uuid, 'La 21')$$,
  'P0001', null,
  'y la 21 no cabe ni en premium'
);

-- ══════════════════════════════════════════════════════════════════════════
-- H · Lo que más gastas
-- ══════════════════════════════════════════════════════════════════════════

select set_config('opsi.it1',
  (select (public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
     p_name => 'Leche', p_unit_family => 'volume', p_display_unit => 'l', p_quantity => 1000)).id::text), true);
select set_config('opsi.it2',
  (select (public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
     p_name => 'leche ', p_unit_family => 'volume', p_display_unit => 'l', p_quantity => 1000)).id::text), true);
select set_config('opsi.it3',
  (select (public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
     p_name => 'Pan', p_unit_family => 'count', p_display_unit => 'unit', p_quantity => 1)).id::text), true);
select set_config('opsi.it4',
  (select (public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
     p_name => 'Pan', p_unit_family => 'count', p_display_unit => 'unit', p_quantity => 1)).id::text), true);
select set_config('opsi.it5',
  (select (public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
     p_name => 'Queso', p_unit_family => 'mass', p_display_unit => 'g', p_quantity => 200)).id::text), true);

select lives_ok($$select public.finish_item(current_setting('opsi.it1')::uuid)$$, 'se agota la leche');
select lives_ok($$select public.finish_item(current_setting('opsi.it2')::uuid)$$, 'y otra «leche » con otro tecleo');
select lives_ok($$select public.finish_item(current_setting('opsi.it3')::uuid)$$, 'se agota un pan');
select lives_ok($$select public.discard_item(current_setting('opsi.it4')::uuid)$$, 'se tira otro pan');
select lives_ok($$select public.discard_item(current_setting('opsi.it5')::uuid)$$, 'y se tira un queso que nunca se agotó');

select is(
  (select count(*) from public.most_used_products(current_setting('opsi.priv_ana')::uuid)),
  2::bigint,
  'salen la leche y el pan, no el queso (solo tirado no es gasto)'
);

select is(
  (select lower(product_name) || ':' || finished_count from public.most_used_products(current_setting('opsi.priv_ana')::uuid) limit 1),
  'leche:2',
  'la leche va primera: dos veces, aunque se tecleara distinto'
);

select is(
  (select discarded_count from public.most_used_products(current_setting('opsi.priv_ana')::uuid) where lower(product_name) = 'pan'),
  1,
  'y el pan cuenta también el que se tiró'
);

select throws_ok(
  $$select * from public.most_used_products(current_setting('opsi.priv_ana')::uuid, 0, 10)$$,
  '22023', null,
  'pedir 0 días se rechaza'
);

-- Bruno, aunque sea premium, no ve la nevera de Ana.
reset role;
update public.user_settings set plan = 'premium' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.most_used_products(current_setting('opsi.priv_ana')::uuid)),
  0::bigint,
  'la nevera de otra persona sale vacía, aunque se sea premium'
);

select is(
  (select count(*) from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid),
  0::bigint,
  'y sus listas no se ven'
);

-- Y alguien en el plan básico no pasa de la puerta.
reset role;
update public.user_settings set plan = 'basic' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select throws_ok(
  $$select * from public.most_used_products(current_setting('opsi.priv_bruno')::uuid)$$,
  '42501', null,
  'en el plan básico lo que más gastas es de premium'
);

select throws_ok(
  $$delete from public.shopping_lists where household_id = current_setting('opsi.priv_bruno')::uuid$$,
  'P0001', null,
  'y a Bruno tampoco se le deja borrar su única lista'
);

-- ══════════════════════════════════════════════════════════════════════════
-- I · Una nevera que se borra se lleva sus listas, sin que la regla de «queda una» estorbe
-- ══════════════════════════════════════════════════════════════════════════

reset role;

select lives_ok(
  $$delete from public.households where id = current_setting('opsi.priv_bruno')::uuid$$,
  'borrar la nevera entera funciona'
);

select is(
  (select count(*) from public.shopping_lists where household_id = current_setting('opsi.priv_bruno')::uuid),
  0::bigint,
  'y sus listas se fueron con ella'
);

-- ══════════════════════════════════════════════════════════════════════════
-- J · Permisos
-- ══════════════════════════════════════════════════════════════════════════

set local role anon;

select throws_ok(
  $$select count(*) from public.shopping_lists$$,
  '42501', null,
  'sin sesión no se leen las listas'
);

select throws_ok(
  $$select public.my_plan()$$,
  '42501', null,
  'ni se pregunta el plan'
);

reset role;

select * from finish();
rollback;
