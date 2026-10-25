-- ═══════════════════════════════════════════════════════════════════════════
-- Marcas en los tickets (20261029100000)
--
-- Lo que se comprueba:
--
--   · Permisos: solo quien tiene sesión ejecuta las seis funciones; la tabla de asociaciones se lee y se
--     borra pero NO se escribe con un INSERT o UPDATE suelto; ni anon ni service_role la tocan.
--   · Recordar lo confirmado es de Premium; corregirlo y borrarlo, no.
--   · Una confirmación igual suma; una corrección empieza de nuevo; cada tienda tiene la suya.
--   · El formato lo valida la base de datos, y un producto que quien llama no ve no se puede enlazar.
--   · Lo de una persona no lo ve, ni lo borra, ni lo corrige otra.
--   · `ticket_associations_for` no devuelve el enlace a un producto privado de otra nevera.
--   · `search_catalog`: sin acentos, sin comodines, solo el catálogo visible y la nevera pedida.
--   · `ensure_private_product`: UN producto por nombre y marca, no uno por ticket.
--   · `consume_off_search`: Premium, tope por persona y tope global por minuto, y quien insiste no agota
--     el global más allá de lo suyo.
--   · Todo se va con la cuenta, y borrar un producto no borra lo que la persona confirmó.
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
  ('00000000-0000-0000-0000-000000000000', '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'authenticated', 'authenticated', 'ana@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '5b5b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
   'authenticated', 'authenticated', 'beto@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '5c5c0003-cccc-4ccc-8ccc-ccccccccccc3',
   'authenticated', 'authenticated', 'cris@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

-- Ana y Cris son premium; Beto se queda en el plan básico.
update public.user_settings set plan = 'premium'
 where user_id in ('5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '5c5c0003-cccc-4ccc-8ccc-ccccccccccc3');

select set_config('opsi.nev_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid), true);
select set_config('opsi.nev_cris',
  (select m.household_id::text from public.household_members m
    where m.user_id = '5c5c0003-cccc-4ccc-8ccc-ccccccccccc3'::uuid), true);

-- Una segunda nevera de Ana (un piso).
with piso as (
  insert into public.households (name, kind, icon, member_limit)
  values ('Piso', 'shared', 'house', 5)
  returning id
)
insert into public.household_members (household_id, user_id, role)
select piso.id, '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'owner' from piso;
select set_config('opsi.piso_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
      and m.household_id <> current_setting('opsi.nev_ana')::uuid), true);

-- El catálogo global (lo escribe lookup-barcode, con la clave de servicio) y un par de privados.
insert into public.products (household_id, barcode, name, brand, unit_family, net_quantity, data_source) values
  (null, '8410128010096', 'Leche entera', 'Pascual', 'volume', 1000, 'openfoodfacts'),
  (null, '8410000000008', 'Puré de calabaza', 'Hacendado', 'mass', 500, 'openfoodfacts');

insert into public.products (household_id, name, brand, data_source) values
  (current_setting('opsi.nev_ana')::uuid, 'Leche de la abuela', 'Casera', 'user'),
  (current_setting('opsi.piso_ana')::uuid, 'Leche del piso', null, 'user'),
  (current_setting('opsi.nev_cris')::uuid, 'Leche secreta de Cris', 'Secreta', 'user');

select set_config('opsi.global_leche',
  (select id::text from public.products where barcode = '8410128010096'), true);
select set_config('opsi.priv_piso',
  (select id::text from public.products where name = 'Leche del piso'), true);
select set_config('opsi.priv_cris',
  (select id::text from public.products where name = 'Leche secreta de Cris'), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Permisos
-- ══════════════════════════════════════════════════════════════════════════

select ok(
  (select bool_and(has_function_privilege('authenticated', f, 'EXECUTE')
                   and not has_function_privilege('anon', f, 'EXECUTE')
                   and not has_function_privilege('service_role', f, 'EXECUTE'))
     from unnest(array[
       'public.ticket_associations_for(text[], uuid)',
       'public.confirm_ticket_association(text, text, text, text, uuid, text, public.unit_family, numeric, text, integer)',
       'public.update_ticket_association(uuid, text, text)',
       'public.search_catalog(text[], uuid, text)',
       'public.ensure_private_product(uuid, text, text)',
       'public.consume_off_search(integer)'
     ]) as f),
  'las seis funciones las ejecuta quien tiene sesión; ni anon ni service_role'
);

select ok(
  has_table_privilege('authenticated', 'public.ticket_associations', 'SELECT')
    and has_table_privilege('authenticated', 'public.ticket_associations', 'DELETE')
    and not has_table_privilege('authenticated', 'public.ticket_associations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.ticket_associations', 'UPDATE')
    and not has_any_column_privilege('authenticated', 'public.ticket_associations', 'INSERT')
    and not has_any_column_privilege('authenticated', 'public.ticket_associations', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.ticket_associations', 'TRUNCATE'),
  'las asociaciones se leen y se borran, pero no se escriben con un INSERT o UPDATE suelto'
);

select ok(
  not exists (
    select 1
      from unnest(array['anon', 'service_role']) as r(rol),
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(permiso)
     where has_table_privilege(r.rol, 'public.ticket_associations', p.permiso)
  ),
  'ni anon ni service_role tienen ningún permiso sobre las asociaciones'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ticket_associations'::regclass)
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ticket_associations') = 2,
  'RLS puesta, con dos políticas (ver y borrar lo propio)'
);

select ok(
  (select bool_and(p.prosecdef) from pg_proc p
    where p.oid in (
      'public.confirm_ticket_association(text, text, text, text, uuid, text, public.unit_family, numeric, text, integer)'::regprocedure,
      'public.update_ticket_association(uuid, text, text)'::regprocedure,
      'public.consume_off_search(integer)'::regprocedure))
  and not (select bool_or(p.prosecdef) from pg_proc p
    where p.oid in (
      'public.ticket_associations_for(text[], uuid)'::regprocedure,
      'public.search_catalog(text[], uuid, text)'::regprocedure,
      'public.ensure_private_product(uuid, text, text)'::regprocedure)),
  'las que escriben donde nadie escribe son SECURITY DEFINER; las que solo leen o crean lo de una nevera, con los permisos de quien llama'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Recordar lo confirmado es de Premium
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"5b5b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}';

select is(
  public.zz_error_de($$select public.confirm_ticket_association('leche entera 1l', 'mercadona', 'Leche entera', 'Pascual', null, null, null, null, 'off', 80)$$),
  '42501/premium',
  'en el plan básico no se guarda nada'
);

select is(
  public.zz_error_de($$select * from public.consume_off_search(1)$$),
  '42501/premium',
  'ni se reserva una búsqueda hacia Open Food Facts'
);

-- Sin sesión.
reset role;
set local role anon;
select is(
  public.zz_error_de($$select public.confirm_ticket_association('x', '', 'X', null, null, null, null, null, 'manual', null)$$),
  '42501/',
  'anon no ejecuta la función (permiso denegado)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Ana confirma
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select is(
  (select confirmations from public.confirm_ticket_association(
     'leche entera 1l', 'mercadona', 'Leche entera', 'Pascual', current_setting('opsi.global_leche')::uuid,
     '8410128010096', 'volume', 1000, 'off', 85)),
  1,
  'la primera confirmación cuenta una'
);

select is(
  (select confirmations from public.confirm_ticket_association(
     'leche entera 1l', 'mercadona', 'Leche entera', 'Pascual', current_setting('opsi.global_leche')::uuid,
     '8410128010096', 'volume', 1000, 'history', 85)),
  2,
  'la misma respuesta otra vez suma una confirmación'
);

select is(
  (select count(*) from public.ticket_associations),
  1::bigint,
  'y sigue siendo UNA asociación'
);

select ok(
  (select brand = 'Hacendado' and confirmations = 1 and source = 'manual'
     from public.confirm_ticket_association(
       'leche entera 1l', 'mercadona', 'Leche entera', 'Hacendado', null, null, null, null, 'manual', null)),
  'una corrección (otra marca) sustituye la anterior y empieza de nuevo'
);

select is(
  (select count(*) from public.confirm_ticket_association(
     'leche entera 1l', 'lidl', 'Leche entera', 'Pascual', null, null, null, null, 'manual', null)),
  1::bigint,
  'la misma línea en otra tienda es otra asociación…'
);
select is(
  (select count(*) from public.ticket_associations where line_key = 'leche entera 1l'),
  2::bigint,
  '…y cada tienda tiene la suya'
);

select lives_ok(
  $$select public.confirm_ticket_association('pan pueblo', '', 'Pan de pueblo', null, null, null, null, null, 'manual', null)$$,
  '«marca sin identificar» (sin marca) y sin tienda es una respuesta válida'
);
select is(
  (select brand from public.ticket_associations where line_key = 'pan pueblo'),
  null,
  'y no inventa ninguna marca'
);

-- El formato lo valida la base de datos.
select is(
  public.zz_error_de($$select public.confirm_ticket_association('Leche Entera', 'mercadona', 'Leche', null, null, null, null, null, 'manual', null)$$),
  '23514/', 'una clave con mayúsculas no vale (la normaliza el servidor)'
);
select is(
  public.zz_error_de($$select public.confirm_ticket_association('leche ', 'mercadona', 'Leche', null, null, null, null, null, 'manual', null)$$),
  '23514/', 'ni con espacios sobrantes'
);
select is(
  public.zz_error_de($$select public.confirm_ticket_association('x', 'mercadona', 'Leche', null, null, '1234', null, null, 'manual', null)$$),
  '23514/', 'un código de barras tiene de 8 a 14 cifras'
);
select is(
  public.zz_error_de($$select public.confirm_ticket_association('x', 'mercadona', 'Leche', null, null, null, 'volume', null, 'manual', null)$$),
  '23514/', 'una familia de unidad sin cantidad no vale'
);
select is(
  public.zz_error_de($$select public.confirm_ticket_association('x', 'mercadona', 'Leche', null, null, null, null, null, 'inventado', null)$$),
  '23514/', 'el origen es de una lista cerrada'
);
select is(
  public.zz_error_de($$select public.confirm_ticket_association('x', 'mercadona', 'Leche', null, null, null, null, null, 'manual', 101)$$),
  '23514/', 'la puntuación va de 0 a 100'
);

-- Un producto que quien llama no ve no se enlaza.
select is(
  public.zz_error_de(format($f$select public.confirm_ticket_association('x1', '', 'Leche', null, %L::uuid, null, null, null, 'manual', null)$f$, current_setting('opsi.priv_cris'))),
  'P0002/', 'no se enlaza un producto privado de otra persona'
);
select lives_ok(
  format($f$select public.confirm_ticket_association('x2', '', 'Leche del piso', null, %L::uuid, null, null, null, 'catalog', 70)$f$, current_setting('opsi.priv_piso')),
  'sí uno privado de una nevera propia'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Es suyo: Cris no lo ve, no lo borra, no lo corrige ni lo escribe a mano
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c5c0003-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';

select is((select count(*) from public.ticket_associations), 0::bigint, 'Cris no ve ninguna asociación de Ana');

delete from public.ticket_associations;
reset role;
select ok(
  (select count(*) from public.ticket_associations where user_id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1') >= 4,
  'y su DELETE no borra nada de Ana'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c5c0003-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';

select is(
  left(public.zz_error_de($$insert into public.ticket_associations (user_id, line_key, name, source) values ('5c5c0003-cccc-4ccc-8ccc-ccccccccccc3', 'a', 'A', 'manual')$$), 6),
  '42501/', 'un INSERT suelto, aunque sea a su nombre, no se permite'
);
select is(
  left(public.zz_error_de($$update public.ticket_associations set name = 'x'$$), 6),
  '42501/', 'ni un UPDATE suelto'
);

select is(
  public.zz_error_de($$select public.update_ticket_association(gen_random_uuid(), 'X', null)$$),
  'P0002/', 'corregir una que no existe (o no es suya) da P0002'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · Las asociaciones de una tanda, sin enlaces a productos de otra nevera
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select is(
  (select count(*) from public.ticket_associations_for(array['leche entera 1l', 'pan pueblo', 'nada'], current_setting('opsi.nev_ana')::uuid)),
  3::bigint,
  'solo salen las claves pedidas (dos tiendas de la leche y el pan)'
);

select is(
  (select product_id from public.ticket_associations_for(array['x2'], current_setting('opsi.piso_ana')::uuid)),
  current_setting('opsi.priv_piso')::uuid,
  'con la nevera del producto, se devuelve enlazado'
);
select is(
  (select product_id from public.ticket_associations_for(array['x2'], current_setting('opsi.nev_ana')::uuid)),
  null,
  'con OTRA nevera, el mismo producto privado sale sin enlazar (guardarlo ahí fallaría)'
);
select is(
  (select name from public.ticket_associations_for(array['x2'], current_setting('opsi.nev_ana')::uuid)),
  'Leche del piso',
  'pero conserva el nombre y la marca que la persona confirmó'
);
select is(
  (select product_id from public.ticket_associations_for(array['x2'], null)),
  null,
  'sin nevera, ningún privado se enlaza'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c5c0003-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';
select is(
  (select count(*) from public.ticket_associations_for(array['leche entera 1l', 'x2'], current_setting('opsi.nev_cris')::uuid)),
  0::bigint,
  'Cris no recibe nada de Ana por mucho que pida sus claves'
);

-- ══════════════════════════════════════════════════════════════════════════
-- F · Corregir a mano
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select ok(
  (select name = 'Leche fresca' and brand = 'Mi lechería' and source = 'manual' and confirmations = 1
          and product_id is null and barcode is null
     from public.update_ticket_association(
       (select id from public.ticket_associations where line_key = 'x2'), '  Leche fresca ', 'Mi lechería ')),
  'corregir deja nombre y marca como los escribió la persona y suelta el producto del catálogo'
);

select is(
  (select brand from public.update_ticket_association((select id from public.ticket_associations where line_key = 'x2'), 'Leche fresca', '  ')),
  null,
  'una marca en blanco es «sin identificar»'
);

-- Beto (plan básico) puede corregir y borrar lo suyo: no es de Premium.
reset role;
insert into public.ticket_associations (user_id, line_key, store_key, name, brand, source)
values ('5b5b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'yogur', 'dia', 'Yogur', 'Danone', 'manual');
set local role authenticated;
set local request.jwt.claims = '{"sub":"5b5b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}';
select is(
  (select brand from public.update_ticket_association((select id from public.ticket_associations where line_key = 'yogur'), 'Yogur', 'Otra')),
  'Otra',
  'quien ya no es premium puede corregir lo suyo'
);
delete from public.ticket_associations where line_key = 'yogur';
select is((select count(*) from public.ticket_associations), 0::bigint, 'y borrarlo');

-- ══════════════════════════════════════════════════════════════════════════
-- G · Borrar un producto no borra lo confirmado; borrar la cuenta, todo
-- ══════════════════════════════════════════════════════════════════════════

reset role;
select is(
  (select product_id from public.ticket_associations where line_key = 'leche entera 1l' and store_key = 'mercadona'),
  null,
  'la corrección a mano ya no apuntaba al producto del catálogo'
);

insert into public.products (household_id, name, brand, data_source)
values (current_setting('opsi.piso_ana')::uuid, 'Producto efímero', 'Z', 'user');
insert into public.ticket_associations (user_id, line_key, store_key, product_id, name, brand, source)
values ('5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'efimero', 'lidl', (select id from public.products where name = 'Producto efímero'), 'Producto efímero', 'Z', 'catalog');
delete from public.products where name = 'Producto efímero';
select ok(
  (select product_id is null and name = 'Producto efímero' and brand = 'Z'
     from public.ticket_associations where line_key = 'efimero'),
  'borrar el producto deja la asociación sin enlace pero con el nombre y la marca confirmados'
);

-- ══════════════════════════════════════════════════════════════════════════
-- H · El tope por persona: si ya hay 2000 y llega una nueva, sale la más antigua
-- ══════════════════════════════════════════════════════════════════════════

delete from public.ticket_associations where user_id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
insert into public.ticket_associations (user_id, line_key, store_key, name, source, updated_at)
select '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'clave ' || g, '', 'Producto ' || g, 'manual', now() - (g || ' minutes')::interval
  from generate_series(1, 2000) g;
-- La más antigua es la de «clave 2000» (hace 2000 minutos).

set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';
select lives_ok(
  $$select public.confirm_ticket_association('nueva', '', 'Nueva', null, null, null, null, null, 'manual', null)$$,
  'una nueva con 2000 ya guardadas entra…'
);
select is((select count(*) from public.ticket_associations), 2000::bigint, '…y siguen siendo 2000');
select is(
  (select count(*) from public.ticket_associations where line_key in ('clave 2000', 'nueva')),
  1::bigint,
  'ha salido la que hacía más tiempo que no se tocaba, y está la nueva'
);
select is(
  (select count(*) from public.ticket_associations where line_key = 'nueva'),
  1::bigint,
  'la nueva está'
);
select lives_ok(
  $$select public.confirm_ticket_association('clave 1', '', 'Producto 1', null, null, null, null, null, 'manual', null)$$,
  'confirmar otra vez una que ya existe no expulsa a nadie'
);
select is((select count(*) from public.ticket_associations), 2000::bigint, 'y siguen siendo 2000');

-- ══════════════════════════════════════════════════════════════════════════
-- I · Buscar en el catálogo
-- ══════════════════════════════════════════════════════════════════════════

-- La base de datos local puede traer más productos globales de otras pruebas: se mira lo que debe y lo que no debe estar.
select ok(
  (select array_agg(name) from public.search_catalog(array['leche'], current_setting('opsi.nev_ana')::uuid))
    @> array['Leche de la abuela', 'Leche entera']
  and not (select array_agg(name) from public.search_catalog(array['leche'], current_setting('opsi.nev_ana')::uuid))
    && array['Leche del piso', 'Leche secreta de Cris'],
  'por palabra: el global y los privados de ESA nevera, y nada de los privados de otra persona ni de otra nevera'
);
select ok(
  (select array_agg(name) from public.search_catalog(array['leche'], current_setting('opsi.piso_ana')::uuid))
    @> array['Leche del piso', 'Leche entera']
  and not (select array_agg(name) from public.search_catalog(array['leche'], current_setting('opsi.piso_ana')::uuid))
    && array['Leche de la abuela', 'Leche secreta de Cris'],
  'con la otra nevera, salen los de esa y no los de la primera'
);
select ok(
  (select array_agg(name) from public.search_catalog(array['pure'], current_setting('opsi.nev_ana')::uuid))
    @> array['Puré de calabaza'],
  'sin acentos: «pure» encuentra «Puré»'
);
select ok(
  (select array_agg(name) from public.search_catalog(array['hacendado'], current_setting('opsi.nev_ana')::uuid))
    @> array['Puré de calabaza'],
  'también por la marca'
);
select is(
  (select count(*) from public.search_catalog(array['%%', '_', 'le', 'a''b'], current_setting('opsi.nev_ana')::uuid)),
  0::bigint,
  'los comodines, las palabras cortas y las comillas no encuentran nada'
);
select is(
  (select name from public.search_catalog(array[]::text[], current_setting('opsi.nev_ana')::uuid, '8410128010096')),
  'Leche entera',
  'por código de barras, aunque no haya palabras'
);
select is(
  (select name from public.search_catalog(array['leche', 'entera'], current_setting('opsi.nev_ana')::uuid) limit 1),
  'Leche entera',
  'los que más palabras aciertan, primero'
);
select is(
  (select count(*) from public.search_catalog(array['secreta'], current_setting('opsi.nev_ana')::uuid)),
  0::bigint,
  'el producto privado de Cris no aparece aunque se busque por su nombre'
);
select ok(
  (select array_agg(name) from public.search_catalog(array['leche'], current_setting('opsi.nev_cris')::uuid))
    @> array['Leche entera']
  and not (select array_agg(name) from public.search_catalog(array['leche'], current_setting('opsi.nev_cris')::uuid))
    && array['Leche secreta de Cris', 'Leche de la abuela', 'Leche del piso'],
  'y pedir con la nevera de Cris no enseña sus productos a Ana (solo el global)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- J · Un producto privado por nombre y marca
-- ══════════════════════════════════════════════════════════════════════════

select lives_ok(
  format($f$select public.ensure_private_product(%L::uuid, 'Pan de pueblo', 'Horno de Lola')$f$, current_setting('opsi.nev_ana')),
  'se crea el producto privado'
);
select set_config('opsi.pan', public.ensure_private_product(current_setting('opsi.nev_ana')::uuid, 'Pan de pueblo', 'Horno de Lola')::text, true);
select is(
  public.ensure_private_product(current_setting('opsi.nev_ana')::uuid, '  PAN DE PUEBLO ', 'horno de lola')::text,
  current_setting('opsi.pan'),
  'el mismo artículo (sin distinguir mayúsculas ni espacios) devuelve el mismo producto'
);
select ok(
  public.ensure_private_product(current_setting('opsi.nev_ana')::uuid, 'Pan de pueblo', 'Otra panadería')::text
    is distinct from current_setting('opsi.pan'),
  'con otra marca es otro producto'
);
select ok(
  public.ensure_private_product(current_setting('opsi.nev_ana')::uuid, 'Pan de pueblo', null)::text
    is distinct from current_setting('opsi.pan'),
  'y sin marca, también'
);
select is(
  public.ensure_private_product(current_setting('opsi.nev_ana')::uuid, 'Pan de pueblo', '')::text,
  public.ensure_private_product(current_setting('opsi.nev_ana')::uuid, 'pan de pueblo', null)::text,
  'una marca vacía es sin marca'
);
select is(
  (select count(*) from public.products where household_id = current_setting('opsi.nev_ana')::uuid and name = 'Pan de pueblo'),
  3::bigint,
  'en total, tres productos (una marca, otra y ninguna): no uno por llamada'
);
select ok(
  (select barcode is null and data_source = 'user' and household_id = current_setting('opsi.nev_ana')::uuid
     from public.products where id = current_setting('opsi.pan')::uuid),
  'es privado, de la nevera pedida, sin código de barras y de origen «user»'
);
select is(
  public.zz_error_de(format($f$select public.ensure_private_product(%L::uuid, 'Pan', null)$f$, current_setting('opsi.nev_cris'))),
  'P0002/', 'en una nevera ajena, P0002'
);
select is(
  public.zz_error_de(format($f$select public.ensure_private_product(%L::uuid, '   ', null)$f$, current_setting('opsi.nev_ana'))),
  '22023/', 'un nombre en blanco no vale'
);

-- ══════════════════════════════════════════════════════════════════════════
-- K · El cupo de búsquedas hacia Open Food Facts
-- ══════════════════════════════════════════════════════════════════════════

reset role;
delete from public.lookup_usage where clave like 'os:%' or clave = 'offs:m';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select ok(
  (select concedidas = 6 and reintentar_en = 0 from public.consume_off_search(6)),
  'caben 6 de las 10 del minuto'
);
select is(
  (select concedidas from public.consume_off_search(6)),
  4,
  'las 6 siguientes: solo caben 4 (quedaban 4)'
);
select ok(
  (select reintentar_en from public.consume_off_search(1)) between 1 and 60,
  'y cuando no cabe, dice cuánto esperar (menos de un minuto)'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c5c0003-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';
select is(
  (select concedidas from public.consume_off_search(1)),
  0,
  'el tope del minuto es de TODAS las personas: Cris tampoco puede'
);

-- Pasado el minuto, vuelve a caber. El tope por persona (60 a la hora) es aparte.
reset role;
delete from public.lookup_usage where clave = 'offs:m';
update public.lookup_usage set n = 58 where clave = 'os:5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1:h';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';
select ok(
  (select concedidas = 2 and reintentar_en between 1 and 3600 from public.consume_off_search(5)),
  'con 58 de 60 gastadas a la hora, de 5 pedidas se conceden 2 y se dice cuánto falta para la hora siguiente'
);
reset role;
select is(
  (select n from public.lookup_usage where clave = 'offs:m'),
  2,
  'y al global solo le cuentan las 2 concedidas: una cuenta que insiste no agota el cupo de las demás'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';
select is((select concedidas from public.consume_off_search(3)), 0, 'agotada la hora, ninguna');
reset role;
select is(
  (select n from public.lookup_usage where clave = 'offs:m'),
  2,
  'y sin tocar el global'
);

reset role;
delete from public.lookup_usage where clave = 'offs:m';
set local role authenticated;
set local request.jwt.claims = '{"sub":"5c5c0003-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';
select is((select concedidas from public.consume_off_search(500)), 10, 'pedir una barbaridad se acota (12) y al cupo del minuto (10)');

-- ══════════════════════════════════════════════════════════════════════════
-- L · Todo se va con la cuenta
-- ══════════════════════════════════════════════════════════════════════════

reset role;

select ok((select count(*) from public.ticket_associations where user_id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1') > 0, 'Ana tiene asociaciones');
delete from auth.users where id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
select is(
  (select count(*) from public.ticket_associations where user_id = '5a5a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  0::bigint,
  'al borrar la cuenta se borran'
);

select * from finish();
rollback;
