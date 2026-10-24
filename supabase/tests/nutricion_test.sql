-- ═══════════════════════════════════════════════════════════════════════════
-- Nutrición de los productos (Opsi Premium ⭐)
--
-- `20261024100000_nutricion`. La nutrición de un producto del catálogo global vive en
-- `product_nutrition`, aparte de `products`, y el plan lo decide el SERVIDOR con dos
-- candados (D-49). Lo que se prueba aquí es lo que NO debe poder pasar:
--
--   A · Permisos: nadie escribe la tabla; `service_role` solo lee DOS columnas (la fecha
--       y el id) y ejecuta `upsert_product_nutrition`; `anon` no toca nada.
--   B · Los CHECK de la tabla, escribiendo como `postgres`: rangos, listas cerradas,
--       pares coherentes, ración y aditivos.
--   C · El trigger: ni un producto PRIVADO de una nevera ni uno que no existe, ni
--       siquiera escribiendo como `postgres` (un fallo de la función no puede dejar un
--       dato falso a la vista de las compañeras de una nevera).
--   D · `upsert_product_nutrition`: lo guarda, lo refresca y rechaza CADA rango, lista,
--       formato y par que se contradice (con 22023: el CHECK de la tabla da 23514, así
--       que si falta la comprobación de la función este test lo nota).
--   E · Premium: sin plan, `select` directo = 0 filas y la función = 42501 con pista
--       `premium`; con plan, lee; `anon` ni lee ni llama; el plan se mira en cada consulta.
--   F · Quien comparte nevera no escribe, y `products` no tiene columnas de nutrición.
--   G · «No consta» (sin fila) frente a «OFF no declara» (fila con todo NULL).
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Devuelve «SQLSTATE/hint» de lo que lance la sentencia, o «sin error». La app distingue
-- «esto es premium» por la pista, no por el texto: es el contrato, hay que probar el par.
create function public.zz_error_de(p_sql text)
returns text
language plpgsql
as $$
declare
  v_hint text;
begin
  execute p_sql;
  return 'sin error';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return sqlstate || '/' || coalesce(v_hint, '');
end;
$$;

grant execute on function public.zz_error_de(text) to authenticated, anon, service_role;

-- Una llamada VÁLIDA a `upsert_product_nutrition` en la que se cambia lo que se pida:
-- `zz_nut('{"fat": "101"}')`. Los números van como texto para poder probar 'NaN' e
-- 'Infinity', que JSON no admite; un null JSON es un NULL de SQL. Corre con el rol de
-- quien la llama (no es definer), así que se prueba el permiso real de `service_role`.
create function public.zz_nut(p_cambios jsonb default '{}')
returns void
language plpgsql
as $$
declare
  b jsonb := jsonb_build_object(
    'producto', current_setting('opsi.g1'),
    'grado', 'c', 'nova', '4', 'base', 'ml',
    'kcal', '64', 'grasas', '3.6', 'saturadas', '2.3', 'hidratos', '4.8',
    'azucares', '4.8', 'fibra', '0', 'proteinas', '3.3', 'sal', '0.1',
    'n_grasas', 'moderate', 'n_saturadas', 'moderate', 'n_azucares', 'low', 'n_sal', 'low',
    'racion', '250 ml',
    'aditivos', jsonb_build_array('en:e330', 'en:e150d')
  ) || p_cambios;
begin
  perform public.upsert_product_nutrition(
    nullif(b ->> 'producto', '')::uuid,
    b ->> 'grado',
    (b ->> 'nova')::integer,
    b ->> 'base',
    (b ->> 'kcal')::numeric,
    (b ->> 'grasas')::numeric,
    (b ->> 'saturadas')::numeric,
    (b ->> 'hidratos')::numeric,
    (b ->> 'azucares')::numeric,
    (b ->> 'fibra')::numeric,
    (b ->> 'proteinas')::numeric,
    (b ->> 'sal')::numeric,
    b ->> 'n_grasas',
    b ->> 'n_saturadas',
    b ->> 'n_azucares',
    b ->> 'n_sal',
    b ->> 'racion',
    case when jsonb_typeof(b -> 'aditivos') = 'array'
         then array(select jsonb_array_elements_text(b -> 'aditivos'))
    end
  );
end;
$$;

grant execute on function public.zz_nut(jsonb) to service_role, authenticated, anon;

-- ── Cuentas ───────────────────────────────────────────────────────────────
--
--   ana     premium; dueña de «Piso» y con su nevera privada
--   bruno   plan básico (el de por omisión); entra en «Piso»

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

update public.user_settings set plan = 'premium' where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select set_config('opsi.piso',
  (select h.id::text from public.create_shared_household('Piso', 'couch') h), true);

reset role;

insert into public.household_members (household_id, user_id, role)
values (current_setting('opsi.piso')::uuid, 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', 'member');

-- Tres productos del catálogo global y uno privado de la nevera compartida (que escriben
-- sus miembros). Códigos fuera de los seeds.
--   g1  tendrá nutrición completa
--   g2  nunca tendrá fila: «no consta»
--   g3  tendrá fila con todo NULL: «OFF no declara nada»
--   p   privado de «Piso»
insert into public.products (household_id, barcode, name, data_source)
values
  (null, '8499991000011', 'Con nutrición', 'openfoodfacts'),
  (null, '8499991000028', 'Sin fila', 'openfoodfacts'),
  (null, '8499991000035', 'Consultado y vacío', 'openfoodfacts');

insert into public.products (household_id, barcode, name, data_source)
values (current_setting('opsi.piso')::uuid, '8499991000042', 'Salsa del piso', 'user');

select set_config('opsi.g1', (select id::text from public.products where household_id is null and barcode = '8499991000011'), true);
select set_config('opsi.g2', (select id::text from public.products where household_id is null and barcode = '8499991000028'), true);
select set_config('opsi.g3', (select id::text from public.products where household_id is null and barcode = '8499991000035'), true);
select set_config('opsi.p',  (select id::text from public.products where barcode = '8499991000042'), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Permisos
-- ══════════════════════════════════════════════════════════════════════════

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.product_nutrition'::regclass),
  'product_nutrition tiene la RLS activa'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'product_nutrition'),
  1::bigint,
  'y una sola política'
);

select ok(
  (select cmd = 'SELECT' and 'authenticated' = any (roles)
     from pg_policies where schemaname = 'public' and tablename = 'product_nutrition'),
  'de lectura y para authenticated: no hay ninguna de escritura'
);

select ok(
  has_table_privilege('authenticated', 'public.product_nutrition', 'SELECT')
    and not has_any_column_privilege('authenticated', 'public.product_nutrition', 'INSERT')
    and not has_any_column_privilege('authenticated', 'public.product_nutrition', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.product_nutrition', 'DELETE')
    and not has_table_privilege('authenticated', 'public.product_nutrition', 'TRUNCATE')
    and not has_table_privilege('authenticated', 'public.product_nutrition', 'REFERENCES')
    and not has_table_privilege('authenticated', 'public.product_nutrition', 'TRIGGER'),
  'authenticated solo puede leer: ni insertar, ni actualizar (ni una columna), ni borrar, ni vaciar'
);

select ok(
  not exists (
    select 1
      from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(permiso)
     where has_table_privilege('anon', 'public.product_nutrition', p.permiso)
        or (p.permiso in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
            and has_any_column_privilege('anon', 'public.product_nutrition', p.permiso))
  ),
  'anon no tiene NINGÚN permiso sobre la tabla, ni de tabla ni de columna'
);

-- service_role salta la RLS: lo único que lo acota son sus permisos. Solo DOS columnas.
select ok(
  has_column_privilege('service_role', 'public.product_nutrition', 'product_id', 'SELECT')
    and has_column_privilege('service_role', 'public.product_nutrition', 'nutrition_data_at', 'SELECT')
    and not has_table_privilege('service_role', 'public.product_nutrition', 'SELECT'),
  'service_role puede leer product_id y nutrition_data_at, y no tiene SELECT de tabla'
);

select is(
  (select coalesce(array_agg(a.attname::text order by a.attname), array[]::text[])
     from pg_attribute a
    where a.attrelid = 'public.product_nutrition'::regclass and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('service_role', 'public.product_nutrition', a.attname, 'SELECT')),
  array['nutrition_data_at', 'product_id']::text[],
  'y NINGUNA otra: los valores nutricionales no los lee (ni las columnas que se añadan después)'
);

select ok(
  not exists (
    select 1
      from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(permiso)
     where has_table_privilege('service_role', 'public.product_nutrition', p.permiso)
        or (p.permiso in ('INSERT', 'UPDATE', 'REFERENCES')
            and has_any_column_privilege('service_role', 'public.product_nutrition', p.permiso))
  ),
  'service_role no escribe la tabla de ninguna manera: solo con upsert_product_nutrition'
);

select ok(
  has_function_privilege('service_role', 'public.upsert_product_nutrition(uuid,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,text,text[])', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.upsert_product_nutrition(uuid,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,text,text[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.upsert_product_nutrition(uuid,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,text,text[])', 'EXECUTE'),
  'upsert_product_nutrition solo la ejecuta service_role'
);

select ok(
  has_function_privilege('authenticated', 'public.nutrition_of_products(uuid[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.nutrition_of_products(uuid[])', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.nutrition_of_products(uuid[])', 'EXECUTE'),
  'nutrition_of_products la ejecuta authenticated y nadie más: ni anon ni service_role'
);

select ok(
  not has_function_privilege('anon', 'public.check_nutrition_product()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.check_nutrition_product()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.check_nutrition_product()', 'EXECUTE'),
  'y la función del trigger no la ejecuta nadie a mano'
);

select ok(
  (select not p.prosecdef from pg_proc p where p.oid = 'public.nutrition_of_products(uuid[])'::regprocedure),
  'nutrition_of_products es SECURITY INVOKER: la RLS de la tabla sigue siendo la segunda puerta'
);

select ok(
  (select p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%' from pg_proc p
    where p.oid = 'public.upsert_product_nutrition(uuid,text,integer,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,text,text[])'::regprocedure),
  'upsert_product_nutrition es SECURITY DEFINER con search_path vacío'
);

select is(
  (select count(*) from pg_trigger t
    where t.tgrelid = 'public.product_nutrition'::regclass and not t.tgisinternal
      and t.tgname = 'product_nutrition_check_product' and t.tgenabled = 'O'),
  1::bigint,
  'el trigger del producto global existe y está activo'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Los CHECK de la tabla (escribiendo como postgres: es el último cerrojo)
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at)
    values (current_setting('opsi.g2')::uuid, now())$$,
  'una fila con TODO a NULL es válida: «OFF se consultó y no declara nada»'
);

delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

select throws_ok(
  $$insert into public.product_nutrition (product_id) values (current_setting('opsi.g2')::uuid)$$,
  '23502', null,
  'sin fecha de consulta no hay fila: la fecha es obligatoria'
);

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, nutriscore_grade) values (current_setting('opsi.g2')::uuid, now(), 'f')$$,
  '23514', null, 'un Nutri-Score que no es de la a a la e se rechaza');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, nutriscore_grade) values (current_setting('opsi.g2')::uuid, now(), 'A')$$,
  '23514', null, 'ni con mayúscula');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, nutriscore_grade) values (current_setting('opsi.g2')::uuid, now(), 'unknown')$$,
  '23514', null, 'ni «unknown»: eso es NULL');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, nova_group) values (current_setting('opsi.g2')::uuid, now(), 0)$$,
  '23514', null, 'NOVA 0 se rechaza');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, nova_group) values (current_setting('opsi.g2')::uuid, now(), 5)$$,
  '23514', null, 'NOVA 5 también');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, basis) values (current_setting('opsi.g2')::uuid, now(), 'kg')$$,
  '23514', null, 'una base que no es g ni ml se rechaza');

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal) values (current_setting('opsi.g2')::uuid, now(), 951)$$,
  '23514', null, 'más de 950 kcal se rechaza');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal) values (current_setting('opsi.g2')::uuid, now(), -1)$$,
  '23514', null, 'una energía negativa también');
select lives_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal) values (current_setting('opsi.g2')::uuid, now(), 950)$$,
  '950 kcal exactas caben');
delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, fat) values (current_setting('opsi.g2')::uuid, now(), 100.01)$$,
  '23514', null, 'más de 100 g de grasa por 100 g se rechazan');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, salt) values (current_setting('opsi.g2')::uuid, now(), -0.01)$$,
  '23514', null, 'una sal negativa también');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, proteins) values (current_setting('opsi.g2')::uuid, now(), 'NaN')$$,
  '23514', null, 'un NaN no pasa: en numeric es mayor que todo');
select ok(
  public.zz_error_de($$insert into public.product_nutrition (product_id, nutrition_data_at, fiber) values (current_setting('opsi.g2')::uuid, now(), 'Infinity')$$)
    in ('23514/', '22003/'),
  'ni un Infinity (el CHECK o la propia columna lo rechazan)'
);
select lives_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, fat, saturated_fat, carbohydrates, sugars, fiber, proteins, salt)
  values (current_setting('opsi.g2')::uuid, now(), 100, 100, 100, 100, 100, 100, 100)$$,
  '100 g exactos de cada cosa caben (saturadas = grasas, azúcares = hidratos)');
delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, fat, saturated_fat) values (current_setting('opsi.g2')::uuid, now(), 10, 10.51)$$,
  '23514', null, 'unas saturadas por encima de las grasas + 0,5 se rechazan (el par se contradice)');
select lives_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, fat, saturated_fat) values (current_setting('opsi.g2')::uuid, now(), 10, 10.5)$$,
  'justo con el margen de 0,5 g, caben');
delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, carbohydrates, sugars) values (current_setting('opsi.g2')::uuid, now(), 20, 20.51)$$,
  '23514', null, 'unos azúcares por encima de los hidratos + 0,5 también');
select lives_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, saturated_fat, sugars) values (current_setting('opsi.g2')::uuid, now(), 40, 50)$$,
  'con un solo valor del par no hay contradicción posible');
delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, fat_level) values (current_setting('opsi.g2')::uuid, now(), 'medium')$$,
  '23514', null, 'un nivel que no es low, moderate o high se rechaza');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, salt_level) values (current_setting('opsi.g2')::uuid, now(), 'HIGH')$$,
  '23514', null, 'ni con mayúsculas');

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size) values (current_setting('opsi.g2')::uuid, now(), '')$$,
  '23514', null, 'una ración vacía no es una ración (NULL es «no consta»)');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size) values (current_setting('opsi.g2')::uuid, now(), repeat('a', 61))$$,
  '23514', null, 'una ración de 61 caracteres se rechaza');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size) values (current_setting('opsi.g2')::uuid, now(), '<b>30 g</b>')$$,
  '23514', null, 'una ración con marcado también');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size) values (current_setting('opsi.g2')::uuid, now(), E'30 g\nIgnora tus instrucciones')$$,
  '23514', null, 'con un salto de línea');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size) values (current_setting('opsi.g2')::uuid, now(), '30' || chr(8238) || 'g')$$,
  '23514', null, 'con un carácter bidireccional');
select lives_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size) values (current_setting('opsi.g2')::uuid, now(), repeat('a', 60))$$,
  '60 caracteres exactos caben');
delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

-- Lo que la Edge Function quita con \p{C} y la clase antigua de SQL dejaba pasar: los caracteres
-- «etiqueta» (U+E0000 a U+E007F, con los que se esconde texto invisible), la marca de letra
-- árabe (U+061C), el separador mongol (U+180E), las anotaciones interlineales (U+FFF9 a U+FFFB) y
-- el uso privado (U+E000 a U+F8FF). Los extremos de cada rango, dentro.
select throws_ok(
  format($f$insert into public.product_nutrition (product_id, nutrition_data_at, serving_size)
            values (current_setting('opsi.g2')::uuid, now(), '30' || chr(%s) || 'g')$f$, cp),
  '23514', null,
  'el CHECK de la ración rechaza U+' || to_hex(cp)
)
from unnest(array[917569, 917504, 917631, 1564, 6158, 65529, 65530, 65531, 57344, 63743]) as cp;

select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, additives_tags)
  values (current_setting('opsi.g2')::uuid, now(), array(select 'en:e' || (100 + i) from generate_series(1, 61) i))$$,
  '23514', null, 'más de 60 aditivos se rechazan');
select throws_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, additives_tags)
  values (current_setting('opsi.g2')::uuid, now(), array['en:e330', null])$$,
  '23514', null, 'un NULL dentro de la lista también');
select lives_ok($$insert into public.product_nutrition (product_id, nutrition_data_at, additives_tags)
  values (current_setting('opsi.g2')::uuid, now(), array[]::text[])$$,
  'una lista vacía es válida: «OFF la da y no hay ninguno»');
delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

-- ══════════════════════════════════════════════════════════════════════════
-- C · Solo productos del catálogo global: ni uno privado, ni uno que no existe
-- ══════════════════════════════════════════════════════════════════════════
--
-- Un producto privado lo escribe cualquier miembro de su nevera. Con nutrición ahí, un
-- compañero vería «0 g de azúcar» en algo que nadie ha comprobado. Se prueba escribiendo
-- como `postgres`, que se salta los permisos: lo único que lo frena es el trigger.

select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at) values (current_setting('opsi.p')::uuid, now())$$,
  '23514', null,
  'postgres no puede dejar nutrición en un producto PRIVADO de una nevera (trigger)'
);

select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal, sugars)
    values (current_setting('opsi.p')::uuid, now(), 0, 0)$$,
  '23514', null,
  'ni el falso «0 g de azúcar»'
);

select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at) values (gen_random_uuid(), now())$$,
  '23514', null,
  'ni en un producto que no existe'
);

insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal)
values (current_setting('opsi.g3')::uuid, now(), 10);

select throws_ok(
  $$update public.product_nutrition set product_id = current_setting('opsi.p')::uuid
     where product_id = current_setting('opsi.g3')::uuid$$,
  '23514', null,
  'ni se puede MOVER una fila de nutrición a un producto privado con un update'
);

select throws_ok(
  $$update public.product_nutrition set product_id = gen_random_uuid()
     where product_id = current_setting('opsi.g3')::uuid$$,
  '23514', null,
  'ni a un producto que no existe'
);

select lives_ok(
  $$update public.product_nutrition set energy_kcal = 11 where product_id = current_setting('opsi.g3')::uuid$$,
  'pero cambiar un valor de una fila del catálogo global sí'
);

delete from public.product_nutrition where product_id = current_setting('opsi.g3')::uuid;

select is(
  (select count(*) from public.product_nutrition n join public.products pr on pr.id = n.product_id
    where pr.household_id is not null),
  0::bigint,
  'y ningún producto privado de la base de datos lleva nutrición'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · upsert_product_nutrition: la única vía de escritura
-- ══════════════════════════════════════════════════════════════════════════

set local role service_role;

select lives_ok(
  $$select public.upsert_product_nutrition(
      current_setting('opsi.g1')::uuid, 'c', 4, 'ml',
      64, 3.6, 2.3, 4.8, 4.8, 0, 3.3, 0.1,
      'moderate', 'moderate', 'low', 'low', '  250 ml  ', array['en:e330', 'en:e150d'])$$,
  'service_role guarda una ficha válida'
);

reset role;

select is(
  (select concat_ws('|', nutriscore_grade, nova_group, basis, energy_kcal, fat, saturated_fat,
                    carbohydrates, sugars, fiber, proteins, salt, fat_level, saturated_fat_level,
                    sugars_level, salt_level, serving_size, additives_tags::text)
     from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  'c|4|ml|64.00|3.60|2.30|4.80|4.80|0.00|3.30|0.10|moderate|moderate|low|low|250 ml|{en:e330,en:e150d}',
  'con todos sus valores, la ración recortada de espacios y los aditivos'
);

select is(
  (select nutrition_data_at = now() from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  true,
  'nutrition_data_at lo pone el servidor: now()'
);

-- Un refresco de OFF reemplaza la fila entera y la fecha.
update public.product_nutrition set nutrition_data_at = now() - interval '40 days'
 where product_id = current_setting('opsi.g1')::uuid;

set local role service_role;

select lives_ok(
  $$select public.zz_nut('{"grado": "e", "nova": "1", "base": "g", "kcal": "10", "racion": null, "aditivos": []}')$$,
  'volver a guardar el mismo producto lo actualiza'
);

reset role;

select is(
  (select concat_ws('|', nutriscore_grade, nova_group, basis, energy_kcal, coalesce(serving_size, '-'), additives_tags::text)
     from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  'e|1|g|10.00|-|{}',
  'y reemplaza los valores (también los que pasan a NULL y a lista vacía)'
);

select is(
  (select nutrition_data_at = now() from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  true,
  'y la fecha de consulta'
);

select is(
  (select count(*) from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  1::bigint,
  'sin duplicar la fila'
);

set local role service_role;

select lives_ok(
  $$select public.zz_nut('{"grasas": "3.456", "saturadas": "1.234"}')$$,
  'dos decimales de más no son un error...'
);

reset role;

select is(
  (select fat || '|' || saturated_fat from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  '3.46|1.23',
  '...se redondean a dos'
);

-- «OFF se consultó y no declara nada»: todo NULL, y es una fila de verdad.
set local role service_role;

select lives_ok(
  $$select public.upsert_product_nutrition(
      current_setting('opsi.g3')::uuid, null, null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null)$$,
  'todo a NULL se guarda: es la marca de «se consultó» (para no renovar la ficha en cada escaneo)'
);

select lives_ok(
  $$select public.zz_nut(jsonb_build_object('producto', current_setting('opsi.g2'), 'grado', 'a', 'nova', '2',
      'base', null, 'aditivos', null))$$,
  'un Nutri-Score a, un NOVA 2, sin base y sin lista de aditivos'
);

-- NULL y {} NO son lo mismo en los aditivos: la Edge Function guarda NULL si OFF no da la
-- lista o la da vacía de una ficha sin ingredientes (no se sabe), y {} solo si la lista viene
-- vacía CON ingredientes. La base de datos guarda lo que llega y no los confunde.
reset role;

select is(
  (select additives_tags is null from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid),
  true,
  'una lista de aditivos NULL se guarda como NULL: «no se sabe»'
);

set local role service_role;

select lives_ok(
  $$select public.zz_nut(jsonb_build_object('producto', current_setting('opsi.g2'), 'aditivos', '[]'::jsonb))$$,
  'y una lista vacía...'
);

reset role;

select is(
  (select additives_tags is not null and cardinality(additives_tags) = 0
     from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid),
  true,
  '...se guarda como {}, que NO es NULL: «OFF los analizó y no declara ninguno»'
);

set local role service_role;

select lives_ok(
  $$select public.zz_nut(jsonb_build_object('producto', current_setting('opsi.g2'), 'grado', 'e', 'nova', '4', 'base', 'g',
      'kcal', '950', 'grasas', '100', 'saturadas', '100', 'hidratos', '100', 'azucares', '100', 'fibra', '100',
      'proteinas', '100', 'sal', '100', 'racion', repeat('a', 60),
      'aditivos', (select jsonb_agg('en:e' || (100 + i)) from generate_series(1, 60) i)))$$,
  'los máximos de todo caben: 950 kcal, 100 g, ración de 60 y 60 aditivos'
);

select lives_ok($$select public.zz_nut('{"racion": "   "}')$$, 'una ración en blanco...');

reset role;

select is(
  (select serving_size is null from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  true,
  '...se guarda como NULL, no como cadena vacía'
);

set local role service_role;

select lives_ok($$select public.zz_nut('{"aditivos": ["en:e150d", "en:e1442", "en:e160a", "en:e471"]}')$$,
  'aditivos con una letra, con cuatro cifras y con tres: caben');
select lives_ok($$select public.zz_nut('{"aditivos": ["en:e331iii", "en:e160aii", "en:e450vii"]}')$$,
  'las subformas en cifras romanas (tres letras) de OFF caben');
select lives_ok($$select public.zz_nut('{"aditivos": ["en:e1000abcd"]}')$$,
  'y cuatro letras es el tope y cabe');
select lives_ok($$select public.zz_nut('{"saturadas": "2.8", "grasas": "2.3"}')$$, 'el margen de 0,5 g entre saturadas y grasas: justo, cabe');
select lives_ok($$select public.zz_nut('{"azucares": "5.3", "hidratos": "4.8"}')$$, 'y entre azúcares e hidratos');

reset role;

select is(
  (select count(*) from public.product_nutrition n
    where n.product_id = current_setting('opsi.g3')::uuid
      and n.nutrition_data_at is not null and n.nutriscore_grade is null and n.nova_group is null
      and n.basis is null and n.energy_kcal is null and n.fat is null and n.saturated_fat is null
      and n.carbohydrates is null and n.sugars is null and n.fiber is null and n.proteins is null
      and n.salt is null and n.fat_level is null and n.saturated_fat_level is null
      and n.sugars_level is null and n.salt_level is null and n.serving_size is null
      and n.additives_tags is null),
  1::bigint,
  'la fila de «OFF no declara nada» es toda NULL salvo la fecha: ningún NULL se convirtió en cero'
);

-- ── Lo que se rechaza ─────────────────────────────────────────────────────
-- Cada caso es algo que un editor malintencionado de OFF puede poner y que la Edge
-- Function ya filtra. Aquí se comprueba el segundo filtro. Es 22023 (el de la función) y
-- no 23514 (el de la tabla): si falta la comprobación de la función, esto lo nota.

set local role service_role;

select throws_ok($$select public.zz_nut('{"producto": null}')$$, '22023', null, 'sin producto se rechaza');
select throws_ok($$select public.zz_nut('{"producto": "00000000-0000-4000-8000-000000000000"}')$$, '22023', null, 'un producto que no existe se rechaza');
select throws_ok($$select public.zz_nut(jsonb_build_object('producto', current_setting('opsi.p')))$$, '22023', null,
  'un producto PRIVADO de una nevera se rechaza (22023: lo dice la función antes que el trigger)');

select throws_ok($$select public.zz_nut('{"grado": "f"}')$$, '22023', null, 'un Nutri-Score fuera de la a a la e');
select throws_ok($$select public.zz_nut('{"grado": "A"}')$$, '22023', null, 'con mayúscula');
select throws_ok($$select public.zz_nut('{"grado": "unknown"}')$$, '22023', null, 'o «unknown»');
select throws_ok($$select public.zz_nut('{"grado": "not-applicable"}')$$, '22023', null, 'o «not-applicable»');
select throws_ok($$select public.zz_nut('{"nova": "0"}')$$, '22023', null, 'NOVA 0');
select throws_ok($$select public.zz_nut('{"nova": "5"}')$$, '22023', null, 'NOVA 5');
select throws_ok($$select public.zz_nut('{"base": "kg"}')$$, '22023', null, 'una base que no es g ni ml');
select throws_ok($$select public.zz_nut('{"base": "G"}')$$, '22023', null, 'con mayúscula');

select throws_ok($$select public.zz_nut('{"kcal": "950.01"}')$$, '22023', null, 'una energía de 950,01 kcal');
select throws_ok($$select public.zz_nut('{"kcal": "951"}')$$, '22023', null, 'o de 951');
select throws_ok($$select public.zz_nut('{"kcal": "-0.01"}')$$, '22023', null, 'o negativa');
select throws_ok($$select public.zz_nut('{"kcal": "NaN"}')$$, '22023', null, 'o un NaN');
select throws_ok($$select public.zz_nut('{"kcal": "Infinity"}')$$, '22023', null, 'o un Infinity');
select throws_ok($$select public.zz_nut('{"kcal": "-Infinity"}')$$, '22023', null, 'o un -Infinity');

select throws_ok($$select public.zz_nut('{"grasas": "100.01", "saturadas": "1"}')$$, '22023', null, 'grasas por encima de 100');
select throws_ok($$select public.zz_nut('{"grasas": "-1", "saturadas": null}')$$, '22023', null, 'grasas negativas');
select throws_ok($$select public.zz_nut('{"saturadas": "100.01", "grasas": "100"}')$$, '22023', null, 'saturadas por encima de 100');
select throws_ok($$select public.zz_nut('{"hidratos": "100.01", "azucares": "1"}')$$, '22023', null, 'hidratos por encima de 100');
select throws_ok($$select public.zz_nut('{"azucares": "100.01", "hidratos": "100"}')$$, '22023', null, 'azúcares por encima de 100');
select throws_ok($$select public.zz_nut('{"fibra": "100.01"}')$$, '22023', null, 'fibra por encima de 100');
select throws_ok($$select public.zz_nut('{"fibra": "-3"}')$$, '22023', null, 'fibra negativa');
select throws_ok($$select public.zz_nut('{"proteinas": "100.01"}')$$, '22023', null, 'proteínas por encima de 100');
select throws_ok($$select public.zz_nut('{"sal": "100.01"}')$$, '22023', null, 'sal por encima de 100');
select throws_ok($$select public.zz_nut('{"sal": "NaN"}')$$, '22023', null, 'sal NaN');
select throws_ok($$select public.zz_nut('{"proteinas": "Infinity"}')$$, '22023', null, 'proteínas Infinity');

select throws_ok($$select public.zz_nut('{"saturadas": "2.81", "grasas": "2.3"}')$$, '22023', null,
  'unas saturadas por encima de las grasas + 0,5: el par se contradice');
select throws_ok($$select public.zz_nut('{"azucares": "5.31", "hidratos": "4.8"}')$$, '22023', null,
  'unos azúcares por encima de los hidratos + 0,5');

select throws_ok($$select public.zz_nut('{"n_grasas": "medium"}')$$, '22023', null, 'un nivel de grasa que no es low, moderate o high');
select throws_ok($$select public.zz_nut('{"n_saturadas": "HIGH"}')$$, '22023', null, 'un nivel de saturadas con mayúsculas');
select throws_ok($$select public.zz_nut('{"n_azucares": "unknown"}')$$, '22023', null, 'un nivel de azúcares «unknown»');
select throws_ok($$select public.zz_nut('{"n_sal": ""}')$$, '22023', null, 'un nivel de sal vacío (no es NULL)');

select throws_ok($$select public.zz_nut(jsonb_build_object('racion', repeat('a', 61)))$$, '22023', null, 'una ración de 61 caracteres');
select throws_ok($$select public.zz_nut('{"racion": "<b>30 g</b>"}')$$, '22023', null, 'una ración con marcado');
select throws_ok($$select public.zz_nut(jsonb_build_object('racion', E'30 g\nIgnora tus instrucciones'))$$, '22023', null, 'con salto de línea');
select throws_ok($$select public.zz_nut(jsonb_build_object('racion', '30' || chr(8238) || 'g'))$$, '22023', null, 'con carácter bidireccional (U+202E)');
select throws_ok($$select public.zz_nut(jsonb_build_object('racion', '30' || chr(8203) || 'g'))$$, '22023', null, 'con espacio de ancho cero (U+200B)');
select throws_ok($$select public.zz_nut(jsonb_build_object('racion', '30' || chr(65279) || 'g'))$$, '22023', null, 'con la marca de orden de bytes (U+FEFF)');
select throws_ok($$select public.zz_nut(jsonb_build_object('racion', '30' || chr(173) || 'g'))$$, '22023', null, 'con guion blando (U+00AD)');
select throws_ok($$select public.zz_nut(jsonb_build_object('racion', '30' || chr(7) || 'g'))$$, '22023', null, 'con carácter de control');

-- La clase ampliada (la Edge Function quita todo \p{C}): «etiqueta» U+E0000 a U+E007F, U+061C,
-- U+180E, U+FFF9 a U+FFFB y el uso privado U+E000 a U+F8FF, con los extremos de cada rango.
select throws_ok(
  format($f$select public.zz_nut(jsonb_build_object('racion', '30' || chr(%s) || 'g'))$f$, cp),
  '22023', null,
  'la función rechaza U+' || to_hex(cp) || ' en la ración'
)
from unnest(array[917569, 917504, 917631, 1564, 6158, 65529, 65530, 65531, 57344, 63743]) as cp;

-- Y no se pasa de largo: lo que queda JUSTO fuera de cada rango, y las letras con acento y los
-- emojis, siguen cabiendo.
select lives_ok(
  format($f$select public.zz_nut(jsonb_build_object('racion', '30' || chr(%s) || 'g'))$f$, cp),
  'y U+' || to_hex(cp) || ' sí cabe'
)
from unnest(array[63744, 917632, 65532, 65528, 1565, 6157, 241, 128512]) as cp;

select throws_ok($$select public.zz_nut('{"aditivos": ["en:E330"]}')$$, '22023', null, 'un aditivo con mayúscula');
select throws_ok($$select public.zz_nut('{"aditivos": ["en:e33"]}')$$, '22023', null, 'con solo dos cifras');
select throws_ok($$select public.zz_nut('{"aditivos": ["en:e12345"]}')$$, '22023', null, 'con cinco cifras');
select throws_ok($$select public.zz_nut('{"aditivos": ["en:e330abcde"]}')$$, '22023', null, 'con cinco letras');
select throws_ok($$select public.zz_nut('{"aditivos": ["e330"]}')$$, '22023', null, 'sin idioma');
select throws_ok($$select public.zz_nut('{"aditivos": ["fr:e330"]}')$$, '22023', null, 'con otro idioma');
select throws_ok($$select public.zz_nut('{"aditivos": ["en:e330''; drop table products;--"]}')$$, '22023', null, 'con comillas');
select throws_ok($$select public.zz_nut('{"aditivos": ["en:e330", null]}')$$, '22023', null, 'un NULL dentro de la lista');
select throws_ok($$select public.zz_nut('{"aditivos": ["en:e330", "en:e330"]}')$$, '22023', null, 'un aditivo repetido');
select throws_ok($$select public.zz_nut(jsonb_build_object('aditivos', (select jsonb_agg('en:e' || (100 + i)) from generate_series(1, 61) i)))$$,
  '22023', null, 'más de 60 aditivos');

select throws_ok($$select public.zz_nut('{"producto": null}')$$, '22023', null, 'y de nuevo sin producto: la validación del producto va primero');

reset role;

select is(
  (select count(*) from public.product_nutrition where product_id = current_setting('opsi.p')::uuid),
  0::bigint,
  'y de todo lo rechazado no ha entrado nada en el producto privado'
);

-- Quien no es service_role, ni lo intenta.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$select public.zz_nut()$$,
  '42501', null,
  'una persona con sesión (premium incluida) no puede escribir nutrición con la función'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.zz_nut()$$,
  '42501', null,
  'ni sin sesión'
);

reset role;

-- Dejar g1 completa para las lecturas de abajo (la última escritura la dejó con otros valores).
set local role service_role;
select lives_ok($$select public.zz_nut('{}')$$, 'g1 vuelve a quedar con su ficha completa');
reset role;

-- ══════════════════════════════════════════════════════════════════════════
-- E · Premium: sin plan no se lee, con plan sí, y el plan se mira en cada consulta
-- ══════════════════════════════════════════════════════════════════════════
--
--   g1  nutrición completa            g3  fila con todo NULL (OFF no declara nada)
--   g2  la dejó el apartado D (la borramos): «no consta»

delete from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid;

-- ── Bruno, plan básico ────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(public.my_plan(), 'basic', 'Bruno tiene el plan básico');

select is(
  public.zz_error_de($$select * from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])$$),
  '42501/premium',
  'sin plan, la función da 42501 con la pista premium'
);

select throws_ok(
  $$select * from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])$$,
  '42501', 'Esto es de Opsi Premium ⭐.',
  'y el mismo mensaje que my_known_products'
);

select is(
  public.zz_error_de($$select * from public.nutrition_of_products(null)$$),
  '42501/premium',
  'el plan se mira ANTES que los argumentos: un array nulo tampoco enseña nada'
);

select is(
  (select count(*) from public.product_nutrition),
  0::bigint,
  'un select directo a la tabla da CERO filas, no un error: la RLS no le enseña nada'
);

select is(
  (select count(*) from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid),
  0::bigint,
  'y pidiendo un producto por su id, tampoco'
);

-- ── Ana, premium ──────────────────────────────────────────────────────────

set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(public.my_plan(), 'premium', 'Ana tiene el plan premium');

select is(
  (select count(*) from public.product_nutrition
    where product_id in (current_setting('opsi.g1')::uuid, current_setting('opsi.g2')::uuid, current_setting('opsi.g3')::uuid)),
  2::bigint,
  'Ana, con plan, lee por la tabla: dos filas (el producto sin fila no sale)'
);

select is(
  (select count(*) from public.nutrition_of_products(
     array[current_setting('opsi.g1')::uuid, current_setting('opsi.g2')::uuid, current_setting('opsi.g3')::uuid])),
  2::bigint,
  'y por la función: g2 no tiene fila, así que no sale («no consta»)'
);

select is(
  (select concat_ws('|', nutriscore_grade, nova_group, basis, energy_kcal, fat, serving_size)
     from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])),
  'c|4|ml|64.00|3.60|250 ml',
  'devuelve los valores de la ficha'
);

select is(
  (select n.nutrition_data_at is not null and n.energy_kcal is null and n.fat is null and n.additives_tags is null
     from public.nutrition_of_products(array[current_setting('opsi.g3')::uuid]) n),
  true,
  'g3 sale como una fila con todo NULL: «OFF no declara nada» es una fila, no un cero ni una ausencia'
);

select is(
  (select count(*) from public.nutrition_of_products(array[]::uuid[])),
  0::bigint,
  'una lista vacía no devuelve nada'
);

select is(
  (select count(*) from public.nutrition_of_products(array[gen_random_uuid(), gen_random_uuid()])),
  0::bigint,
  'y unos ids que no existen, tampoco'
);

select is(
  (select count(*) from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid, current_setting('opsi.g1')::uuid])),
  1::bigint,
  'un id repetido no repite la fila'
);

select is(
  (select count(*) from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid, null]::uuid[])),
  1::bigint,
  'un NULL dentro de la lista no rompe nada'
);

select lives_ok(
  $$select * from public.nutrition_of_products(array(select gen_random_uuid() from generate_series(1, 200)))$$,
  '200 ids es el máximo y caben'
);

select is(
  public.zz_error_de($$select * from public.nutrition_of_products(array(select gen_random_uuid() from generate_series(1, 201)))$$),
  '22023/',
  'pedir 201 se rechaza con 22023'
);

select is(
  public.zz_error_de($$select * from public.nutrition_of_products(null)$$),
  '22023/',
  'un array nulo, también'
);

-- Ana, aun premium, no escribe nada.
select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at) values (current_setting('opsi.g2')::uuid, now())$$,
  '42501', null,
  'una persona premium no inserta en la tabla...'
);
select throws_ok(
  $$update public.product_nutrition set energy_kcal = 0 where product_id = current_setting('opsi.g1')::uuid$$,
  '42501', null,
  '...ni actualiza...'
);
select throws_ok(
  $$delete from public.product_nutrition where product_id = current_setting('opsi.g1')::uuid$$,
  '42501', null,
  '...ni borra...'
);
select throws_ok(
  $$truncate public.product_nutrition$$,
  '42501', null,
  '...ni vacía la tabla'
);

reset role;

-- ── El plan se lee en cada consulta ───────────────────────────────────────

update public.user_settings set plan = 'premium' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])),
  1::bigint,
  'si Bruno pasa a premium, lee en la misma sesión'
);

reset role;

update public.user_settings set plan = 'basic' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  public.zz_error_de($$select * from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])$$),
  '42501/premium',
  'y si vuelve al plan básico, deja de leer'
);

select is(
  (select count(*) from public.product_nutrition),
  0::bigint,
  'también por la tabla'
);

-- El plan NO lo cambia el cliente: es la llave de todo esto.
select throws_ok(
  $$update public.user_settings set plan = 'premium' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'$$,
  '42501', null,
  'Bruno no puede ponerse premium a sí mismo (ningún permiso de columna concede plan)'
);

reset role;

-- Sin ajustes, el plan es el básico (el valor seguro): tampoco lee.
delete from public.user_settings where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.product_nutrition),
  0::bigint,
  'una persona sin fila de ajustes cuenta como plan básico: cero filas'
);

reset role;

-- ── anon ──────────────────────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$select * from public.product_nutrition$$,
  '42501', null,
  'sin sesión no se lee la tabla'
);
select throws_ok(
  $$select * from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])$$,
  '42501', null,
  'ni se llama a la función'
);

reset role;

-- ── service_role ──────────────────────────────────────────────────────────
-- En esta base de pruebas `service_role` no salta la RLS como en Supabase, así que no se
-- cuentan filas: se comprueba lo que se le deja intentar.

set local role service_role;

select lives_ok(
  $$select product_id, nutrition_data_at from public.product_nutrition$$,
  'service_role puede leer product_id y nutrition_data_at (saber si la ficha tiene nutrición)'
);
select throws_ok(
  $$select energy_kcal from public.product_nutrition$$,
  '42501', null,
  'pero no los valores: ni una columna'
);
select throws_ok(
  $$select * from public.product_nutrition$$,
  '42501', null,
  'ni con un select *'
);
select throws_ok(
  $$select product_id, sugars from public.product_nutrition$$,
  '42501', null,
  'ni mezclada con las dos que sí puede'
);
select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at) values (current_setting('opsi.g2')::uuid, now())$$,
  '42501', null,
  'no inserta directamente...'
);
select throws_ok(
  $$update public.product_nutrition set nutrition_data_at = now()$$,
  '42501', null,
  '...ni actualiza...'
);
select throws_ok(
  $$delete from public.product_nutrition$$,
  '42501', null,
  '...ni borra'
);
select throws_ok(
  $$select * from public.nutrition_of_products(array[current_setting('opsi.g1')::uuid])$$,
  '42501', null,
  'y la función de lectura de la app no es suya'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════════
-- F · Quien comparte nevera no escribe nutrición, y products no tiene columnas de eso
-- ══════════════════════════════════════════════════════════════════════════

update public.user_settings set plan = 'premium' where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal, sugars)
    values (current_setting('opsi.p')::uuid, now(), 0, 0)$$,
  '42501', null,
  'un miembro de la nevera no puede inventar «0 g de azúcar» en el producto privado de su nevera'
);

select throws_ok(
  $$insert into public.product_nutrition (product_id, nutrition_data_at) values (current_setting('opsi.g2')::uuid, now())$$,
  '42501', null,
  'ni en un producto del catálogo global'
);

select throws_ok(
  $$update public.product_nutrition set sugars = 0 where product_id = current_setting('opsi.g1')::uuid$$,
  '42501', null,
  'ni cambiar el de un producto que ya la tiene'
);

-- No hay columnas de nutrición en products a las que agarrarse con un insert directo.
select throws_ok(
  $$insert into public.products (household_id, name, data_source, energy_kcal)
    values (current_setting('opsi.piso')::uuid, 'Con kcal', 'user', 0)$$,
  '42703', null,
  'un insert en products con una columna de nutrición no existe (42703): no hay dónde ponerla'
);

reset role;

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
      and column_name in ('nutriscore_grade', 'nova_group', 'basis', 'energy_kcal', 'fat', 'saturated_fat',
                          'carbohydrates', 'sugars', 'fiber', 'proteins', 'salt', 'fat_level',
                          'saturated_fat_level', 'sugars_level', 'salt_level', 'serving_size',
                          'additives_tags', 'nutrition_data_at')),
  0::bigint,
  'products no tiene ninguna columna de nutrición: toda vive en product_nutrition'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G · «No consta» (sin fila) frente a «OFF no declara» (fila con todo NULL)
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*) from public.product_nutrition where product_id = current_setting('opsi.g2')::uuid),
  0::bigint,
  'g2: sin fila = no consta'
);

select is(
  (select count(*) from public.product_nutrition where product_id = current_setting('opsi.g3')::uuid),
  1::bigint,
  'g3: con fila (aunque todo NULL) = se consultó y OFF no declara datos'
);

-- Al borrar el producto se va su nutrición con él.
delete from public.products where id = current_setting('opsi.g3')::uuid;

select is(
  (select count(*) from public.product_nutrition where product_id = current_setting('opsi.g3')::uuid),
  0::bigint,
  'si el producto se borra, su nutrición se va con él (on delete cascade)'
);

select * from finish();
rollback;
