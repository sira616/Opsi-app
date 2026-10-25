-- ═══════════════════════════════════════════════════════════════════════════
-- Listas de la compra individuales y compartidas, el plan y lo que más gastas
--
-- 20261017100000 añade `shopping_lists`, el plan y el color de `user_settings`, y
-- `most_used_products`; 20261028100000 cambia el modelo de las listas. Aquí se prueba que:
--
--   · la cuenta nace con su lista individual y las neveras NACEN SIN LISTA;
--   · el plan básico llega a 1 compartida + 1 individual, premium a 5 de cualquier tipo, y el
--     tope es por cuenta (lo que creó esa persona), no por nevera;
--   · una lista individual no cuelga de ninguna nevera y solo la ve su dueña/o; una compartida es
--     de una nevera y la ven sus miembros;
--   · una línea nunca cae en una lista de otra nevera, y de las individuales siempre queda una;
--   · el plan no lo escribe el cliente, los colores son de premium y el plan fija cuántas neveras
--     puede tener una cuenta (2 / 5);
--   · lo que más gastas es premium, y no deja ver una nevera ajena.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Devuelve «SQLSTATE/pista» de lo que lance la sentencia, o «sin error».
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
-- A · La cuenta nace con su lista; la nevera, no
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*) from public.shopping_lists where household_id = current_setting('opsi.priv_ana')::uuid),
  0::bigint,
  'la nevera de Ana nació sin lista'
);

select is(
  (select count(*) from public.shopping_lists
    where kind = 'personal' and owner_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  1::bigint,
  'pero la cuenta de Ana nació con una lista individual...'
);

select is(
  (select name from public.shopping_lists
    where kind = 'personal' and owner_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  'La compra',
  '...que se llama «La compra»'
);

select is(
  (select household_id from public.shopping_lists
    where kind = 'personal' and owner_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  null,
  'y no cuelga de ninguna nevera'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select set_config('opsi.ind_ana',
  (select id::text from public.shopping_lists where kind = 'personal'), true);

-- ══════════════════════════════════════════════════════════════════════════
-- B · El plan básico: 1 compartida + 1 individual
-- ══════════════════════════════════════════════════════════════════════════

select is(public.my_plan(), 'basic', 'Ana empieza en el plan básico');

select is(
  public.zz_error_de($$insert into public.shopping_lists (name, kind) values ('Otra mía', 'personal')$$),
  'P0001/listas_limite_individual',
  'una segunda individual se rechaza en el plan básico, con su pista'
);

select lives_ok(
  $$insert into public.shopping_lists (household_id, name, kind)
    values (current_setting('opsi.priv_ana')::uuid, '  Fiesta  ', 'shared')$$,
  'se crea la compartida'
);

select is(
  (select name from public.shopping_lists where kind = 'shared'),
  'Fiesta',
  'el nombre se guarda sin espacios sobrantes'
);

select is(
  public.zz_error_de($$insert into public.shopping_lists (household_id, name, kind)
    values (current_setting('opsi.priv_ana')::uuid, 'Cumple', 'shared')$$),
  'P0001/listas_limite_compartida',
  'una segunda compartida se rechaza en el plan básico, con su pista'
);

select is(
  (select created_by from public.shopping_lists where name = 'Fiesta'),
  'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'::uuid,
  'quién la creó lo pone el servidor'
);

select is(
  (select owner_id from public.shopping_lists where name = 'La compra'),
  'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'::uuid,
  'y la dueña de la individual, también'
);

select throws_ok(
  $$insert into public.shopping_lists (household_id, name, kind)
    values (current_setting('opsi.priv_bruno')::uuid, 'Colada', 'shared')$$,
  '42501', null,
  'no se crea una compartida en la nevera de otra persona'
);

select throws_ok(
  $$insert into public.shopping_lists (household_id, name, kind, owner_id)
    values (null, 'Suplanto', 'personal', 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222')$$,
  '42501', null,
  'ni se elige de quién es una individual: el permiso de columna no deja ni intentarlo'
);

select throws_ok(
  $$insert into public.shopping_lists (household_id, name, kind)
    values (null, 'Sin tipo', 'otra')$$,
  '42501', null,
  'un tipo inventado no entra: la RLS solo conoce los dos'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Nombre y renombrar
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$update public.shopping_lists set name = '   ' where name = 'Fiesta'$$,
  '23514', null,
  'un nombre vacío se rechaza'
);

select throws_ok(
  $$update public.shopping_lists set name = repeat('a', 41) where name = 'Fiesta'$$,
  '23514', null,
  'y uno de más de 40 caracteres'
);

select lives_ok(
  $$update public.shopping_lists set name = ' Cumpleaños ' where name = 'Fiesta'$$,
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

select throws_ok(
  $$update public.shopping_lists set kind = 'personal' where name = 'Cumpleaños'$$,
  '42501', null,
  'ni de tipo'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Las líneas caen en su lista
-- ══════════════════════════════════════════════════════════════════════════

select set_config('opsi.lista_cumple',
  (select id::text from public.shopping_lists where name = 'Cumpleaños'), true);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_cumple')::uuid, 'Globos')$$,
  'una línea se apunta en su lista compartida, con la nevera de la lista'
);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Leche')$$,
  'y otra en su lista individual, sin nevera'
);

select throws_ok(
  $$update public.shopping_list_items set list_id = current_setting('opsi.ind_ana')::uuid where name = 'Globos'$$,
  'P0002', null,
  'una línea de una lista compartida no se mueve a una individual: no tiene nevera'
);

select throws_ok(
  $$update public.shopping_list_items set list_id = current_setting('opsi.lista_cumple')::uuid where name = 'Leche'$$,
  'P0002', null,
  'ni al revés'
);

-- La lista de Bruno, vista por quien administra: Ana no la ve y no puede usarla.
reset role;
with nueva as (
  insert into public.shopping_lists (household_id, name, kind)
  values (current_setting('opsi.priv_bruno')::uuid, 'Compra de Bruno', 'shared')
  returning id
)
select set_config('opsi.lista_bruno', (select id::text from nueva), true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_bruno')::uuid, 'Colada')$$,
  '42501', null,
  'una línea de mi nevera no cuelga de la lista de otra nevera'
);

select is(
  (select count(*) from public.shopping_lists where id = current_setting('opsi.lista_bruno')::uuid),
  0::bigint,
  'y la lista de otra nevera no se ve'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · Borrar: las líneas se van con su lista, y siempre queda una individual
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$delete from public.shopping_lists where id = current_setting('opsi.lista_cumple')::uuid$$,
  'se borra una compartida (no hace falta que quede ninguna)'
);

select is(
  (select count(*) from public.shopping_list_items where name = 'Globos'),
  0::bigint,
  'y sus líneas con ella'
);

select is(
  public.zz_error_de($$delete from public.shopping_lists where id = current_setting('opsi.ind_ana')::uuid$$),
  'P0001/lista_ultima',
  'la última individual no se borra'
);

select is(
  (select count(*) from public.shopping_list_items where name = 'Leche'),
  1::bigint,
  'y sus líneas siguen donde estaban'
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

select is(
  (select household_limit::integer from public.user_settings),
  2,
  'en el plan básico caben 2 neveras (la privada incluida)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G · Premium
-- ══════════════════════════════════════════════════════════════════════════

reset role;
update public.user_settings set plan = 'premium' where user_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(public.my_plan(), 'premium', 'con el plan premium...');

select is(
  (select household_limit::integer from public.user_settings),
  5,
  '...caben 5 neveras'
);

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
  $$update public.user_settings set accent = 'purple'$$,
  'los colores son los de las princesas: el morado de Karen vale...'
);

select throws_ok(
  $$update public.user_settings set accent = 'white'$$,
  '23514', null,
  '...y el blanco, que no es de ninguna, ya no existe'
);

-- Ana tiene 1 individual. Premium: 5 de cualquier tipo, no «5 de cada».
select lives_ok(
  $$insert into public.shopping_lists (household_id, name, kind)
    select current_setting('opsi.priv_ana')::uuid, 'C' || g, 'shared' from generate_series(1, 2) g$$,
  'caben dos compartidas más...'
);

select lives_ok(
  $$insert into public.shopping_lists (name, kind)
    select 'I' || g, 'personal' from generate_series(1, 2) g$$,
  '...y otras dos individuales (la nevera no tiene que ver)'
);

select is(
  (select count(*) from public.shopping_lists
    where owner_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111' or created_by = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  5::bigint,
  'exactamente 5 en total'
);

select is(
  public.zz_error_de($$insert into public.shopping_lists (household_id, name, kind)
    values (current_setting('opsi.priv_ana')::uuid, 'La sexta', 'shared')$$),
  'P0001/listas_maximo',
  'y la sexta no cabe ni en premium, sea del tipo que sea'
);

select is(
  public.zz_error_de($$insert into public.shopping_lists (name, kind) values ('La sexta mía', 'personal')$$),
  'P0001/listas_maximo',
  '(tampoco una individual)'
);

-- Una individual no cuelga de ninguna nevera aunque el cliente mande una.
select lives_ok(
  $$delete from public.shopping_lists where name = 'I2'$$,
  'se borra una individual (queda más de una)'
);

select lives_ok(
  $$insert into public.shopping_lists (household_id, name, kind)
    values (current_setting('opsi.priv_bruno')::uuid, 'Con nevera ajena', 'personal')$$,
  'una individual con una nevera mandada por el cliente no falla...'
);

select is(
  (select household_id from public.shopping_lists where name = 'Con nevera ajena'),
  null,
  '...pero se pisa: no cuelga de ninguna'
);

-- Mover una línea entre dos compartidas de la misma nevera.
select set_config('opsi.c1', (select id::text from public.shopping_lists where name = 'C1'), true);
select set_config('opsi.c2', (select id::text from public.shopping_lists where name = 'C2'), true);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.c1')::uuid, 'Globos')$$,
  'una línea en la compartida C1'
);

select lives_ok(
  $$update public.shopping_list_items set list_id = current_setting('opsi.c2')::uuid where name = 'Globos'$$,
  'pasa a otra compartida de la misma nevera'
);

select throws_ok(
  $$update public.shopping_list_items set list_id = current_setting('opsi.lista_bruno')::uuid where name = 'Globos'$$,
  'P0002', null,
  'pero no a la de otra nevera'
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

select lives_ok(
  $$select * from public.most_used_products(current_setting('opsi.priv_ana')::uuid, 90, 200)$$,
  'se pueden pedir hasta 200 productos: la lista completa'
);

select throws_ok(
  $$select * from public.most_used_products(current_setting('opsi.priv_ana')::uuid, 90, 201)$$,
  '22023', null,
  'pero no 201'
);

-- Bruno, aunque sea premium, no ve la nevera de Ana ni sus listas.
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
  'y sus listas compartidas no se ven'
);

select is(
  (select count(*) from public.shopping_lists where owner_id = 'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111'),
  0::bigint,
  'ni sus listas individuales'
);

-- Y alguien en el plan básico no pasa de la puerta.
reset role;
update public.user_settings set plan = 'basic' where user_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222';
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select household_limit::integer from public.user_settings),
  2,
  'al volver al plan básico, el tope de neveras vuelve a 2'
);

select throws_ok(
  $$select * from public.most_used_products(current_setting('opsi.priv_bruno')::uuid)$$,
  '42501', null,
  'en el plan básico lo que más gastas es de premium'
);

select is(
  public.zz_error_de($$delete from public.shopping_lists where kind = 'personal'$$),
  'P0001/lista_ultima',
  'y a Bruno tampoco se le deja borrar su única individual'
);

select lives_ok(
  $$delete from public.shopping_lists where id = current_setting('opsi.lista_bruno')::uuid$$,
  'pero su compartida sí, que ya no necesita'
);

-- ══════════════════════════════════════════════════════════════════════════
-- I · Lo que se va con una nevera y con una cuenta, sin que la regla de «queda una» estorbe
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.shopping_lists (household_id, name, kind)
    values (current_setting('opsi.priv_bruno')::uuid, 'Otra de Bruno', 'shared')$$,
  'Bruno crea otra compartida en su nevera'
);

reset role;

select lives_ok(
  $$delete from public.households where id = current_setting('opsi.priv_bruno')::uuid$$,
  'borrar la nevera entera funciona'
);

select is(
  (select count(*) from public.shopping_lists where household_id = current_setting('opsi.priv_bruno')::uuid),
  0::bigint,
  'y sus listas compartidas se fueron con ella'
);

select is(
  (select count(*) from public.shopping_lists where owner_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'),
  1::bigint,
  'las individuales de Bruno no: son de su cuenta'
);

select lives_ok(
  $$delete from auth.users where id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'$$,
  'borrar la cuenta entera funciona aunque sea su última individual'
);

select is(
  (select count(*) from public.shopping_lists where owner_id = 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222'),
  0::bigint,
  'y sus listas individuales se fueron con ella'
);

-- ══════════════════════════════════════════════════════════════════════════
-- J · Permisos
-- ══════════════════════════════════════════════════════════════════════════

select ok(
  has_column_privilege('authenticated', 'public.shopping_lists', 'kind', 'INSERT')
    and has_column_privilege('authenticated', 'public.shopping_lists', 'household_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.shopping_lists', 'name', 'INSERT')
    and not has_column_privilege('authenticated', 'public.shopping_lists', 'owner_id', 'INSERT')
    and not has_column_privilege('authenticated', 'public.shopping_lists', 'created_by', 'INSERT')
    and has_column_privilege('authenticated', 'public.shopping_lists', 'name', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.shopping_lists', 'kind', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.shopping_lists', 'owner_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.shopping_lists', 'household_id', 'UPDATE'),
  'al crear se elige el tipo, la nevera y el nombre; al editar, solo el nombre'
);

select ok(
  not has_function_privilege('authenticated', 'public.check_shopping_list()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.sync_household_limit()', 'EXECUTE'),
  'los triggers no los ejecuta nadie a mano'
);

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
