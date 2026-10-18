-- ═══════════════════════════════════════════════════════════════════════════
-- Salud e ingredientes: la ficha del producto y lo que evita cada persona
--
-- `20261021100000_salud_y_ingredientes`. Dos mitades que NO se cruzan en el servidor
-- (el cruce es del móvil), y aquí se prueba que cada una aguanta lo suyo:
--
--   A · Las columnas nuevas de `products`: o no consta nada o consta todo; solo el
--       catálogo global las tiene (un producto PRIVADO no puede fingir un «sin
--       alérgenos» ante sus compañeros); topes y lista cerrada de etiquetas.
--   B · `upsert_global_product` con su firma nueva: valida TODO otra vez aunque la
--       Edge Function ya lo filtrara, y marca cuándo se trajeron los datos.
--   C · `user_health_preferences`: lista cerrada, sin repetidos y ordenada; y la RLS
--       como única barrera: ni otra persona, ni un compañero de nevera, ni anon, ni
--       service_role la ven o la tocan.
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
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'cccc3333-cccc-4ccc-8ccc-cccc33333333',
   'authenticated', 'authenticated', 'carla@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'dddd4444-dddd-4ddd-8ddd-dddd44444444',
   'authenticated', 'authenticated', 'dani@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.priv_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'::uuid), true);

-- Ana y Bruno comparten una nevera: es lo que hace falta para probar que ni la gente
-- con la que compartes inventario ve tus preferencias de salud.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select set_config('opsi.piso',
  (select h.id::text from public.create_shared_household('Piso', 'couch') h), true);

reset role;

insert into public.household_members (household_id, user_id, role)
values (current_setting('opsi.piso')::uuid, 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', 'member');

-- ══════════════════════════════════════════════════════════════════════════
-- A · La ficha del producto: lo que consta y lo que no
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.products
      (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at)
    values
      (null, '8499990000201', 'Con salud', 'openfoodfacts', array['en:milk'], array[]::text[],
       array['en:no-gluten'], 'Leche.', now())$$,
  'una ficha global con sus datos de salud entra'
);

select lives_ok(
  $$insert into public.products
      (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values
      (null, '8499990000218', 'Consultada y vacía', 'openfoodfacts', array[]::text[], array[]::text[],
       array[]::text[], now())$$,
  'y una consultada que no declara nada también: listas vacías, sin ingredientes'
);

select lives_ok(
  $$insert into public.products (household_id, barcode, name, data_source)
    values (null, '8499990000225', 'Sin salud', 'openfoodfacts')$$,
  'y una anterior a esta función, sin ningún dato de salud'
);

select is(
  (select count(*) from public.products
    where barcode in ('8499990000225') and health_data_at is null and allergens_tags is null
      and traces_tags is null and labels_tags is null and ingredients_text is null),
  1::bigint,
  'una ficha sin datos queda con TODO a NULL: «no consta» no se confunde con «sin alérgenos»'
);

-- La coherencia: o no consta nada, o consta (y las tres listas existen).
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, health_data_at)
    values (null, '8499990000232', 'Fecha sin listas', 'openfoodfacts', now())$$,
  '23514', null,
  'una fecha de consulta sin las listas se rechaza'
);
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags)
    values (null, '8499990000232', 'Listas sin fecha', 'openfoodfacts', array[]::text[])$$,
  '23514', null,
  'y un «sin alérgenos» sin fecha de consulta también: no se puede afirmar sin haber mirado'
);
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, ingredients_text)
    values (null, '8499990000232', 'Ingredientes sin fecha', 'openfoodfacts', 'Agua.')$$,
  '23514', null,
  'ni unos ingredientes sin fecha'
);
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, health_data_at)
    values (null, '8499990000232', 'Falta labels', 'openfoodfacts', array[]::text[], array[]::text[], now())$$,
  '23514', null,
  'ni una consulta a la que le falta una de las tres listas'
);

-- Topes y lista cerrada.
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values (null, '8499990000232', 'Demasiados', 'openfoodfacts',
            array(select 'en:a' || i from generate_series(1, 41) i), array[]::text[], array[]::text[], now())$$,
  '23514', null,
  'más de 40 alérgenos se rechazan'
);
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values (null, '8499990000232', 'Traza nula', 'openfoodfacts',
            array[]::text[], array['en:nuts', null], array[]::text[], now())$$,
  '23514', null,
  'un NULL dentro de una lista se rechaza'
);
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values (null, '8499990000232', 'Etiqueta ajena', 'openfoodfacts',
            array[]::text[], array[]::text[], array['en:vegan'], now())$$,
  '23514', null,
  'una etiqueta que no es de la lista cerrada se rechaza'
);
select lives_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values (null, '8499990000232', 'Las tres', 'openfoodfacts',
            array[]::text[], array[]::text[],
            array['en:no-gluten', 'en:no-lactose', 'en:suitable-for-celiacs'], now())$$,
  'y las tres de la lista, sí'
);
select throws_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at)
    values (null, '8499990000249', 'Ingredientes largos', 'openfoodfacts',
            array[]::text[], array[]::text[], array[]::text[], repeat('a', 2001), now())$$,
  '23514', null,
  'unos ingredientes de más de 2000 caracteres se rechazan'
);
select lives_ok(
  $$insert into public.products (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at)
    values (null, '8499990000249', 'Ingredientes justos', 'openfoodfacts',
            array[]::text[], array[]::text[], array[]::text[], repeat('a', 2000), now())$$,
  'y de 2000 exactos caben'
);

-- ── Solo el catálogo global ───────────────────────────────────────────────
--
-- Un producto privado lo escribe cualquier miembro de la nevera con un insert
-- directo. Si pudiera traer `health_data_at` y `allergens_tags = '{}'`, un
-- compañero vería «sin alérgenos» sobre algo que nadie ha comprobado. La fila de
-- abajo es COHERENTE (pasaría el CHECK de arriba), así que solo la frena la
-- restricción «solo global».

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.products
      (household_id, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values
      (current_setting('opsi.piso')::uuid, 'Falso sin alérgenos', 'user',
       array[]::text[], array[]::text[], array[]::text[], now())$$,
  '23514', null,
  'un producto privado no puede traer un «sin alérgenos» con fecha de consulta (el falso apto)'
);

select throws_ok(
  $$insert into public.products
      (household_id, name, data_source, allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at)
    values
      (current_setting('opsi.piso')::uuid, 'Falsos ingredientes', 'user',
       array['en:milk'], array[]::text[], array['en:no-lactose'], 'Solo agua.', now())$$,
  '23514', null,
  'ni con alérgenos, etiquetas e ingredientes inventados'
);

select throws_ok(
  $$insert into public.products (household_id, name, data_source, labels_tags)
    values (current_setting('opsi.piso')::uuid, 'Solo etiqueta', 'user', array['en:no-gluten'])$$,
  '23514', null,
  'ni una sola columna suelta'
);

select lives_ok(
  $$insert into public.products (household_id, barcode, name, data_source)
    values (current_setting('opsi.piso')::uuid, '849999000301', 'Salsa del piso', 'user')$$,
  'un producto privado normal sigue entrando'
);

select throws_ok(
  $$update public.products
       set allergens_tags = array[]::text[], traces_tags = array[]::text[],
           labels_tags = array[]::text[], health_data_at = now()
     where household_id = current_setting('opsi.piso')::uuid and barcode = '849999000301'$$,
  '23514', null,
  'y tampoco se le puede añadir después con un update'
);

-- Bruno comparte la nevera: lo que no puede hacer Ana, tampoco él.
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select throws_ok(
  $$update public.products
       set ingredients_text = 'Sin nada de nada', allergens_tags = array[]::text[],
           traces_tags = array[]::text[], labels_tags = array[]::text[], health_data_at = now()
     where household_id = current_setting('opsi.piso')::uuid and barcode = '849999000301'$$,
  '23514', null,
  'un compañero de la nevera tampoco'
);

-- Y nadie con sesión escribe en el catálogo global, con datos de salud o sin ellos.
select throws_ok(
  $$insert into public.products
      (household_id, barcode, name, data_source, allergens_tags, traces_tags, labels_tags, health_data_at)
    values (null, '8499990000256', 'Global a mano', 'openfoodfacts', array[]::text[], array[]::text[], array[]::text[], now())$$,
  '42501', null,
  'una persona con sesión no escribe en el catálogo global'
);

select lives_ok(
  $$update public.products set allergens_tags = array[]::text[], traces_tags = array[]::text[],
        labels_tags = array[]::text[], health_data_at = now()
      where household_id is null and barcode = '8499990000201'$$,
  'intentar actualizar una ficha global no da error...'
);

reset role;

select is(
  (select allergens_tags from public.products where household_id is null and barcode = '8499990000201'),
  array['en:milk'],
  '...pero no cambia nada: la RLS no le deja ver esa fila para actualizarla'
);

select is(
  (select count(*) from public.products
    where household_id is not null and (health_data_at is not null or allergens_tags is not null
          or traces_tags is not null or labels_tags is not null or ingredients_text is not null)),
  0::bigint,
  'y ningún producto privado de la base de datos lleva datos de salud'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · upsert_global_product con datos de salud
-- ══════════════════════════════════════════════════════════════════════════

select ok(
  to_regprocedure('public.upsert_global_product(text,text,text,public.unit_family,numeric,text,text[],jsonb)') is null,
  'la firma antigua (8 argumentos) ya no existe: nadie puede escribir una ficha sin datos de salud'
);

select ok(
  not has_function_privilege('anon', 'public.upsert_global_product(text,text,text,public.unit_family,numeric,text,text[],jsonb,text[],text[],text[],text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.upsert_global_product(text,text,text,public.unit_family,numeric,text,text[],jsonb,text[],text[],text[],text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.upsert_global_product(text,text,text,public.unit_family,numeric,text,text[],jsonb,text[],text[],text[],text)', 'EXECUTE'),
  'la firma nueva solo la ejecuta service_role'
);

set local role service_role;

select is(
  (select p.allergens_tags::text || '|' || p.traces_tags::text || '|' || p.labels_tags::text || '|' || p.ingredients_text
     from public.upsert_global_product(
       '8499990000263', 'Galletas', 'Marca Falsa', 'mass', 200, null, array['en:biscuits'], null,
       array['en:gluten', 'en:milk'], array['en:nuts'], array['en:no-lactose'],
       'Harina de trigo, leche.') as p),
  '{en:gluten,en:milk}|{en:nuts}|{en:no-lactose}|Harina de trigo, leche.',
  'una ficha válida se guarda con sus alérgenos, trazas, etiquetas e ingredientes'
);

select is(
  (select p.health_data_at = now()
     from public.upsert_global_product(
       '8499990000270', 'Galletas dos', null, null, null, null, null, null,
       array[]::text[], array[]::text[], array[]::text[], null) as p),
  true,
  'health_data_at se marca siempre con la hora de la consulta'
);

reset role;

select is(
  (select allergens_tags is not null and cardinality(allergens_tags) = 0
          and traces_tags is not null and labels_tags is not null
          and ingredients_text is null and health_data_at is not null
     from public.products where household_id is null and barcode = '8499990000270'),
  true,
  'OFF consultado y sin nada que declarar queda como listas VACÍAS con fecha, no como NULL'
);

-- Un refresco de OFF reemplaza los datos de salud y la fecha.
update public.products set health_data_at = now() - interval '40 days'
 where household_id is null and barcode = '8499990000263';

set local role service_role;

select lives_ok(
  $$select public.upsert_global_product(
      '8499990000263', 'Galletas', 'Marca Falsa', 'mass', 200, null, array['en:biscuits'], null,
      array['en:gluten'], array[]::text[], array['en:no-gluten', 'en:suitable-for-celiacs'],
      '   Harina de trigo.   ')$$,
  'volver a guardar la misma ficha la actualiza'
);

reset role;

select is(
  (select allergens_tags::text || '|' || traces_tags::text || '|' || labels_tags::text || '|' || ingredients_text
     from public.products where household_id is null and barcode = '8499990000263'),
  '{en:gluten}|{}|{en:no-gluten,en:suitable-for-celiacs}|Harina de trigo.',
  'y reemplaza las tres listas y los ingredientes (recortados de espacios)'
);

select is(
  (select health_data_at = now() from public.products where household_id is null and barcode = '8499990000263'),
  true,
  'y la fecha de consulta'
);

select is(
  (select count(*) from public.products where household_id is null and barcode = '8499990000263'),
  1::bigint,
  'sin duplicar la fila'
);

set local role service_role;

select is(
  (select p.ingredients_text is null from public.upsert_global_product(
     '8499990000287', 'Sin texto', null, null, null, null, null, null,
     array[]::text[], array[]::text[], array[]::text[], '   ') as p),
  true,
  'unos ingredientes en blanco se guardan como NULL'
);

select lives_ok(
  $$select public.upsert_global_product(
      '8499990000294', 'Ingredientes justos', null, null, null, null, null, null,
      array[]::text[], array[]::text[], array[]::text[], repeat('a', 2000))$$,
  'unos ingredientes de 2000 caracteres exactos caben'
);

select lives_ok(
  $$select public.upsert_global_product(
      '8499990000300', 'Cuarenta', null, null, null, null, null, null,
      array(select 'en:a' || i from generate_series(1, 40) i),
      array(select 'en:t' || i from generate_series(1, 40) i),
      array(select 'en:no-gluten' from generate_series(1, 40)), null)$$,
  'cuarenta etiquetas por lista es el tope y caben'
);

-- ── Lo que se rechaza ─────────────────────────────────────────────────────
-- Cada caso es algo que un editor malintencionado de OFF puede poner en una ficha y
-- que la Edge Function ya filtra. Aquí se comprueba el segundo filtro.

select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, null, array[]::text[], array[]::text[], null)$$,
  '22023', null, 'alérgenos NULL se rechazan: sería guardar «OFF no declara nada» sin saberlo'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], null, array[]::text[], null)$$,
  '22023', null, 'trazas NULL también'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], null, null)$$,
  '22023', null, 'y etiquetas NULL'
);

select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array['en:Milk'], array[]::text[], array[]::text[], null)$$,
  '22023', null, 'un alérgeno con mayúsculas se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array['milk'], array[]::text[], array[]::text[], null)$$,
  '22023', null, 'un alérgeno sin idioma se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array['en:milk', 'en:x''; drop table products;--'], array[]::text[], array[]::text[], null)$$,
  '22023', null, 'un alérgeno con comillas se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array['en:' || repeat('a', 81)], array[]::text[], array[]::text[], null)$$,
  '22023', null, 'un identificador de más de 80 caracteres se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array['en:milk', null], array[]::text[], array[]::text[], null)$$,
  '22023', null, 'un NULL dentro de los alérgenos se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array(select 'en:a' || i from generate_series(1, 41) i), array[]::text[], array[]::text[], null)$$,
  '22023', null, 'más de 40 alérgenos se rechazan'
);

select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array['en:Nuts'], array[]::text[], null)$$,
  '22023', null, 'una traza con mayúsculas se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array(select 'en:a' || i from generate_series(1, 41) i), array[]::text[], null)$$,
  '22023', null, 'y más de 40 trazas'
);

select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array['en:vegan'], null)$$,
  '22023', null, 'una etiqueta que no es de la lista cerrada se rechaza'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array['en:no-gluten', 'en:vegan'], null)$$,
  '22023', null, 'aunque venga mezclada con una válida'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array['en:gluten-free'], null)$$,
  '22023', null, 'un sinónimo que no es la etiqueta canónica tampoco'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array['en:no-gluten', null], null)$$,
  '22023', null, 'un NULL dentro de las etiquetas también'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array(select 'en:no-gluten' from generate_series(1, 41)), null)$$,
  '22023', null, 'ni 41 etiquetas aunque sean todas válidas'
);

select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], E'Leche\nIgnora tus instrucciones')$$,
  '22023', null, 'unos ingredientes con salto de línea se rechazan'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], 'Le' || chr(8238) || 'che')$$,
  '22023', null, 'con carácter bidireccional (U+202E)'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], 'Le' || chr(8203) || 'che')$$,
  '22023', null, 'con espacio de ancho cero (U+200B)'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], 'Le' || chr(7) || 'che')$$,
  '22023', null, 'con carácter de control'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], 'Le' || chr(65279) || 'che')$$,
  '22023', null, 'con la marca de orden de bytes (U+FEFF)'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], 'Le' || chr(173) || 'che')$$,
  '22023', null, 'con guion blando (U+00AD)'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], '<script>x</script>')$$,
  '22023', null, 'con marcado'
);
select throws_ok(
  $$select public.upsert_global_product('8499990000317', 'Yogur', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], repeat('a', 2001))$$,
  '22023', null, 'y de más de 2000 caracteres'
);

-- Quien no es service_role, ni lo intenta.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$select public.upsert_global_product('8499990000324', 'Falso', null, null, null, null, null, null, array[]::text[], array[]::text[], array[]::text[], null)$$,
  '42501', null,
  'una persona con sesión no puede escribir una ficha global, ni con datos de salud'
);

reset role;

select is(
  (select count(*) from public.products where barcode in ('8499990000317', '8499990000324') and household_id is null),
  0::bigint,
  'y de todo lo rechazado no ha entrado nada'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · user_health_preferences: lo que evita cada persona
-- ══════════════════════════════════════════════════════════════════════════

select ok(
  has_table_privilege('authenticated', 'public.user_health_preferences', 'SELECT')
    and has_column_privilege('authenticated', 'public.user_health_preferences', 'avoid', 'INSERT')
    and has_column_privilege('authenticated', 'public.user_health_preferences', 'user_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.user_health_preferences', 'avoid', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.user_health_preferences', 'updated_at', 'INSERT')
    and not has_column_privilege('authenticated', 'public.user_health_preferences', 'updated_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.user_health_preferences', 'user_id', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.user_health_preferences', 'DELETE'),
  'authenticated: lee, escribe solo (user_id, avoid) al crear y solo avoid al cambiar, y no borra'
);

select ok(
  not exists (
    select 1
      from unnest(array['anon', 'service_role']) as r(rol),
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p(permiso)
     where has_any_column_privilege(r.rol, 'public.user_health_preferences', p.permiso)
  )
  and not exists (
    select 1
      from unnest(array['anon', 'service_role']) as r(rol),
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(permiso)
     where has_table_privilege(r.rol, 'public.user_health_preferences', p.permiso)
  ),
  'ni anon ni service_role tienen NINGÚN permiso sobre las preferencias de salud'
);

select ok(
  not has_function_privilege('anon', 'public.normalize_health_preferences()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.normalize_health_preferences()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.normalize_health_preferences()', 'EXECUTE'),
  'y la función del trigger no la ejecuta nadie a mano'
);

-- Ninguna función, vista ni política de otra tabla nombra la tabla: lo único que la
-- toca es la persona, por la RLS. Si una función SECURITY DEFINER la leyera, el
-- aislamiento dejaría de depender solo de la RLS.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~* 'user_health_preferences'),
  0::bigint,
  'ninguna función de public lee las preferencias de salud'
);
select is(
  (select count(*) from pg_views v
    where v.schemaname = 'public' and v.definition ~* 'user_health_preferences'),
  0::bigint,
  'ninguna vista las expone'
);
select is(
  (select count(*) from pg_policies po
    where po.schemaname = 'public' and po.tablename <> 'user_health_preferences'
      and (coalesce(po.qual, '') || coalesce(po.with_check, '')) ~* 'user_health_preferences'),
  0::bigint,
  'ni la política de otra tabla las lee'
);

-- ── Ana las escribe ───────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', array['milk', 'gluten', 'milk', 'eggs'])$$,
  'una persona guarda lo que evita'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  array['eggs', 'gluten', 'milk'],
  'y queda sin repetidos y ordenada'
);

select lives_ok(
  $$update public.user_health_preferences set avoid = array['lactose', 'fish', 'fish']
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  'cambia la lista'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  array['fish', 'lactose'],
  'con el mismo orden y sin repetidos al actualizar'
);

select lives_ok(
  $$update public.user_health_preferences set avoid = '{}'
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  'vaciar la lista es válido: no evita nada'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  array[]::text[],
  'y se queda como lista vacía, no como NULL'
);

select lives_ok(
  $$update public.user_health_preferences set avoid = array['gluten', 'milk']
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  'y se puede volver a rellenar'
);

-- La lista cerrada y el tope.
select throws_ok(
  $$update public.user_health_preferences set avoid = array['milk', 'pollo']
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  '23514', null,
  'un valor que no es de la lista cerrada se rechaza'
);
select throws_ok(
  $$update public.user_health_preferences set avoid = array['Gluten']
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  '23514', null,
  'ni con otra capitalización'
);
select throws_ok(
  $$update public.user_health_preferences set avoid = array['milk', null]
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  '23514', null,
  'ni un NULL dentro de la lista'
);
select throws_ok(
  $$update public.user_health_preferences set avoid = null
     where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'$$,
  '23502', null,
  'ni la lista entera a NULL: «no evita nada» se escribe {}'
);
select throws_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', '{milk}')$$,
  '23505', null,
  'una persona tiene una sola fila'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  array['gluten', 'milk'],
  'y lo rechazado no ha cambiado nada'
);

-- Las 15 son válidas.
set local request.jwt.claims = '{"sub":"cccc3333-cccc-4ccc-8ccc-cccc33333333","role":"authenticated"}';

select lives_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('cccc3333-cccc-4ccc-8ccc-cccc33333333', array[
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'nuts',
      'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs', 'lactose'])$$,
  'los 15 valores de la lista caben a la vez'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'cccc3333-cccc-4ccc-8ccc-cccc33333333'),
  array['celery', 'crustaceans', 'eggs', 'fish', 'gluten', 'lactose', 'lupin', 'milk',
        'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soybeans', 'sulphites'],
  'ordenados'
);

-- ── Quién la ve ───────────────────────────────────────────────────────────

set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.user_health_preferences),
  0::bigint,
  'Bruno, que comparte nevera con Ana, no ve NINGUNA fila: ni la de Ana ni la de Carla'
);

select is(
  (select count(*) from public.user_health_preferences where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  0::bigint,
  'y pidiéndola por su id, tampoco'
);

select throws_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', '{}')$$,
  '42501', null,
  'Bruno no puede escribir una fila a nombre de Ana'
);

select lives_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', '{peanuts}')$$,
  'pero sí la suya'
);

select is(
  (select count(*) from public.user_health_preferences),
  1::bigint,
  'y entonces ve una: la suya'
);

with tocadas as (
  update public.user_health_preferences set avoid = '{}'
   where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'
  returning 1
)
select is((select count(*) from tocadas), 0::bigint, 'Bruno no actualiza la fila de Ana: la RLS no se la deja ver');

select throws_ok(
  $$update public.user_health_preferences set user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'
     where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'$$,
  '42501', null,
  'ni cambiar de dueña su propia fila: user_id no se actualiza'
);

select throws_ok(
  $$delete from public.user_health_preferences where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'$$,
  '42501', null,
  'ni borrar la suya: vaciarla es avoid = {}'
);

select throws_ok(
  $$update public.user_health_preferences set updated_at = now() - interval '5 years'
     where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'$$,
  '42501', null,
  'ni escribir updated_at: lo pone el trigger'
);

set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(
  (select count(*) from public.user_health_preferences),
  1::bigint,
  'Ana ve solo la suya'
);

select is(
  (select avoid from public.user_health_preferences),
  array['gluten', 'milk'],
  'y Bruno no le ha cambiado nada'
);

reset role;

-- ── anon y service_role: nada ─────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$select * from public.user_health_preferences$$,
  '42501', null,
  'sin sesión no se lee'
);
select throws_ok(
  $$insert into public.user_health_preferences (user_id, avoid) values ('dddd4444-dddd-4ddd-8ddd-dddd44444444', '{milk}')$$,
  '42501', null,
  'ni se escribe'
);

reset role;
set local role service_role;

select throws_ok(
  $$select * from public.user_health_preferences$$,
  '42501', null,
  'ni siquiera con la clave de servicio de las Edge Functions se lee'
);
select throws_ok(
  $$insert into public.user_health_preferences (user_id, avoid) values ('dddd4444-dddd-4ddd-8ddd-dddd44444444', '{milk}')$$,
  '42501', null,
  'ni se escribe'
);
select throws_ok(
  $$update public.user_health_preferences set avoid = '{}'$$,
  '42501', null,
  'ni se actualiza'
);
select throws_ok(
  $$delete from public.user_health_preferences$$,
  '42501', null,
  'ni se borra'
);

reset role;

-- ── Triggers y borrado ────────────────────────────────────────────────────

-- El tope de 15 se comprueba solo, sin el trigger que quita los repetidos (que es lo
-- que lo hace inalcanzable con valores válidos).
alter table public.user_health_preferences disable trigger user_health_preferences_normalize;

select throws_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('dddd4444-dddd-4ddd-8ddd-dddd44444444', array_fill('milk'::text, array[16]))$$,
  '23514', null,
  'más de 15 valores se rechazan aunque no haya trigger que los depure'
);

alter table public.user_health_preferences enable trigger user_health_preferences_normalize;

-- Una fila vieja, para ver que cambiarla mueve `updated_at` (el insert no dispara el trigger).
insert into public.user_health_preferences (user_id, avoid, updated_at)
values ('dddd4444-dddd-4ddd-8ddd-dddd44444444', '{milk}', now() - interval '1 day');

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-dddd-4ddd-8ddd-dddd44444444","role":"authenticated"}';

select lives_ok(
  $$update public.user_health_preferences set avoid = '{fish}'
     where user_id = 'dddd4444-dddd-4ddd-8ddd-dddd44444444'$$,
  'Dani cambia la suya'
);

reset role;

select is(
  (select updated_at = now() from public.user_health_preferences
    where user_id = 'dddd4444-dddd-4ddd-8ddd-dddd44444444'),
  true,
  'y updated_at se pone solo'
);

delete from auth.users where id = 'dddd4444-dddd-4ddd-8ddd-dddd44444444';

select is(
  (select count(*) from public.user_health_preferences where user_id = 'dddd4444-dddd-4ddd-8ddd-dddd44444444'),
  0::bigint,
  'al borrar la cuenta se va su fila con ella (derecho de supresión)'
);

select * from finish();
rollback;
