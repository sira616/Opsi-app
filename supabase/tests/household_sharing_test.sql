-- ═══════════════════════════════════════════════════════════════════════════
-- Neveras: privada + compartidas · lo que tiene que seguir siendo verdad
--
-- El fichero hermano (rls_isolation_test.sql) prueba que dos hogares no se ven.
-- Este prueba lo contrario y lo que cuesta: que se VEAN cuando toca, que dejen
-- de verse en cuanto alguien sale, y que ninguna regla de negocio se pueda
-- saltar desde el cliente, porque todas se comprueban en el servidor.
--
-- El modelo, para quien llegue aquí sin haber leído las migraciones:
--
--   · Cada persona tiene UNA nevera privada, que no se comparte nunca.
--   · Además puede crear neveras compartidas, invitar gente y estar en otras.
--   · Aceptar una invitación AÑADE una pertenencia; no saca de ninguna.
--   · El límite es de neveras por persona (user_settings.household_limit: 2 hoy,
--     5 con un plan de pago), y el cliente no puede subírselo.
--
-- La historia va en orden y cada trozo depende del anterior. Leído de arriba
-- abajo cuenta el ciclo de vida entero: Ana crea «Piso», invita a Bruno y a
-- Carla, entran, se rechazan y cancelan invitaciones, Ana traspasa y se va, y
-- la última persona en salir deja la nevera huérfana.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- Devuelve «SQLSTATE/hint» de lo que lance la sentencia, o «sin error». La app
-- distingue los casos por el `hint` (es el contrato: los mensajes se pueden
-- reescribir, la pista no), así que lo que hay que probar es el par entero.
-- pgTAP solo sabe comparar el SQLSTATE.
create function public.test_error_de(p_sql text)
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

grant execute on function public.test_error_de(text) to authenticated, anon;

-- Cuando lo que importa es que FALLE y el motivo es lo de menos (o depende del
-- rol y del orden de las comprobaciones, que no son parte del contrato).
create function public.isnt_sin_error(p_error text, p_desc text)
returns text
language sql
as $$ select ok(p_error <> 'sin error', p_desc) $$;

grant execute on function public.isnt_sin_error(text, text) to authenticated, anon;

-- ── Cinco cuentas ─────────────────────────────────────────────────────────
-- El trigger on_auth_user_created hace el resto: a cada una su nevera privada,
-- su pertenencia como owner y sus ajustes con el nombre de usuario.
--
--   ana     dueña de «Piso»
--   bruno   entra en Piso, luego es dueño y al final el último en irse
--   carla   entra en Piso y la echan
--   dani    la invitación que se rechaza, se cancela, caduca, y quien topa con
--           su límite de neveras al aceptar
--   erika   el plan de pago y el ritmo de invitaciones

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
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'eeee5555-eeee-4eee-8eee-eeee55555555',
   'authenticated', 'authenticated', 'erika@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.ana',   'aaaa1111-aaaa-4aaa-8aaa-aaaa11111111', true);
select set_config('opsi.bruno', 'bbbb2222-bbbb-4bbb-8bbb-bbbb22222222', true);
select set_config('opsi.carla', 'cccc3333-cccc-4ccc-8ccc-cccc33333333', true);
select set_config('opsi.dani',  'dddd4444-dddd-4ddd-8ddd-dddd44444444', true);
select set_config('opsi.erika', 'eeee5555-eeee-4eee-8eee-eeee55555555', true);

select set_config('opsi.priv_ana',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.ana')::uuid), true);
select set_config('opsi.priv_bruno',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.bruno')::uuid), true);
select set_config('opsi.priv_carla',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.carla')::uuid), true);
select set_config('opsi.priv_dani',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.dani')::uuid), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · La privada: una, de una persona, y con su icono
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*) from public.household_members m
    where m.user_id = current_setting('opsi.ana')::uuid),
  1::bigint,
  'una cuenta nueva tiene una sola pertenencia: su nevera'
);

select is(
  (select h.kind::text from public.households h
    where h.id = current_setting('opsi.priv_ana')::uuid),
  'personal',
  'y es privada'
);

select is(
  (select h.member_limit from public.households h
    where h.id = current_setting('opsi.priv_ana')::uuid),
  1::smallint,
  'de una sola persona: no hay a quién invitar'
);

select ok(
  (select h.icon in (select i.key from public.household_icons i)
     from public.households h
    where h.id = current_setting('opsi.priv_ana')::uuid),
  'con un icono de la lista, desde el primer día'
);

select is(
  (select s.household_limit from public.user_settings s
    where s.user_id = current_setting('opsi.ana')::uuid),
  2::smallint,
  'el plan de hoy permite dos neveras: la tuya y una compartida'
);

-- Un alimento en cada nevera de Ana, para saber después quién ve qué.
insert into public.inventory_items
  (household_id, name, category, unit_family, display_unit,
   initial_quantity, remaining_quantity, created_by)
values
  (current_setting('opsi.priv_ana')::uuid, 'Merluza privada', 'pescado', 'mass', 'g',
   500, 500, current_setting('opsi.ana')::uuid);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Crear una compartida, y el tope
-- ══════════════════════════════════════════════════════════════════════════

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select set_config('opsi.piso',
  (select h.id::text from public.create_shared_household('Piso', 'couch') h), true);

select is(
  (select count(*) from public.my_households()),
  2::bigint,
  'Ana ya tiene dos neveras: la suya y la compartida'
);

select is(
  (select m.kind::text from public.my_households() m
    where m.id = current_setting('opsi.piso')::uuid),
  'shared',
  'la nueva es compartida'
);

select is(
  (select m.role::text from public.my_households() m
    where m.id = current_setting('opsi.piso')::uuid),
  'owner',
  'y Ana es su dueña'
);

select is(
  (select m.member_limit from public.my_households() m
    where m.id = current_setting('opsi.piso')::uuid),
  5::smallint,
  'caben cinco personas: el plan no lo controla, lo controla la nevera'
);

select is(
  (select m.icon from public.my_households() m
    where m.id = current_setting('opsi.piso')::uuid),
  'couch',
  'con el icono que eligió'
);

select is(
  public.test_error_de($$select public.create_shared_household('Otra', 'house')$$),
  'P0001/limite_neveras',
  'una tercera nevera no cabe con el plan de dos, y el motivo viaja en el hint'
);

select is(
  (select count(*) from public.my_households()),
  2::bigint,
  'y el intento fallido no dejó nada a medias'
);

-- Lo que el cliente NO puede tocar por la puerta de atrás.
select throws_ok(
  $$update public.user_settings set household_limit = 5$$,
  '42501',
  null,
  'el cliente no se sube el límite de neveras'
);

select throws_ok(
  $$update public.households set name = 'Mío'$$,
  '42501',
  null,
  'ni cambia el nombre de una nevera con un update suelto: pasa por update_household'
);

select throws_ok(
  $$insert into public.households (name, kind, icon, member_limit)
    values ('Colada', 'shared', 'house', 5)$$,
  '42501',
  null,
  'ni fabrica una nevera saltándose el tope'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  public.test_error_de($$select public.create_shared_household('Trampa', 'icono_inventado')$$),
  '22023/',
  'un icono que no está en la lista se rechaza en el servidor'
);

select isnt_sin_error(
  public.test_error_de($$select public.create_shared_household('   ', 'house')$$),
  'y un nombre en blanco también'
);

select throws_ok(
  format($$insert into public.household_members (household_id, user_id, role)
           values (%L::uuid, %L::uuid, 'owner')$$,
         current_setting('opsi.piso'), current_setting('opsi.bruno')),
  '42501',
  null,
  'nadie se apunta a una nevera a mano: las pertenencias solo las escriben las RPC'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Nombre e icono: solo el dueño
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  format($$select public.update_household(%L::uuid, 'Piso 3B', 'house')$$,
         current_setting('opsi.piso')),
  'la dueña renombra su compartida y le cambia el icono'
);

select is(
  (select m.name from public.my_households() m
    where m.id = current_setting('opsi.piso')::uuid),
  'Piso 3B',
  'y se ve'
);

select lives_ok(
  format($$select public.update_household(%L::uuid, 'Mi cueva', 'tent')$$,
         current_setting('opsi.priv_ana')),
  'la privada también se puede personalizar'
);

select is(
  public.test_error_de(format(
    $$select public.update_household(%L::uuid, 'Piso', 'icono_inventado')$$,
    current_setting('opsi.piso'))),
  '22023/',
  'un icono fuera de la lista no entra por aquí tampoco'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select isnt_sin_error(
  public.test_error_de(format(
    $$select public.update_household(%L::uuid, 'Mío ahora', 'house')$$,
    current_setting('opsi.piso'))),
  'quien no es de la nevera no la renombra'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Invitar y aceptar: se añade, no se mueve
-- ══════════════════════════════════════════════════════════════════════════

reset role;

-- Un alimento en Piso, para saber quién lo ve.
insert into public.inventory_items
  (household_id, name, category, unit_family, display_unit,
   initial_quantity, remaining_quantity, created_by)
values
  (current_setting('opsi.piso')::uuid, 'Yogur del piso', 'lacteos', 'count', 'unit',
   4, 4, current_setting('opsi.ana')::uuid);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(
  public.test_error_de(format(
    $$select * from public.invite_to_household(%L::uuid, 'bruno')$$,
    current_setting('opsi.priv_ana'))),
  'P0001/nevera_personal',
  'la privada no se comparte: invitar a ella se rechaza con su hint'
);

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'fantasma'))
select set_config('opsi.out1', r.outcome, true) from r;

select is(current_setting('opsi.out1'), 'desconocida',
  'invitar a un nombre que no existe NO lanza excepción: devuelve un resultado');

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'bruno'))
select set_config('opsi.out2', r.outcome, true) from r;

select is(current_setting('opsi.out2'), 'creada', 'invitar a Bruno a Piso funciona');

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'bruno'))
select set_config('opsi.out3', r.outcome, true) from r;

select is(current_setting('opsi.out3'), 'ya_invitada',
  'y repetirlo no duplica la invitación');

select isnt_sin_error(
  public.test_error_de(format(
    $$select * from public.invite_to_household(%L::uuid, 'ana')$$,
    current_setting('opsi.piso'))),
  'nadie se invita a sí mismo'
);

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'carla'))
select set_config('opsi.out4', r.outcome, true) from r;

select is(current_setting('opsi.out4'), 'creada', 'y Carla también recibe la suya');

reset role;

select is(
  (select count(*) from public.household_invite_attempts),
  4::bigint,
  'los cuatro intentos quedaron contados, también el del nombre inexistente'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select count(*) from public.my_pending_invitations()),
  1::bigint,
  'Bruno ve su invitación pendiente'
);

select is(
  (select p.household_name from public.my_pending_invitations() p),
  'Piso 3B',
  'con el nombre de la nevera'
);

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.piso')::uuid),
  0::bigint,
  'antes de aceptar no ve nada de Piso'
);

select set_config('opsi.inv_bruno',
  (select p.id::text from public.my_pending_invitations() p), true);

select set_config('opsi.tmp',
  (select h.id::text from public.accept_invitation(current_setting('opsi.inv_bruno')::uuid) h),
  true);

select is(current_setting('opsi.tmp'), current_setting('opsi.piso'),
  'aceptar devuelve la nevera a la que entra');

select is(
  (select count(*) from public.my_households()),
  2::bigint,
  'Bruno tiene dos neveras: aceptar AÑADE, no lo saca de la suya'
);

select ok(
  exists (select 1 from public.my_households() m
           where m.id = current_setting('opsi.priv_bruno')::uuid and m.kind = 'personal'),
  'su privada sigue ahí'
);

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.piso')::uuid),
  1::bigint,
  've lo de Piso'
);

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.priv_ana')::uuid),
  0::bigint,
  'pero no lo privado de Ana'
);

select is(
  public.test_error_de($$select public.create_shared_household('Otro piso', 'house')$$),
  'P0001/limite_neveras',
  'ya está en sus dos neveras: no puede crear una tercera'
);

-- Carla entra también: tres personas en Piso.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccc3333-cccc-4ccc-8ccc-cccc33333333","role":"authenticated"}';

select set_config('opsi.inv_carla',
  (select p.id::text from public.my_pending_invitations() p), true);

select lives_ok(
  format($$select public.accept_invitation(%L::uuid)$$, current_setting('opsi.inv_carla')),
  'Carla acepta'
);

reset role;

select is(
  (select count(*) from public.household_members m
    where m.household_id = current_setting('opsi.piso')::uuid),
  3::bigint,
  'Piso tiene tres personas'
);

-- La nevera llena: se cuentan las personas MÁS las invitaciones sin responder.
update public.households set member_limit = 3
 where id = current_setting('opsi.piso')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(
  public.test_error_de(format(
    $$select * from public.invite_to_household(%L::uuid, 'dani')$$,
    current_setting('opsi.piso'))),
  'P0001/nevera_llena',
  'con Piso completo no se invita a nadie más, y el hint lo dice'
);

reset role;

update public.households set member_limit = 5
 where id = current_setting('opsi.piso')::uuid;

-- Dani solo tiene sitio para UNA nevera: su plan, recortado a mano.
update public.user_settings set household_limit = 1
 where user_id = current_setting('opsi.dani')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'dani'))
select set_config('opsi.out5', r.outcome, true) from r;

select is(current_setting('opsi.out5'), 'creada',
  'se puede invitar a alguien que ya no tiene sitio: el tope de la otra persona no se mira aquí');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-dddd-4ddd-8ddd-dddd44444444","role":"authenticated"}';

select set_config('opsi.inv_dani',
  (select p.id::text from public.my_pending_invitations() p), true);

select is(
  public.test_error_de(format(
    $$select public.accept_invitation(%L::uuid)$$, current_setting('opsi.inv_dani'))),
  'P0001/limite_neveras',
  'pero Dani no puede aceptar si su plan ya no le da más neveras'
);

reset role;
update public.user_settings set household_limit = 2
 where user_id = current_setting('opsi.dani')::uuid;

-- ══════════════════════════════════════════════════════════════════════════
-- E · Rechazar, cancelar y caducar
-- ══════════════════════════════════════════════════════════════════════════

-- El ritmo de invitaciones es por hora: se empieza de cero para que estas
-- pruebas no dependan de cuántas se hicieron arriba.
delete from public.household_invite_attempts;

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-dddd-4ddd-8ddd-dddd44444444","role":"authenticated"}';

select lives_ok(
  format($$select public.reject_invitation(%L::uuid)$$, current_setting('opsi.inv_dani')),
  'Dani rechaza'
);

reset role;

select is(
  (select i.status::text from public.household_invitations i
    where i.id = current_setting('opsi.inv_dani')::uuid),
  'rejected',
  'y queda constancia'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-dddd-4ddd-8ddd-dddd44444444","role":"authenticated"}';

select is(
  public.test_error_de(format(
    $$select public.accept_invitation(%L::uuid)$$, current_setting('opsi.inv_dani'))),
  'P0001/',
  'una invitación ya respondida no se acepta después'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'dani'))
select set_config('opsi.out6', r.outcome, true) from r;

select is(current_setting('opsi.out6'), 'creada',
  'tras un rechazo se puede volver a invitar');

select set_config('opsi.inv_dani2',
  (select s.id::text from public.household_sent_invitations(current_setting('opsi.piso')::uuid) s
    where s.invitee_username = 'dani' and s.status = 'pending'), true);

select lives_ok(
  format($$select public.cancel_invitation(%L::uuid)$$, current_setting('opsi.inv_dani2')),
  'la dueña cancela una invitación que no ha sido respondida'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-dddd-4ddd-8ddd-dddd44444444","role":"authenticated"}';

select is(
  public.test_error_de(format(
    $$select public.accept_invitation(%L::uuid)$$, current_setting('opsi.inv_dani2'))),
  'P0001/',
  'y una cancelada ya no se puede aceptar'
);

-- Una caducada: se fabrica con fecha de hace tres días.
reset role;

insert into public.household_invitations
  (household_id, inviter_id, invitee_id, created_at, expires_at)
values
  (current_setting('opsi.piso')::uuid,
   current_setting('opsi.ana')::uuid,
   current_setting('opsi.dani')::uuid,
   now() - interval '10 days',
   now() - interval '3 days');

select set_config('opsi.inv_vieja',
  (select i.id::text from public.household_invitations i
    where i.invitee_id = current_setting('opsi.dani')::uuid
      and i.expires_at < now()), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd4444-dddd-4ddd-8ddd-dddd44444444","role":"authenticated"}';

select is(
  public.test_error_de(format(
    $$select public.accept_invitation(%L::uuid)$$, current_setting('opsi.inv_vieja'))),
  'P0001/',
  'una invitación caducada no se acepta'
);

select is(
  (select count(*) from public.my_pending_invitations()),
  0::bigint,
  'ni aparece entre las pendientes'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

with r as (select * from public.invite_to_household(current_setting('opsi.piso')::uuid, 'dani'))
select set_config('opsi.out7', r.outcome, true) from r;

select is(current_setting('opsi.out7'), 'creada',
  'la caducada no bloquea para siempre: se puede volver a invitar');

reset role;

select is(
  (select i.status::text from public.household_invitations i
    where i.id = current_setting('opsi.inv_vieja')::uuid),
  'expired',
  'y la vieja queda marcada como caducada, no como pendiente eterna'
);

-- Se limpia: Dani no entra en esta historia.
update public.household_invitations set status = 'cancelled', responded_at = now()
 where invitee_id = current_setting('opsi.dani')::uuid and status = 'pending';

-- ══════════════════════════════════════════════════════════════════════════
-- F · Dar de alta en la nevera elegida
-- ══════════════════════════════════════════════════════════════════════════
--
-- create_item resolvía el hogar con `limit 1`, sin orden: con dos pertenencias
-- habría caído en una al azar y en silencio. Ahora el hogar viaja explícito y
-- se comprueba en el servidor.

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(
  (select i.household_id from public.create_item(
      p_household_id := current_setting('opsi.piso')::uuid,
      p_name := 'Leche del piso', p_unit_family := 'volume',
      p_display_unit := 'l', p_quantity := 1000) i),
  current_setting('opsi.piso')::uuid,
  'lo que se da de alta en Piso va a Piso'
);

select is(
  (select i.household_id from public.create_item(
      p_household_id := current_setting('opsi.priv_ana')::uuid,
      p_name := 'Arroz mío', p_unit_family := 'mass',
      p_display_unit := 'g', p_quantity := 500) i),
  current_setting('opsi.priv_ana')::uuid,
  'y lo que se da de alta en la privada, a la privada'
);

select isnt_sin_error(
  public.test_error_de(format(
    $$select public.create_item(
        p_household_id := %L::uuid, p_name := 'Colado',
        p_unit_family := 'count', p_display_unit := 'unit', p_quantity := 1)$$,
    current_setting('opsi.priv_bruno'))),
  'en la nevera de otra persona no se da de alta nada'
);

select is(
  public.test_error_de(format(
    $$update public.inventory_items set household_id = %L::uuid
      where name = 'Leche del piso'$$,
    current_setting('opsi.priv_ana'))),
  'P0001/',
  'un alimento no se pasa de una nevera a otra, aunque pertenezcas a las dos'
);

select is(
  (select count(distinct v.household_id) from public.inventory_with_priority v),
  2::bigint,
  'la vista trae las neveras de Ana MEZCLADAS: quien la consulta tiene que acotar por nevera'
);

reset role;

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.priv_bruno')::uuid),
  0::bigint,
  'y en la privada de Bruno no cayó nada de lo anterior'
);

-- Bruno tiene dos pertenencias: cae en la que pide, no en «la primera».
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select is(
  (select i.household_id from public.create_item(
      p_household_id := current_setting('opsi.priv_bruno')::uuid,
      p_name := 'Pan de Bruno', p_unit_family := 'count',
      p_display_unit := 'unit', p_quantity := 1) i),
  current_setting('opsi.priv_bruno')::uuid,
  'con dos neveras, lo de Bruno cae en la privada cuando la pide'
);

select is(
  (select i.household_id from public.create_item(
      p_household_id := current_setting('opsi.piso')::uuid,
      p_name := 'Pan del piso', p_unit_family := 'count',
      p_display_unit := 'unit', p_quantity := 1) i),
  current_setting('opsi.piso')::uuid,
  'y en Piso cuando pide Piso'
);

-- ══════════════════════════════════════════════════════════════════════════
-- G · Traspasar, salir y echar
-- ══════════════════════════════════════════════════════════════════════════

-- Bruno y Carla son miembros, no dueños.
select isnt_sin_error(
  public.test_error_de(format(
    $$select public.remove_household_member(%L::uuid, %L::uuid)$$,
    current_setting('opsi.piso'), current_setting('opsi.carla'))),
  'un miembro no echa a otro'
);

select isnt_sin_error(
  public.test_error_de(format(
    $$select * from public.invite_to_household(%L::uuid, 'dani')$$,
    current_setting('opsi.piso'))),
  'ni invita: solo el dueño'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select is(
  public.test_error_de(format(
    $$select public.leave_household(%L::uuid)$$, current_setting('opsi.piso'))),
  'P0001/debe_traspasar',
  'la dueña no se va dejando a la gente sin dueño: primero traspasa'
);

select is(
  public.test_error_de(format(
    $$select public.leave_household(%L::uuid)$$, current_setting('opsi.priv_ana'))),
  'P0001/nevera_personal',
  'la privada no se abandona'
);

select is(
  public.test_error_de(format(
    $$select public.transfer_household_ownership(%L::uuid, %L::uuid)$$,
    current_setting('opsi.priv_ana'), current_setting('opsi.bruno'))),
  'P0001/nevera_personal',
  'ni se traspasa'
);

select isnt_sin_error(
  public.test_error_de(format(
    $$select public.transfer_household_ownership(%L::uuid, %L::uuid)$$,
    current_setting('opsi.piso'), current_setting('opsi.dani'))),
  'y no se traspasa a quien no es de la nevera'
);

select lives_ok(
  format($$select public.transfer_household_ownership(%L::uuid, %L::uuid)$$,
         current_setting('opsi.piso'), current_setting('opsi.bruno')),
  'Ana traspasa Piso a Bruno'
);

reset role;

select is(
  (select m.role::text from public.household_members m
    where m.household_id = current_setting('opsi.piso')::uuid
      and m.user_id = current_setting('opsi.bruno')::uuid),
  'owner',
  'Bruno pasa a ser el dueño'
);

select is(
  (select count(*) from public.household_members m
    where m.household_id = current_setting('opsi.piso')::uuid and m.role = 'owner'),
  1::bigint,
  'y sigue habiendo un solo dueño'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa1111-aaaa-4aaa-8aaa-aaaa11111111","role":"authenticated"}';

select lives_ok(
  format($$select public.leave_household(%L::uuid)$$, current_setting('opsi.piso')),
  'ahora Ana, que ya es miembro, se puede ir'
);

select is(
  (select count(*) from public.my_households()),
  1::bigint,
  'y se queda con su privada'
);

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.piso')::uuid),
  0::bigint,
  'sin ver nada de Piso'
);

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.priv_ana')::uuid),
  2::bigint,
  'y con lo suyo intacto'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select lives_ok(
  format($$select public.remove_household_member(%L::uuid, %L::uuid)$$,
         current_setting('opsi.piso'), current_setting('opsi.carla')),
  'Bruno, ya dueño, echa a Carla'
);

select isnt_sin_error(
  public.test_error_de(format(
    $$select public.remove_household_member(%L::uuid, %L::uuid)$$,
    current_setting('opsi.priv_bruno'), current_setting('opsi.bruno'))),
  'de una privada no se echa a nadie'
);

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccc3333-cccc-4ccc-8ccc-cccc33333333","role":"authenticated"}';

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.piso')::uuid),
  0::bigint,
  'Carla, expulsada, deja de ver Piso al instante'
);

select is(
  (select count(*) from public.my_households()),
  1::bigint,
  'y conserva su privada'
);

-- El último en salir deja la nevera huérfana: existe, con su historia, y nadie
-- puede llegar a ella. Borrarla en cascada destruiría el inventario como efecto
-- colateral de pulsar «salir», y eso no se puede deshacer.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select lives_ok(
  format($$select public.leave_household(%L::uuid)$$, current_setting('opsi.piso')),
  'el último en salir (el dueño, ya solo) puede irse'
);

reset role;

select is(
  (select count(*) from public.household_members m
    where m.household_id = current_setting('opsi.piso')::uuid),
  0::bigint,
  'Piso se queda sin nadie'
);

select is(
  (select count(*) from public.inventory_items i
    where i.household_id = current_setting('opsi.piso')::uuid),
  3::bigint,
  'pero no se borra: su inventario sigue existiendo, huérfano'
);

select is(
  (select count(*) from public.household_invitations i
    where i.household_id = current_setting('opsi.piso')::uuid and i.status = 'pending'),
  0::bigint,
  'y no queda ninguna invitación viva en una nevera sin gente'
);

-- ══════════════════════════════════════════════════════════════════════════
-- H · El plan de pago, y el ritmo de invitaciones
-- ══════════════════════════════════════════════════════════════════════════

update public.user_settings set household_limit = 3
 where user_id = current_setting('opsi.erika')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeee5555-eeee-4eee-8eee-eeee55555555","role":"authenticated"}';

select lives_ok(
  $$select public.create_shared_household('Casa A', 'house')$$,
  'con un plan de tres, Erika crea la primera compartida'
);

select lives_ok(
  $$select public.create_shared_household('Casa B', 'tent')$$,
  'y la segunda'
);

select is(
  public.test_error_de($$select public.create_shared_household('Casa C', 'door')$$),
  'P0001/limite_neveras',
  'y una tercera compartida ya no cabe'
);

reset role;

update public.user_settings set household_limit = 5
 where user_id = current_setting('opsi.erika')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeee5555-eeee-4eee-8eee-eeee55555555","role":"authenticated"}';

select lives_ok(
  $$select public.create_shared_household('Casa C', 'door')$$,
  'subiendo el plan a cinco (lo hace el servidor, no la app) sí cabe'
);

select set_config('opsi.casa_a',
  (select m.id::text from public.my_households() m where m.name = 'Casa A'), true);

reset role;

-- El ritmo se cuenta por hora y por persona: cinco intentos, el sexto no.
delete from public.household_invite_attempts;

set local role authenticated;
set local request.jwt.claims = '{"sub":"eeee5555-eeee-4eee-8eee-eeee55555555","role":"authenticated"}';

select is(
  (select count(*) from generate_series(1, 5) g,
     lateral public.invite_to_household(current_setting('opsi.casa_a')::uuid, 'nadie' || g) r
    where r.outcome = 'desconocida'),
  5::bigint,
  'cinco intentos a nombres que no existen: todos contestan, ninguno lanza excepción'
);

select is(
  public.test_error_de(format(
    $$select * from public.invite_to_household(%L::uuid, 'nadie6')$$,
    current_setting('opsi.casa_a'))),
  'P0001/',
  'el sexto de la hora se rechaza: no se puede sondear el censo de usuarios'
);

-- ══════════════════════════════════════════════════════════════════════════
-- I · Permisos: nada de esto se toca por la puerta de atrás
-- ══════════════════════════════════════════════════════════════════════════

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbb2222-bbbb-4bbb-8bbb-bbbb22222222","role":"authenticated"}';

select throws_ok(
  $$select count(*) from public.household_invite_attempts$$,
  '42501',
  null,
  'el registro de intentos no lo lee nadie desde la app'
);

select throws_ok(
  $$insert into public.household_invitations (household_id, inviter_id, invitee_id)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid())$$,
  '42501',
  null,
  'las invitaciones no se insertan a mano: todo pasa por la RPC'
);

select throws_ok(
  format($$update public.household_members set role = 'owner'
           where household_id = %L::uuid$$, current_setting('opsi.priv_bruno')),
  '42501',
  null,
  'los roles tampoco se cambian a mano'
);

select throws_ok(
  $$delete from public.household_members$$,
  '42501',
  null,
  'ni se borran pertenencias con un delete suelto'
);

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from public.household_invitations$$,
  '42501',
  null,
  'sin sesión no se ven ni las invitaciones'
);

select is(
  public.test_error_de($$select public.create_shared_household('Anónima', 'house')$$),
  '42501/',
  'sin sesión no se puede ni intentar crear una nevera'
);

select is(
  public.test_error_de($$select * from public.my_households()$$),
  '42501/',
  'ni preguntar por las neveras'
);

reset role;

select * from finish();
rollback;
