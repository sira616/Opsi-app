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

-- La ficha: de dónde sale, y cuánto hay ahora.
select is(
  (select barcode from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where product_name = 'Yogur natural'),
  '849999000111',
  'lo escaneado trae su código de barras'
);

select is(
  (select data_source from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where product_name = 'Yogur natural'),
  'user',
  'y de dónde salió'
);

select is(
  (select barcode from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where product_name = 'Pan'),
  null,
  'lo escrito a mano no tiene código'
);

select is(
  (select in_stock from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where lower(product_name) = 'leche'),
  2,
  'hay dos leches en la nevera ahora'
);

select lives_ok(
  $$select public.finish_item((select id from public.inventory_items where initial_quantity = 1000 and lower(trim(name)) = 'leche'))$$,
  'se acaba una'
);

select is(
  (select in_stock from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where lower(product_name) = 'leche'),
  1,
  'y lo agotado ya no cuenta como lo que tienes'
);

select is(
  (select first_added_at < last_added_at from public.my_known_products(current_setting('opsi.priv_ana')::uuid)
    where lower(product_name) = 'leche'),
  true,
  'la primera vez es anterior a la última'
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
-- C bis · Tus productos son de la cuenta: sin nevera, los de todas las tuyas
-- ══════════════════════════════════════════════════════════════════════════

reset role;
with piso as (
  insert into public.households (name, kind, icon, member_limit)
  values ('Piso', 'shared', 'house', 5)
  returning id
)
insert into public.household_members (household_id, user_id, role)
select piso.id, 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', 'owner' from piso;
select set_config('opsi.piso',
  (select m.household_id::text from public.household_members m
    where m.user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'::uuid
      and m.household_id <> current_setting('opsi.priv_ana')::uuid), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok($$select public.create_item(p_household_id => current_setting('opsi.piso')::uuid,
  p_name => 'Arroz', p_unit_family => 'mass', p_display_unit => 'g', p_quantity => 500)$$,
  'Ana añade un arroz en el piso');

select is(
  (select count(*) from public.my_known_products()),
  4::bigint,
  'sin decir nevera salen los productos de las dos: lo de la privada y el arroz del piso'
);

select is(
  (select count(*) from public.my_known_products(current_setting('opsi.priv_ana')::uuid)),
  3::bigint,
  'con la privada, solo lo de la privada'
);

select is(
  (select product_name from public.my_known_products(current_setting('opsi.piso')::uuid)),
  'Arroz',
  'y con el piso, solo el arroz'
);

select is(
  (select household_id from public.my_known_products() where product_name = 'Arroz'),
  current_setting('opsi.piso')::uuid,
  'cada producto dice en qué nevera lo añadiste la última vez: el arroz, en el piso...'
);

select is(
  (select household_id from public.my_known_products() where product_name = 'Pan'),
  current_setting('opsi.priv_ana')::uuid,
  '...y el pan, en la privada'
);

select is(
  (select in_stock from public.my_known_products() where product_name = 'Arroz'),
  1,
  'lo que hay ahora cuenta todas las neveras'
);

set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.my_known_products()),
  0::bigint,
  'Bruno, sin nevera, tampoco ve nada de lo de Ana'
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
  $$select * from public.my_known_products(current_setting('opsi.priv_ana')::uuid, 201)$$,
  '22023', null,
  'y pedir más de doscientos'
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
