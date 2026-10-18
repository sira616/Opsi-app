-- ═══════════════════════════════════════════════════════════════════════════
-- Tus productos (Opsi Premium ⭐): lo que ya has añadido, sin repetidos
--
-- `my_known_products` (20261018100000). Aquí se prueba que:
--
--   · es premium, y sin plan no se ejecuta;
--   · agrupa por producto del catálogo o, si no hay, por el nombre sin mayúsculas ni
--     espacios de más, con lo último añadido primero;
--   · solo cuenta lo añadido por QUIEN LLAMA y solo de su nevera;
--   · rechaza una petición descabellada y no se ejecuta sin sesión.
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

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

-- Un producto del catálogo privado de Ana, para enlazarlo a un elemento.
with nuevo as (
  insert into public.products (household_id, barcode, name, brand, data_source)
  values (current_setting('opsi.priv_ana')::uuid, '849999000111', 'Yogur natural', 'Marca X', 'user')
  returning id
)
select set_config('opsi.prod', (select id::text from nuevo), true);

-- Dos veces «Leche» tecleada distinta, un yogur con producto (dos veces) y un pan.
select lives_ok($$select public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
  p_name => 'Leche', p_unit_family => 'volume', p_display_unit => 'l', p_quantity => 1000)$$, 'se añade una leche');
select lives_ok($$select public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
  p_name => 'leche ', p_unit_family => 'volume', p_display_unit => 'l', p_quantity => 1500)$$, 'y otra tecleada distinta');
select lives_ok($$select public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
  p_name => 'Yogur natural', p_unit_family => 'count', p_display_unit => 'unit', p_quantity => 4,
  p_product_id => current_setting('opsi.prod')::uuid)$$, 'se añade un yogur con su producto');
select lives_ok($$select public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
  p_name => 'Yogur natural', p_unit_family => 'count', p_display_unit => 'unit', p_quantity => 6,
  p_product_id => current_setting('opsi.prod')::uuid)$$, 'y otro');
select lives_ok($$select public.create_item(p_household_id => current_setting('opsi.priv_ana')::uuid,
  p_name => 'Pan', p_unit_family => 'count', p_display_unit => 'unit', p_quantity => 1)$$, 'y un pan escrito a mano');

-- Todo se creó en la misma transacción, así que comparten hora: se les da un orden.
reset role;
update public.inventory_items set created_at = now() - interval '5 minutes' where initial_quantity = 1000 and lower(trim(name)) = 'leche';
update public.inventory_items set created_at = now() - interval '4 minutes' where initial_quantity = 1500 and lower(trim(name)) = 'leche';
update public.inventory_items set created_at = now() - interval '3 minutes' where initial_quantity = 4 and name = 'Yogur natural';
update public.inventory_items set created_at = now() - interval '2 minutes' where initial_quantity = 6 and name = 'Yogur natural';
update public.inventory_items set created_at = now() - interval '1 minute' where name = 'Pan';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

-- ══════════════════════════════════════════════════════════════════════════
-- A · Es premium
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$select * from public.my_known_products(current_setting('opsi.priv_ana')::uuid)$$,
  '42501', null,
  'en el plan básico no se ejecuta'
);

reset role;
update public.user_settings set plan = 'premium' where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

-- ══════════════════════════════════════════════════════════════════════════
-- B · Sin repetidos, y lo último que añadiste manda
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*) from public.my_known_products(current_setting('opsi.priv_ana')::uuid)),
  3::bigint,
  'cinco elementos son tres productos: leche, yogur y pan'
);

select is(
  (select times_added from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where lower(product_name) = 'leche'),
  2,
  'la leche tecleada de dos maneras cuenta como una, dos veces'
);

select is(
  (select quantity from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where lower(product_name) = 'leche'),
  1500::numeric,
  'y propone la cantidad de la última vez'
);

select is(
  (select product_id from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where product_name = 'Yogur natural'),
  current_setting('opsi.prod')::uuid,
  'lo que tiene producto del catálogo lo trae enlazado'
);

select is(
  (select brand from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where product_name = 'Yogur natural'),
  'Marca X',
  'con su marca'
);

select is(
  (select product_id from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where product_name = 'Pan'),
  null,
  'y lo escrito a mano, sin producto'
);

select is(
  (select product_name from public.my_known_products(current_setting('opsi.priv_ana')::uuid) limit 1),
  'Pan',
  'lo último que añadiste va primero'
);

select is(
  (select count(*) from public.my_known_products(current_setting('opsi.priv_ana')::uuid, 2)),
  2::bigint,
  'el límite se respeta'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Solo lo tuyo
-- ══════════════════════════════════════════════════════════════════════════

reset role;
update public.user_settings set plan = 'premium' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.my_known_products(current_setting('opsi.priv_ana')::uuid)),
  0::bigint,
  'Bruno, aunque sea premium, no ve lo de la nevera de Ana'
);

select is(
  (select count(*) from public.my_known_products(
     (select m.household_id from public.household_members m
       where m.user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'::uuid))),
  0::bigint,
  'y en la suya no tiene nada todavía'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Entradas descabelladas y permisos
-- ══════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$select * from public.my_known_products(current_setting('opsi.priv_ana')::uuid, 0)$$,
  '22023', null,
  'pedir cero productos se rechaza'
);

select throws_ok(
  $$select * from public.my_known_products(current_setting('opsi.priv_ana')::uuid, 101)$$,
  '22023', null,
  'y pedir más de cien'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.my_known_products(gen_random_uuid())$$,
  '42501', null,
  'sin sesión no se ejecuta'
);

reset role;

select * from finish();
rollback;
