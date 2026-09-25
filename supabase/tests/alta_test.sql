-- ═══════════════════════════════════════════════════════════════════════════
-- El alta y la zona horaria: lo que el cliente NO puede decidir
--
-- Lo que llega del cliente al crear una cuenta o guardar un ajuste es entrada no
-- confiable, y hay dos sitios donde se coló:
--
--   · El nombre visible salía de `raw_user_meta_data`, que escribe el cliente:
--     con un `signUp` directo a GoTrue se podía tener la cuenta «admin».
--   · La zona horaria no se validaba: `Basura/Zona` rompe `today_for_user()` y,
--     con ella, la vista de prioridad de esa persona (y en la fase 3, el resumen
--     diario de todos).
--
-- Los dos se arreglaron en `20260924160000_alta_estricta` y
-- `20260924150000_zona_horaria_valida`, con la auditoría de seguridad
-- (docs/internal/AUDITORIA-2026-09-24.md, M1 y M5) como origen.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Cuántas neveras hay antes de empezar: la base puede traer las de las cuentas de
-- desarrollo, así que se compara contra esto y no contra un número fijo.
select set_config('opsi.neveras_antes', (select count(*) from public.households)::text, true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · El alta: solo usuarios de Opsi
-- ══════════════════════════════════════════════════════════════════════════

select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'paco@ejemplo.com', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'un correo real no crea una cuenta: el alta solo admite usuarios de Opsi'
);

select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', null, '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'ni una cuenta sin correo'
);

-- El dominio se compara con los puntos ESCAPADOS: en una expresión regular `.`
-- es «cualquier carácter», y sin escaparlo pasaría un dominio que solo se le
-- parece.
select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'paco@usuariosXopsiYlocal', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'un dominio que solo se parece al sintético (sin escapar los puntos) tampoco entra'
);

select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'ab@usuarios.opsi.local', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'un usuario de dos letras no cabe: el mínimo son tres'
);

select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'a.b.c@usuarios.opsi.local', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'ni con puntos ni símbolos: solo letras sin acentos, números y guion bajo'
);

-- Los nombres reservados, en cualquier combinación de mayúsculas.
select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'admin@usuarios.opsi.local', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'nadie se registra como «admin»'
);

select throws_ok(
  $$insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', 'OPSI@usuarios.opsi.local', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb)$$,
  '42501',
  null,
  'ni como «opsi», por mucho que las mayúsculas lo disfracen'
);

-- ── Lo importante: el nombre sale del CORREO, no de los metadatos ─────────
--
-- Antes de la migración esto creaba una cuenta llamada «admin» con un correo que
-- no tenía nada que ver.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000', 'aaaa0001-aaaa-4aaa-8aaa-aaaa00000001',
  'authenticated', 'authenticated', 'paco@usuarios.opsi.local', '',
  now(), now(), now(), '{}'::jsonb, '{"username": "admin"}'::jsonb
);

select is(
  (select s.username from public.user_settings s
    where s.user_id = 'aaaa0001-aaaa-4aaa-8aaa-aaaa00000001'),
  'paco',
  'un metadato «admin» con el correo de paco crea a paco, no a admin'
);

select is(
  (select count(*) from public.user_settings s where lower(s.username) = 'admin'),
  0::bigint,
  'y no existe ninguna cuenta llamada admin'
);

select is(
  (select count(*) from public.household_members m
    where m.user_id = 'aaaa0001-aaaa-4aaa-8aaa-aaaa00000001'),
  1::bigint,
  'y sigue teniendo su nevera privada, como cualquier cuenta'
);

-- Un rechazo no deja rastro a medias: el trigger falla antes de escribir nada.
-- Se intentaron siete altas que se rechazan y una que entra: solo esa última
-- puede haber creado una nevera.
select is(
  (select count(*) from public.households),
  current_setting('opsi.neveras_antes')::bigint + 1,
  'ningún rechazo dejó una nevera huérfana por el camino: solo existe la de paco'
);

-- Lo que NO se rompe: añadir un correo real DESPUÉS es un UPDATE, no un alta.
select lives_ok(
  $$update auth.users set email = 'paco@ejemplo.com'
      where id = 'aaaa0001-aaaa-4aaa-8aaa-aaaa00000001'$$,
  'añadir un correo real más adelante desde Ajustes sigue funcionando'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · La zona horaria tiene que existir
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0001-aaaa-4aaa-8aaa-aaaa00000001","role":"authenticated"}';

select throws_ok(
  $$update public.user_settings set timezone = 'Basura/Zona'$$,
  '22023',
  null,
  'una zona horaria inventada se rechaza en el servidor'
);

select lives_ok(
  $$update public.user_settings set timezone = 'Europe/Madrid'$$,
  'la de siempre entra'
);

select lives_ok(
  $$update public.user_settings set timezone = 'America/Argentina/Buenos_Aires'$$,
  'una con tres tramos también'
);

select lives_ok(
  $$update public.user_settings set timezone = 'Asia/Calcutta'$$,
  'una de las que el sistema nombra con su alias antiguo'
);

select lives_ok(
  $$update public.user_settings set timezone = 'Etc/UTC'$$,
  'y la UTC, que es lo que da el navegador a quien no tiene zona'
);

-- Cambiar otra cosa no paga la consulta al catálogo de zonas ni puede fallar
-- por ella: el trigger solo se dispara al tocar la columna.
select lives_ok(
  $$update public.user_settings set digest_hour = 9$$,
  'cambiar la hora del aviso no depende de la zona'
);

-- ── Lo que se guardó vale siempre: la vista de prioridad no revienta ───────
select lives_ok(
  $$select count(*) from public.inventory_with_priority$$,
  'con una zona válida, la vista de prioridad responde'
);

reset role;

select * from finish();
rollback;
