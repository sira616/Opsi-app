-- ═══════════════════════════════════════════════════════════════════════════
-- Cuota de mensajes del chat, por persona (20261026100000)
--
-- Lo que se comprueba:
--   · Cabe lo que dice el tope (20 por hora, 100 al día) y lo siguiente no, diciendo cuánto falta.
--   · Es POR PERSONA: lo de una no gasta la cuota de otra, y quién es sale de la sesión.
--   · Las ventanas se deslizan: pasada la hora vuelve a caber; el tope diario manda aunque la
--     hora esté libre.
--   · Nadie toca la tabla a mano (ni `authenticated`, ni `anon`, ni `service_role`), y solo
--     quien tiene sesión llama a la función: anon, no; sin sesión, 28000.
--   · Lo viejo se limpia, y todo se va con la cuenta.
--   · El chat es de Premium (20261027100000): quien tiene el plan básico recibe 42501 con pista
--     `premium` y no gasta ni apunta nada.
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
  ('00000000-0000-0000-0000-000000000000', '4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'authenticated', 'authenticated', 'ines@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '4b4b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
   'authenticated', 'authenticated', 'jon@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '4c4c0003-cccc-4ccc-8ccc-ccccccccccc3',
   'authenticated', 'authenticated', 'kira@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4',
   'authenticated', 'authenticated', 'leo@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '4e4e0005-eeee-4eee-8eee-eeeeeeeeeee5',
   'authenticated', 'authenticated', 'mia@usuarios.opsi.local', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

-- El chat es de Premium: Inés, Jon, Kira y Leo lo son; Mía se queda en el plan básico.
update public.user_settings set plan = 'premium'
 where user_id in (
   '4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '4b4b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
   '4c4c0003-cccc-4ccc-8ccc-ccccccccccc3',
   '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4'
 );

-- ══════════════════════════════════════════════════════════════════════════
-- A · Permisos
-- ══════════════════════════════════════════════════════════════════════════

select ok(
  has_function_privilege('authenticated', 'public.use_chat_quota()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.use_chat_quota()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.use_chat_quota()', 'EXECUTE'),
  'solo authenticated ejecuta la función de la cuota (ni anon ni service_role)'
);

select ok(
  not exists (
    select 1
      from unnest(array['anon', 'authenticated', 'service_role']) as r(rol),
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(permiso)
     where has_table_privilege(r.rol, 'public.chat_usage', p.permiso)
  )
  and not exists (
    select 1
      from unnest(array['anon', 'authenticated', 'service_role']) as r(rol),
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p(permiso)
     where has_any_column_privilege(r.rol, 'public.chat_usage', p.permiso)
  ),
  'nadie tiene NINGÚN permiso sobre la tabla del uso: solo la función la toca'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_usage'::regclass),
  'la RLS está puesta (y sin políticas: no se ve ni se escribe nada por la API)'
);

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'chat_usage'),
  0::bigint,
  'sin políticas'
);

select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'public.use_chat_quota()'::regprocedure)
    and (select 'search_path=""' = any (p.proconfig) from pg_proc p where p.oid = 'public.use_chat_quota()'::regprocedure),
  'es SECURITY DEFINER con el search_path vacío'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Inés gasta su cuota de la hora: caben 20 y la 21 no
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select is(
  -- Una llamada POR FILA: una función en el FROM que no depende de `g` se ejecutaría una sola vez
  -- y se repetiría su resultado, sin gastar la cuota las veinte veces.
  (select count(*) from (select (public.use_chat_quota()).allowed as cabe from generate_series(1, 20) g) s where s.cabe),
  20::bigint,
  'caben los 20 mensajes de la hora'
);

reset role;
select is(
  (select count(*) from public.chat_usage where user_id = '4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  20::bigint,
  'y se apuntan los 20, uno por mensaje'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select is(
  (select allowed from public.use_chat_quota()),
  false,
  'el 21 no cabe'
);

select ok(
  (select wait_s between 1 and 3600 from public.use_chat_quota()),
  'y dice cuánto falta: entre 1 segundo y una hora'
);

select throws_ok(
  $$select * from public.chat_usage$$,
  '42501', null,
  'la persona no lee la tabla a mano'
);
select throws_ok(
  $$insert into public.chat_usage (user_id) values ('4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$$,
  '42501', null,
  'ni escribe en ella'
);
select throws_ok(
  $$delete from public.chat_usage$$,
  '42501', null,
  'ni borra (así no se resetea la cuota)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Es por persona: Jon no paga lo de Inés
-- ══════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"sub":"4b4b0002-bbbb-4bbb-8bbb-bbbbbbbbbbb2","role":"authenticated"}';

select is(
  (select allowed from public.use_chat_quota()),
  true,
  'Jon, con su cuota entera, puede preguntar aunque Inés haya agotado la suya'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Las ventanas se deslizan
-- ══════════════════════════════════════════════════════════════════════════

reset role;

-- Inés lo gastó hace dos horas, no ahora: la hora vuelve a estar libre.
update public.chat_usage set used_at = now() - interval '2 hours'
 where user_id = '4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

set local role authenticated;
set local request.jwt.claims = '{"sub":"4a4a0001-aaaa-4aaa-8aaa-aaaaaaaaaaa1","role":"authenticated"}';

select is(
  (select allowed from public.use_chat_quota()),
  true,
  'pasada la hora vuelve a caber (la ventana se desliza)'
);

-- Kira: 100 mensajes hace 5 horas. La hora está libre pero el día no.
reset role;
insert into public.chat_usage (user_id, used_at)
select '4c4c0003-cccc-4ccc-8ccc-ccccccccccc3', now() - interval '5 hours' - (g || ' seconds')::interval
  from generate_series(1, 100) g;

set local role authenticated;
set local request.jwt.claims = '{"sub":"4c4c0003-cccc-4ccc-8ccc-ccccccccccc3","role":"authenticated"}';

select is(
  (select allowed from public.use_chat_quota()),
  false,
  'el tope del día manda aunque la hora esté libre'
);

select ok(
  (select wait_s between 60 * 60 * 18 and 60 * 60 * 19 + 200 from public.use_chat_quota()),
  'y la espera es hasta que caduque el más antiguo (unas 19 horas, no una)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · Sin sesión, y lo viejo se limpia
-- ══════════════════════════════════════════════════════════════════════════

set local request.jwt.claims = '{"role":"authenticated"}';

select throws_ok(
  $$select * from public.use_chat_quota()$$,
  '28000', 'Hace falta una sesión.',
  'sin sesión (sin sub) no se gasta nada de nadie'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.use_chat_quota()$$,
  '42501', null,
  'anon no llama a la función'
);

reset role;

-- Leo: tres filas de hace tres días: al usar la cuota se limpian.
insert into public.chat_usage (user_id, used_at)
select '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4', now() - interval '3 days' - (g || ' seconds')::interval
  from generate_series(1, 3) g;

set local role authenticated;
set local request.jwt.claims = '{"sub":"4d4d0004-dddd-4ddd-8ddd-ddddddddddd4","role":"authenticated"}';

select is((select allowed from public.use_chat_quota()), true, 'Leo pregunta con filas de hace tres días');

reset role;

select is(
  (select count(*) from public.chat_usage
    where user_id = '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4' and used_at < now() - interval '2 days'),
  0::bigint,
  'y las de más de dos días ya no están'
);

select is(
  (select count(*) from public.chat_usage where user_id = '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4'),
  1::bigint,
  'solo queda la de ahora'
);

-- La cuenta se lleva su uso.
delete from auth.users where id = '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4';

select is(
  (select count(*) from public.chat_usage where user_id = '4d4d0004-dddd-4ddd-8ddd-ddddddddddd4'),
  0::bigint,
  'al borrar la cuenta se va su uso con ella'
);

-- ══════════════════════════════════════════════════════════════�
-- F · El chat es de Premium
-- ══════════════════════════════════════════════════════════════�

set local role authenticated;
set local request.jwt.claims = '{"sub":"4e4e0005-eeee-4eee-8eee-eeeeeeeeeee5","role":"authenticated"}';

select is(public.my_plan(), 'basic', 'Mía está en el plan básico');

-- La Edge Function reconoce «es de Premium» por el par código + pista, no por el texto.
select is(
  public.zz_error_de($$select * from public.use_chat_quota()$$),
  '42501/premium',
  'con el plan básico el chat se rechaza con 42501 y la pista premium'
);

reset role;

select is(
  (select count(*) from public.chat_usage where user_id = '4e4e0005-eeee-4eee-8eee-eeeeeeeeeee5'),
  0::bigint,
  'lo rechazado no gasta ni apunta nada de cuota'
);

-- Se hace premium y ya puede: el plan lo decide el servidor, sin tocar nada más.
update public.user_settings set plan = 'premium' where user_id = '4e4e0005-eeee-4eee-8eee-eeeeeeeeeee5';

set local role authenticated;
set local request.jwt.claims = '{"sub":"4e4e0005-eeee-4eee-8eee-eeeeeeeeeee5","role":"authenticated"}';

select is((select allowed from public.use_chat_quota()), true, 'con el plan premium, Mía pregunta');

reset role;

select * from finish();

rollback;
