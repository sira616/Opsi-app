-- ═══════════════════════════════════════════════════════════════════════════
-- Aislamiento entre hogares · CRITERIO DE SALIDA DE LA FASE 0
--
--   «Un usuario se registra, tiene su hogar creado y no puede leer datos de
--    otro usuario, probado con dos cuentas.»
--
-- Si este fichero pasa, la frontera entre hogares es real. Si alguien quita
-- una política, deja de pasar. Por eso se escribe ahora, con siete tablas, y
-- no en la fase 5, cuando ya no se escribiría nunca.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

-- Sin plan fijo a propósito: un plan(N) mal contado falla por una razón que no
-- tiene nada que ver con la seguridad. Cuando el fichero se estabilice, pasar
-- a plan(N) para detectar además los tests que no llegan a ejecutarse.
select no_plan();

-- ── Dos cuentas ───────────────────────────────────────────────────────────
-- El trigger on_auth_user_created hace el resto: hogar, pertenencia y ajustes.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000', '1111aaaa-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'ana@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '2222bbbb-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'bruno@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

-- Los identificadores se guardan como ajustes de la transacción, no en una
-- tabla temporal: una tabla creada por `postgres` no la podría leer el rol
-- `authenticated`, y medio test se caería por un problema de permisos que no
-- es el que se quiere probar.
select set_config('opsi.ana', '1111aaaa-1111-4111-8111-111111111111', true);
select set_config('opsi.bruno', '2222bbbb-2222-4222-8222-222222222222', true);
select set_config(
  'opsi.ana_household',
  (select household_id::text from public.household_members
    where user_id = current_setting('opsi.ana')::uuid),
  true
);
select set_config(
  'opsi.bruno_household',
  (select household_id::text from public.household_members
    where user_id = current_setting('opsi.bruno')::uuid),
  true
);

-- ── El alta deja el hogar montado ─────────────────────────────────────────

select ok(
  current_setting('opsi.ana_household', true) is not null,
  'registrarse crea el hogar personal'
);

select ok(
  current_setting('opsi.ana_household') <> current_setting('opsi.bruno_household'),
  'cada usuario tiene su propio hogar'
);

select is(
  (select role::text from public.household_members
    where user_id = current_setting('opsi.ana')::uuid),
  'owner',
  'el usuario es owner de su hogar'
);

-- Acotado a las dos cuentas del test, y no contando la tabla entera: esto
-- corre como `postgres`, o sea sin RLS, y la base ya trae al usuario de
-- desarrollo que siembra supabase/seed. Contar todo hacia depender el test de
-- cuanta gente haya en los seeds, que no es lo que se quiere probar.
select is(
  (select count(*) from public.user_settings s
    where s.user_id in (current_setting('opsi.ana')::uuid,
                        current_setting('opsi.bruno')::uuid)), 2::bigint,
  'el alta crea los ajustes de cada usuario'
);

select is(
  (select bool_or(s.auto_add_to_shopping_list) from public.user_settings s
    where s.user_id in (current_setting('opsi.ana')::uuid,
                        current_setting('opsi.bruno')::uuid)), false,
  'el anadido automatico a la lista viene desactivado (principio del proyecto)'
);

-- ── El usuario es la identidad ────────────────────────────────────────────

select is(
  (select username from public.user_settings
    where user_id = current_setting('opsi.ana')::uuid),
  'ana',
  'el alta guarda el nombre de usuario'
);

select throws_ok(
  format(
    $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
        'authenticated', 'ANA@%s', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
    public.dominio_sintetico()
  ),
  '23505',
  null,
  'el nombre de usuario es unico sin distinguir mayusculas'
);

-- A partir de aqui como Ana, y no como el dueno de la base: mi_correo() se
-- resuelve con auth.uid(), y sin sesion devolveria null pasase lo que pasase.
set local role authenticated;
set local request.jwt.claims = '{"sub":"1111aaaa-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  public.mi_correo(),
  null,
  'mi_correo() devuelve null mientras el correo sea sintetico'
);

-- La inmutabilidad del usuario no es una regla de la app: la columna no tiene
-- UPDATE concedido, asi que el intento muere en el motor.
select throws_ok(
  $$update public.user_settings set username = 'otro'$$,
  '42501',
  null,
  'el nombre de usuario no se puede cambiar desde el cliente'
);

select lives_ok(
  $$update public.user_settings set digest_hour = 8$$,
  'pero el resto de los ajustes si se puede cambiar'
);

-- ── Ana llena su despensa ─────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"1111aaaa-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.inventory_items
  (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity,
   limit_date, date_kind, date_source, created_by)
values
  (current_setting('opsi.ana_household')::uuid, 'Leche entera', 'volume', 'l', 1000, 1000,
   current_date + 7, 'best_before', 'package', current_setting('opsi.ana')::uuid);

insert into public.shopping_list_items (household_id, name, created_by)
values (current_setting('opsi.ana_household')::uuid, 'Huevos', current_setting('opsi.ana')::uuid);

insert into public.inventory_events (household_id, user_id, type)
values (current_setting('opsi.ana_household')::uuid, current_setting('opsi.ana')::uuid, 'created');

select is(
  (select count(*) from public.inventory_items), 1::bigint,
  'Ana ve su propio inventario'
);

select is(
  (select count(*) from public.households), 1::bigint,
  'Ana ve su hogar, y solo el suyo'
);

-- ── Bruno no ve nada de Ana ───────────────────────────────────────────────

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"2222bbbb-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*) from public.inventory_items), 0::bigint,
  'Bruno NO ve el inventario de Ana'
);

select is(
  (select count(*) from public.inventory_events), 0::bigint,
  'Bruno NO ve los eventos de Ana'
);

select is(
  (select count(*) from public.shopping_list_items), 0::bigint,
  'Bruno NO ve la lista de la compra de Ana'
);

select is(
  (select count(*) from public.households), 1::bigint,
  'Bruno solo ve su propio hogar'
);

select is(
  (select count(*) from public.household_members), 1::bigint,
  'Bruno solo ve su propia pertenencia'
);

select is(
  (select count(*) from public.user_settings), 1::bigint,
  'Bruno solo ve sus propios ajustes'
);

-- ── Bruno tampoco puede escribir en casa de Ana ───────────────────────────

select throws_ok(
  format(
    $$insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity)
      values (%L, 'Intruso', 'count', 'unit', 1, 1)$$,
    current_setting('opsi.ana_household')
  ),
  '42501',
  null,
  'Bruno NO puede insertar en el hogar de Ana'
);

-- Un UPDATE o un DELETE bloqueados por RLS no lanzan error: simplemente no
-- encuentran filas. Por eso aquí se comprueba contando, no esperando una
-- excepcion. Es la diferencia que hace que estos dos casos se cuelen si el
-- test solo busca errores.
update public.inventory_items set name = 'Secuestrado';
delete from public.inventory_items;

reset role;

select is(
  (select count(*) from public.inventory_items
    where household_id = current_setting('opsi.ana_household')::uuid), 1::bigint,
  'el elemento de Ana sigue ahi tras el UPDATE y el DELETE de Bruno'
);

select is(
  (select count(*) from public.inventory_items where name = 'Secuestrado'), 0::bigint,
  'Bruno NO pudo modificar el elemento de Ana'
);

-- ── El registro de eventos es inmutable para todo el mundo ────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"1111aaaa-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$update public.inventory_events set type = 'discarded'$$,
  '42501',
  null,
  'ni el dueno puede reescribir un evento'
);

select throws_ok(
  $$delete from public.inventory_events$$,
  '42501',
  null,
  'ni el dueno puede borrar un evento'
);

-- ── Sin sesion no se ve nada ──────────────────────────────────────────────

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from public.inventory_items$$,
  '42501',
  null,
  'anon no tiene ni permiso de lectura sobre el inventario'
);

reset role;

select * from finish();
rollback;
