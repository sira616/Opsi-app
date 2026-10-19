-- ═══════════════════════════════════════════════════════════════════════════
-- Consentimiento explícito para los datos de salud, y borrarlos
--
-- Lo que se comprueba (20261023100000):
--   · Sin permiso (`consent_version`) el servidor no guarda una lista de salud no
--     vacía. Una lista vacía sí: así se crea la fila solo con el permiso.
--   · La fecha del permiso (`consented_at`) la pone el servidor. La persona no puede
--     escribirla, y no cambia mientras la versión no cambie.
--   · Retirar el permiso sin vaciar la lista no se puede; y borrar la fila sí: es el
--     derecho de supresión. Solo la propia.
--   · Las filas de antes del permiso (sin versión) siguen ahí y no se tocan, pero no
--     se pueden cambiar sin dar el permiso primero.
--
-- El resto de la tabla (RLS entre personas, lista cerrada, permisos de anon y
-- service_role) está en `salud_test.sql`.
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
  ('00000000-0000-0000-0000-000000000000', 'eeee5555-eeee-4eee-8eee-eeee55555555',
   'authenticated', 'authenticated', 'eva@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'ffff6666-ffff-4fff-8fff-ffff66666666',
   'authenticated', 'authenticated', 'fran@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'abab7777-abab-4bab-8bab-abab77777777',
   'authenticated', 'authenticated', 'gus@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Eva da su permiso y guarda lo que evita
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeee5555-eeee-4eee-8eee-eeee55555555","role":"authenticated"}';

select lives_ok(
  $$insert into public.user_health_preferences (user_id, avoid, consent_version)
    values ('eeee5555-eeee-4eee-8eee-eeee55555555', '{}', 1)$$,
  'se crea la fila solo con el permiso, antes de marcar nada'
);

select is(
  (select consented_at = now() from public.user_health_preferences
    where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'),
  true,
  'y la fecha del permiso la pone el servidor'
);

select lives_ok(
  $$update public.user_health_preferences set avoid = '{milk,gluten}'
     where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'$$,
  'con el permiso dado, guarda lo que evita'
);

-- La persona no escribe la fecha: ni al crear ni al cambiar.
select throws_ok(
  $$update public.user_health_preferences set consented_at = now() - interval '5 years'
     where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'$$,
  '42501', null,
  'no puede escribir la fecha del permiso'
);

-- Una fecha antigua, puesta sin el trigger, para ver que no cambia con la misma versión.
reset role;
alter table public.user_health_preferences disable trigger user_health_preferences_consent;
update public.user_health_preferences set consented_at = now() - interval '2 days'
 where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555';
alter table public.user_health_preferences enable trigger user_health_preferences_consent;

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeee5555-eeee-4eee-8eee-eeee55555555","role":"authenticated"}';

select lives_ok(
  $$update public.user_health_preferences set avoid = '{milk}'
     where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'$$,
  'cambia la lista con la misma versión del permiso'
);

select is(
  (select consented_at < now() - interval '1 day' from public.user_health_preferences
    where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'),
  true,
  'y la fecha del permiso no se mueve'
);

select lives_ok(
  $$update public.user_health_preferences set consent_version = 2
     where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'$$,
  'aceptar una versión nueva del aviso'
);

select is(
  (select consented_at = now() from public.user_health_preferences
    where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'),
  true,
  'renueva la fecha del permiso'
);

select throws_ok(
  $$update public.user_health_preferences set consent_version = 0
     where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'$$,
  '23514', null,
  'la versión del permiso empieza en 1'
);

-- Retirar el permiso sin vaciar lo guardado no se puede: dejaría un dato de salud sin permiso.
select throws_ok(
  $$update public.user_health_preferences set consent_version = null
     where user_id = 'eeee5555-eeee-4eee-8eee-eeee55555555'$$,
  'P0001', 'Antes de guardar lo que evitas necesito tu permiso.',
  'no se retira el permiso dejando la lista guardada'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Fran intenta guardar sin permiso
-- ══════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"ffff6666-ffff-4fff-8fff-ffff66666666","role":"authenticated"}';

select throws_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('ffff6666-ffff-4fff-8fff-ffff66666666', '{fish}')$$,
  'P0001', 'Antes de guardar lo que evitas necesito tu permiso.',
  'sin permiso no se guarda una lista de salud (el mensaje es el del servidor, en español)'
);

select is(
  (select count(*) from public.user_health_preferences),
  0::bigint,
  'y no queda ninguna fila a medias'
);

select lives_ok(
  $$insert into public.user_health_preferences (user_id, avoid)
    values ('ffff6666-ffff-4fff-8fff-ffff66666666', '{}')$$,
  'una lista vacía no es un dato de salud: se puede guardar sin permiso'
);

select throws_ok(
  $$update public.user_health_preferences set avoid = '{fish}'
     where user_id = 'ffff6666-ffff-4fff-8fff-ffff66666666'$$,
  'P0001', 'Antes de guardar lo que evitas necesito tu permiso.',
  'tampoco se rellena sin permiso después'
);

select lives_ok(
  $$update public.user_health_preferences set consent_version = 1, avoid = '{fish}'
     where user_id = 'ffff6666-ffff-4fff-8fff-ffff66666666'$$,
  'dando el permiso y la lista a la vez, sí'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'ffff6666-ffff-4fff-8fff-ffff66666666'),
  array['fish'],
  'y queda guardada'
);

select lives_ok(
  $$update public.user_health_preferences set avoid = '{}', consent_version = null
     where user_id = 'ffff6666-ffff-4fff-8fff-ffff66666666'$$,
  'vaciar la lista y retirar el permiso a la vez, sí'
);

select is(
  (select consented_at is null from public.user_health_preferences
    where user_id = 'ffff6666-ffff-4fff-8fff-ffff66666666'),
  true,
  'y sin permiso no queda fecha'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Una fila de antes del permiso (sin versión, con lista)
-- ══════════════════════════════════════════════════════════════════════════

reset role;
alter table public.user_health_preferences disable trigger user_health_preferences_consent;
insert into public.user_health_preferences (user_id, avoid)
values ('abab7777-abab-4bab-8bab-abab77777777', '{milk}');
alter table public.user_health_preferences enable trigger user_health_preferences_consent;

set local role authenticated;
set local request.jwt.claims = '{"sub":"abab7777-abab-4bab-8bab-abab77777777","role":"authenticated"}';

select is(
  (select avoid from public.user_health_preferences where user_id = 'abab7777-abab-4bab-8bab-abab77777777'),
  array['milk'],
  'la fila de antes sigue ahí: no se borra ni se inventa un permiso'
);

select is(
  (select consent_version is null and consented_at is null from public.user_health_preferences
    where user_id = 'abab7777-abab-4bab-8bab-abab77777777'),
  true,
  'y sigue sin permiso'
);

select throws_ok(
  $$update public.user_health_preferences set avoid = '{eggs}'
     where user_id = 'abab7777-abab-4bab-8bab-abab77777777'$$,
  'P0001', 'Antes de guardar lo que evitas necesito tu permiso.',
  'no se cambia sin dar el permiso antes'
);

select lives_ok(
  $$update public.user_health_preferences set consent_version = 1
     where user_id = 'abab7777-abab-4bab-8bab-abab77777777'$$,
  'dar el permiso a lo que ya había'
);

select is(
  (select avoid from public.user_health_preferences where user_id = 'abab7777-abab-4bab-8bab-abab77777777'),
  array['milk'],
  'y lo guardado se conserva'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Borrar lo guardado (retirar el permiso y el dato)
-- ══════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"ffff6666-ffff-4fff-8fff-ffff66666666","role":"authenticated"}';

with borradas as (
  delete from public.user_health_preferences
   where user_id = 'abab7777-abab-4bab-8bab-abab77777777'
  returning 1
)
select is((select count(*) from borradas), 0::bigint, 'Fran no borra la fila de Gus: la RLS no se la deja ver');

set local request.jwt.claims = '{"sub":"abab7777-abab-4bab-8bab-abab77777777","role":"authenticated"}';

with borradas as (
  delete from public.user_health_preferences
   where user_id = 'abab7777-abab-4bab-8bab-abab77777777'
  returning 1
)
select is((select count(*) from borradas), 1::bigint, 'Gus borra la suya');

select is(
  (select count(*) from public.user_health_preferences),
  0::bigint,
  'y no queda nada de él'
);

select lives_ok(
  $$insert into public.user_health_preferences (user_id, avoid, consent_version)
    values ('abab7777-abab-4bab-8bab-abab77777777', '{sesame}', 1)$$,
  'puede volver a empezar de cero: dar el permiso otra vez y guardar'
);

reset role;

select is(
  (select count(*) from public.user_health_preferences
    where user_id in ('eeee5555-eeee-4eee-8eee-eeee55555555', 'ffff6666-ffff-4fff-8fff-ffff66666666',
                      'abab7777-abab-4bab-8bab-abab77777777')),
  3::bigint,
  'en total quedan las tres filas de la prueba: Eva, Fran (sin permiso y vacía) y Gus'
);

select ok(
  not has_function_privilege('anon', 'public.check_health_consent()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.check_health_consent()', 'EXECUTE'),
  'la función del trigger no la ejecuta nadie a mano'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ~* 'user_health_preferences'),
  0::bigint,
  'y ninguna función de public sigue leyendo las preferencias de salud'
);

select * from finish();

rollback;
