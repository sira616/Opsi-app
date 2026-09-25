-- ═══════════════════════════════════════════════════════════════════════════
-- Conservación tras abrir: producto → categoría → nada
--
-- `shelf_life_for_item` decide qué plazo enseña el detalle de un alimento, y la
-- regla de precedencia (D-15) vive en un solo sitio: si el producto trae su
-- dato, manda; si no, la categoría; si tampoco, nada, y «nada» no es un error.
--
-- Vivía dentro del test de la nevera compartida por accidente: no tiene nada
-- que ver con compartir. Se separó cuando ese test se reescribió para el
-- modelo de neveras privada + compartidas.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();


-- ── Tres cuentas ──────────────────────────────────────────────────────────
-- El trigger on_auth_user_created hace el resto: a cada una su hogar, su
-- pertenencia como owner y sus ajustes con el nombre de usuario.

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
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'cccc3333-cccc-4ccc-8ccc-cccc33333333',
   'authenticated', 'authenticated', 'carla@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.ana',   'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', true);
select set_config('opsi.bruno', 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', true);
select set_config('opsi.carla', 'cccc3333-cccc-4ccc-8ccc-cccc33333333', true);

select set_config('opsi.hogar_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.ana')::uuid), true);
select set_config('opsi.hogar_bruno',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.bruno')::uuid), true);
select set_config('opsi.hogar_carla',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.carla')::uuid), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Conservación tras apertura: producto → categoría → nada
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(
  (select count(*) from public.category_shelf_life_reference), 10::bigint,
  'la tabla de referencia trae las diez categorias sembradas'
);

select throws_ok(
  $$insert into public.category_shelf_life_reference
      (category, days, recommended_location, note, source)
    values ('otros', 999, 'pantry', 'colada', 'inventada')$$,
  '42501',
  null,
  'la tabla de referencia no se escribe desde la app'
);

-- Un elemento de alta manual: sin producto, solo con su categoria.
insert into public.inventory_items
  (household_id, name, category, unit_family, display_unit,
   initial_quantity, remaining_quantity, created_by)
values
  (current_setting('opsi.hogar_ana')::uuid, 'Merluza', 'pescado', 'mass', 'g',
   500, 500, current_setting('opsi.ana')::uuid);

-- Y otro con producto de catalogo privado, que si trae sus dias.
insert into public.products (household_id, name, open_shelf_life_days)
values (current_setting('opsi.hogar_ana')::uuid, 'Queso curado', 9);

insert into public.inventory_items
  (household_id, product_id, name, category, unit_family, display_unit,
   initial_quantity, remaining_quantity, created_by)
values
  (current_setting('opsi.hogar_ana')::uuid,
   (select p.id from public.products p where p.name = 'Queso curado'),
   'Cuna de queso', 'lacteos', 'mass', 'g',
   300, 300, current_setting('opsi.ana')::uuid);

select set_config('opsi.merluza',
  (select i.id::text from public.inventory_items i where i.name = 'Merluza'), true);
select set_config('opsi.queso',
  (select i.id::text from public.inventory_items i where i.name = 'Cuna de queso'), true);

select is(
  (select s.days from public.shelf_life_for_item(current_setting('opsi.merluza')::uuid) s),
  1,
  'sin producto contesta la categoria: pescado, un dia'
);

select is(
  (select s.origin::text from public.shelf_life_for_item(current_setting('opsi.merluza')::uuid) s),
  'categoria',
  'y lo dice: el origen es la categoria'
);

select is(
  (select s.recommended_location::text
     from public.shelf_life_for_item(current_setting('opsi.merluza')::uuid) s),
  'fridge',
  'con su ubicacion recomendada'
);

select is(
  (select s.days from public.shelf_life_for_item(current_setting('opsi.queso')::uuid) s),
  9,
  'el producto gana a la categoria (D-15)'
);

select is(
  (select s.origin::text from public.shelf_life_for_item(current_setting('opsi.queso')::uuid) s),
  'producto',
  'y el origen lo delata'
);

select is(
  (select count(*) from public.shelf_life_for_item(gen_random_uuid())),
  0::bigint,
  'sin elemento no hay respuesta, y eso no es un error'
);

-- La RLS del elemento sigue mandando: SECURITY INVOKER.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.shelf_life_for_item(current_setting('opsi.merluza')::uuid)),
  0::bigint,
  'el elemento de otro hogar no contesta ni por la referencia'
);

reset role;

select * from finish();
rollback;
