-- ═══════════════════════════════════════════════════════════════════════════
-- Lista de la compra: lo que NO se puede hacer aunque el cliente lo intente
--
-- La tabla y su RLS vienen de la fase 0; las reglas, de `20261011100000_lista_de_la_compra` y,
-- con las listas individuales y compartidas, de `20261028100000_listas_por_cuenta`. Aquí se prueba:
--
--   · el aislamiento entre neveras (las líneas de una lista compartida no se ven ni se tocan desde
--     otra nevera) y entre personas (las de una lista individual solo las ve su dueña/o);
--   · que NADA se apunta solo si la persona no lo encendió (`auto_restock`);
--   · que `created_by` es siempre quien escribe;
--   · que el producto enlazado es global o de la nevera de la línea;
--   · que la nevera de la línea es la de su lista (ninguna, si la lista es individual);
--   · el tope por lista;
--   · que «comprado → inventario» es UNA transacción: o pasan las dos cosas o ninguna, y que una
--     línea de una lista individual necesita que se diga a qué nevera va.
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

select set_config('opsi.ana',   'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', true);
select set_config('opsi.bruno', 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', true);
select set_config('opsi.priv_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.ana')::uuid), true);
select set_config('opsi.priv_bruno',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.bruno')::uuid), true);

-- Las neveras no traen lista, y cada cuenta nace con su individual «La compra».
select set_config('opsi.ind_ana',
  (select id::text from public.shopping_lists
    where kind = 'personal' and owner_id = current_setting('opsi.ana')::uuid), true);
select set_config('opsi.ind_bruno',
  (select id::text from public.shopping_lists
    where kind = 'personal' and owner_id = current_setting('opsi.bruno')::uuid), true);

-- Una lista compartida en la nevera de cada una, para colgar las líneas de nevera.
with nueva as (
  insert into public.shopping_lists (household_id, name, kind)
  values (current_setting('opsi.priv_ana')::uuid, 'Compra de Ana', 'shared')
  returning id
)
select set_config('opsi.lista_ana', (select id::text from nueva), true);

with nueva as (
  insert into public.shopping_lists (household_id, name, kind)
  values (current_setting('opsi.priv_bruno')::uuid, 'Compra de Bruno', 'shared')
  returning id
)
select set_config('opsi.lista_bruno', (select id::text from nueva), true);

-- Un producto privado de Bruno, para probar que no se puede enlazar desde la lista de Ana.
insert into public.products (id, household_id, name, data_source)
values ('b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', current_setting('opsi.priv_bruno')::uuid,
        'Salsa de Bruno', 'user');
-- Uno privado de Ana, para la lista individual.
insert into public.products (id, household_id, name, data_source)
values ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', current_setting('opsi.priv_ana')::uuid,
        'Salsa de Ana', 'user');
-- Y uno global.
insert into public.products (id, barcode, name, data_source)
values ('d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0', '8499990000099', 'Producto global de prueba', 'openfoodfacts');

-- ══════════════════════════════════════════════════════════════════════════
-- A · Aislamiento entre neveras
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid, 'Leche')$$,
  'Ana apunta algo en su lista compartida'
);

select set_config('opsi.linea_ana',
  (select id::text from public.shopping_list_items where name = 'Leche'), true);

set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.shopping_list_items),
  0::bigint,
  'Bruno no ve las líneas de la nevera de Ana'
);

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid, 'Colado')$$,
  '42501', null,
  'ni puede apuntar nada en la lista de la nevera de Ana'
);

select lives_ok(
  $$update public.shopping_list_items set name = 'Cambiada'
     where id = current_setting('opsi.linea_ana')::uuid$$,
  'actualizar una línea ajena no falla...'
);

select lives_ok(
  $$delete from public.shopping_list_items where id = current_setting('opsi.linea_ana')::uuid$$,
  '...ni borrarla...'
);

reset role;

select is(
  (select name from public.shopping_list_items where id = current_setting('opsi.linea_ana')::uuid),
  'Leche',
  '...pero no hacen nada: la línea de Ana sigue como estaba'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Nada se apunta solo si la persona no lo encendió
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, source)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid, 'Huevos', 'auto_restock')$$,
  'P0001', null,
  'auto_restock se rechaza mientras Ana no haya encendido apuntar lo que se acaba'
);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, source)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid, 'Pan', 'manual')$$,
  'a mano, siempre'
);

reset role;
update public.user_settings set auto_add_to_shopping_list = true
 where user_id = current_setting('opsi.ana')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, source)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid, 'Huevos', 'auto_restock')$$,
  'con el ajuste encendido, auto_restock entra'
);

reset role;
update public.user_settings set auto_add_to_shopping_list = false
 where user_id = current_setting('opsi.ana')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select throws_ok(
  $$update public.shopping_list_items set source = 'auto_restock' where name = 'Pan'$$,
  '22023', null,
  'y no se puede disfrazar una línea a mano como automática cambiando su origen'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Quién apuntó, siempre quien escribe
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, created_by)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid,
            'A nombre de otro', current_setting('opsi.bruno')::uuid)$$,
  'mandar el created_by de otra persona no falla...'
);

select is(
  (select created_by from public.shopping_list_items where name = 'A nombre de otro'),
  current_setting('opsi.ana')::uuid,
  '...pero se pisa: queda a nombre de quien escribió'
);

select throws_ok(
  $$update public.shopping_list_items set created_by = current_setting('opsi.bruno')::uuid
     where name = 'Pan'$$,
  '22023', null,
  'y no se puede cambiar después'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · El producto enlazado: global o de la nevera de la línea
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, product_id)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid,
            'Con producto global', 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0')$$,
  'un producto del catálogo global se puede enlazar'
);

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, product_id)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid,
            'Con producto ajeno', 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0')$$,
  'P0002', null,
  'el producto privado de otra nevera no, aunque se conozca su id'
);

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, product_id)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid,
            'Con producto fantasma', gen_random_uuid())$$,
  'P0002', null,
  'ni uno que no existe: mismo mensaje'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · Las restricciones de la cantidad y de «comprado»
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, quantity)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid,
            'Cantidad suelta', 2)$$,
  '23514', null,
  'una cantidad sin unidad se rechaza'
);

select throws_ok(
  $$update public.shopping_list_items set is_purchased = true where name = 'Pan'$$,
  '23514', null,
  'comprado sin decir cuándo se rechaza'
);

select lives_ok(
  $$update public.shopping_list_items set is_purchased = true, purchased_at = now()
     where name = 'Pan'$$,
  'comprado, con su fecha, entra'
);

-- ══════════════════════════════════════════════════════════════════════════
-- F · Comprado → inventario, en una transacción
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  $$insert into public.shopping_list_items
      (household_id, list_id, name, unit_family, display_unit, quantity)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.lista_ana')::uuid,
            'Zumo', 'volume', 'l', 1000)$$,
  'Ana apunta un zumo de un litro'
);

select set_config('opsi.linea_zumo',
  (select id::text from public.shopping_list_items where name = 'Zumo'), true);

-- Una alta mala (cantidad negativa) no puede dejar la línea marcada.
select throws_ok(
  $$select public.stock_from_list(
      current_setting('opsi.linea_zumo')::uuid, 'Zumo', 'volume', 'l', -5)$$,
  '22023', null,
  'dar de alta con una cantidad mala falla...'
);

select is(
  (select is_purchased from public.shopping_list_items where id = current_setting('opsi.linea_zumo')::uuid),
  false,
  '...y la línea NO queda marcada como comprada: o pasan las dos cosas o ninguna'
);

select lives_ok(
  $$select public.stock_from_list(
      current_setting('opsi.linea_zumo')::uuid, 'Zumo de naranja', 'volume', 'l', 1000,
      'fridge')$$,
  'dar de alta bien crea el elemento'
);

select is(
  (select count(*) from public.inventory_items
    where name = 'Zumo de naranja' and household_id = current_setting('opsi.priv_ana')::uuid),
  1::bigint,
  'en la nevera de la línea'
);

select is(
  (select is_purchased and purchased_at is not null
     from public.shopping_list_items where id = current_setting('opsi.linea_zumo')::uuid),
  true,
  'y la línea queda comprada, con su fecha'
);

select throws_ok(
  $$select public.stock_from_list(
      current_setting('opsi.linea_zumo')::uuid, 'Zumo otra vez', 'volume', 'l', 1000)$$,
  'P0001', null,
  'una línea ya comprada no se puede dar de alta dos veces'
);

select is(
  public.zz_error_de(format(
    $$select public.stock_from_list(%L, 'Zumo', 'volume', 'l', 1000, 'fridge', null, null, null, null, null, 'otros', %L)$$,
    current_setting('opsi.linea_ana'), current_setting('opsi.priv_bruno'))),
  '22023/',
  'una línea de una lista compartida solo va a la nevera de su lista, no a otra'
);

set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select throws_ok(
  $$select public.stock_from_list(
      current_setting('opsi.linea_ana')::uuid, 'Robada', 'count', 'unit', 1)$$,
  'P0002', null,
  'Bruno no puede dar de alta una línea de la nevera de Ana: para él no existe'
);

reset role;

select is(
  (select count(*) from public.inventory_items where name = 'Robada'),
  0::bigint,
  'y no se creó nada'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G · Tope por lista
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

-- La lista de Bruno tiene 0 líneas: se llena hasta el tope con una sola sentencia.
select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    select current_setting('opsi.priv_bruno')::uuid, current_setting('opsi.lista_bruno')::uuid,
           'línea ' || g from generate_series(1, 300) g$$,
  'se puede llegar a 300 líneas'
);

select is(
  public.zz_error_de($$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_bruno')::uuid, current_setting('opsi.lista_bruno')::uuid, 'la que sobra')$$),
  'P0001/lista_llena',
  'la 301 se rechaza con un mensaje que se entiende'
);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (null, current_setting('opsi.ind_bruno')::uuid, 'en otra lista sí cabe')$$,
  'el tope es por lista: en otra lista de Bruno sigue cabiendo'
);

select lives_ok(
  $$delete from public.shopping_list_items where name = 'línea 1'$$,
  'quitar una...'
);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_bruno')::uuid, current_setting('opsi.lista_bruno')::uuid, 'ahora sí')$$,
  '...deja sitio para otra'
);

-- ══════════════════════════════════════════════════════════════════════════
-- H · Permisos
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role anon;

select throws_ok(
  $$select * from public.shopping_list_items$$,
  '42501', null,
  'sin sesión no se lee la lista'
);

select throws_ok(
  $$select public.stock_from_list(gen_random_uuid(), 'x', 'count', 'unit', 1)$$,
  '42501', null,
  'ni se ejecuta stock_from_list'
);

reset role;

select ok(
  not has_function_privilege('authenticated', 'public.check_shopping_item()', 'EXECUTE'),
  'el trigger no lo ejecuta nadie a mano'
);

-- ══════════════════════════════════════════════════════════════════════════
-- I · Una lista individual: líneas sin nevera, solo para su dueña/o
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Papel de cocina')$$,
  'Ana apunta en su lista individual, sin nevera'
);

select is(
  (select household_id from public.shopping_list_items where name = 'Papel de cocina'),
  null,
  'y la línea no cuelga de ninguna nevera'
);

select is(
  public.zz_error_de($$insert into public.shopping_list_items (household_id, list_id, name)
    values (current_setting('opsi.priv_ana')::uuid, current_setting('opsi.ind_ana')::uuid, 'Con nevera')$$),
  'P0002/',
  'una línea de una lista individual no puede traer una nevera'
);

select is(
  public.zz_error_de($$insert into public.shopping_list_items (household_id, list_id, name)
    values (null, current_setting('opsi.lista_ana')::uuid, 'Sin nevera')$$),
  'P0002/',
  'ni una línea de una lista compartida quedarse sin ella'
);

select is(
  public.zz_error_de($$insert into public.shopping_list_items (household_id, list_id, name)
    values (null, null, 'Sin lista')$$),
  '22023/',
  'y una línea sin lista se rechaza con un mensaje que se entiende'
);

select lives_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name, product_id)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Con producto de mi nevera',
            'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0')$$,
  'en una lista individual vale un producto privado de una nevera suya'
);

select is(
  public.zz_error_de($$insert into public.shopping_list_items (household_id, list_id, name, product_id)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Con producto ajeno',
            'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0')$$),
  'P0002/',
  'pero no uno privado de la nevera de otra persona'
);

select lives_ok(
  $$insert into public.shopping_list_items
      (household_id, list_id, name, unit_family, display_unit, quantity)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Pasta', 'mass', 'g', 500)$$,
  'Ana apunta una pasta en su lista individual'
);

select set_config('opsi.linea_pasta',
  (select id::text from public.shopping_list_items where name = 'Pasta'), true);

-- Bruno no ve su lista ni sus líneas, y no puede escribir en ella.
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.shopping_list_items where list_id = current_setting('opsi.ind_ana')::uuid),
  0::bigint,
  'Bruno no ve las líneas de la lista individual de Ana'
);

select is(
  (select count(*) from public.shopping_lists where id = current_setting('opsi.ind_ana')::uuid),
  0::bigint,
  'ni la lista'
);

select throws_ok(
  $$insert into public.shopping_list_items (household_id, list_id, name)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Colado')$$,
  '42501', null,
  'ni puede apuntar en ella'
);

select throws_ok(
  $$select public.stock_from_list(
      current_setting('opsi.linea_pasta')::uuid, 'Robada', 'mass', 'g', 500,
      'pantry', null, null, null, null, null, 'otros', current_setting('opsi.priv_bruno')::uuid)$$,
  'P0002', null,
  'ni dar de alta sus líneas en su propia nevera: para él no existen'
);

set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

-- Pasarla al inventario: la línea no tiene nevera, hay que decir cuál.
select is(
  public.zz_error_de(format(
    $$select public.stock_from_list(%L, 'Pasta', 'mass', 'g', 500)$$, current_setting('opsi.linea_pasta'))),
  '22023/',
  'sin decir a qué nevera, una línea de una lista individual no pasa al inventario'
);

select is(
  public.zz_error_de(format(
    $$select public.stock_from_list(%L, 'Pasta', 'mass', 'g', 500, 'pantry', null, null, null, null, null, 'otros', %L)$$,
    current_setting('opsi.linea_pasta'), current_setting('opsi.priv_bruno'))),
  'P0002/',
  'ni a una nevera que no es suya'
);

select is(
  (select is_purchased from public.shopping_list_items where id = current_setting('opsi.linea_pasta')::uuid),
  false,
  'y en ninguno de los dos casos la línea queda marcada'
);

select lives_ok(
  format(
    $$select public.stock_from_list(%L, 'Pasta', 'mass', 'g', 500, 'pantry', null, null, null, null, null, 'otros', %L)$$,
    current_setting('opsi.linea_pasta'), current_setting('opsi.priv_ana')),
  'diciendo una de sus neveras, sí'
);

select is(
  (select count(*) from public.inventory_items
    where name = 'Pasta' and household_id = current_setting('opsi.priv_ana')::uuid),
  1::bigint,
  'el elemento se crea en esa nevera'
);

-- Un producto privado de una nevera no se enlaza al guardarlo en otra: se guarda por el nombre.
reset role;
with piso as (
  insert into public.households (name, kind, icon, member_limit)
  values ('Piso', 'shared', 'house', 5)
  returning id
)
insert into public.household_members (household_id, user_id, role)
select piso.id, current_setting('opsi.ana')::uuid, 'owner' from piso;
select set_config('opsi.piso',
  (select household_id::text from public.household_members
    where user_id = current_setting('opsi.ana')::uuid
      and household_id <> current_setting('opsi.priv_ana')::uuid), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.shopping_list_items
      (household_id, list_id, name, unit_family, display_unit, quantity, product_id)
    values (null, current_setting('opsi.ind_ana')::uuid, 'Salsa', 'count', 'unit', 1,
            'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0')$$,
  'Ana apunta la salsa de su nevera privada en su lista individual'
);

select set_config('opsi.linea_salsa',
  (select id::text from public.shopping_list_items where name = 'Salsa'), true);

select lives_ok(
  format(
    $$select public.stock_from_list(%L, 'Salsa', 'count', 'unit', 1, 'pantry', null, null, null, null, null, 'otros', %L)$$,
    current_setting('opsi.linea_salsa'), current_setting('opsi.piso')),
  'y la guarda en el Piso: el producto privado de la otra nevera no se puede enlazar...'
);

select is(
  (select product_id from public.inventory_items
    where name = 'Salsa' and household_id = current_setting('opsi.piso')::uuid),
  null,
  '...así que se guarda solo con el nombre'
);

reset role;

select * from finish();
rollback;
