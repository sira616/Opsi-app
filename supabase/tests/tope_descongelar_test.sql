-- ═══════════════════════════════════════════════════════════════════════════
-- El tope de 24 h tras descongelar sigue contando aunque se use o se abra
--
-- D-14: algo descongelado se consume en 24 horas, y ese tope GANA a la fecha del
-- envase. La vista lo aplicaba solo con `state = 'thawed'`; al usar una parte o
-- abrirlo el estado cambia, `thawed_at` se queda y el tope desaparecía: algo
-- descongelado hace 3 días pasaba de «−2 días» a «10 días». Arreglado en
-- `20261022100000_tope_24h_tras_descongelar`.
--
-- Cada caso comprueba la fecha, el motivo y el grupo de prioridad A TRAVÉS DE LA
-- VISTA, que es lo que ve la app. El primero (todavía descongelado) ya pasaba
-- antes del arreglo: es el punto de partida, para que los demás prueben el
-- cambio de estado y no otra cosa.
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
  ('00000000-0000-0000-0000-000000000000', 'aaaa7777-aaaa-4aaa-8aaa-aaaa77777777',
   'authenticated', 'authenticated', 'tope@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.tope', 'aaaa7777-aaaa-4aaa-8aaa-aaaa77777777', true);
select set_config('opsi.casa',
  (select household_id::text from public.household_members
    where user_id = current_setting('opsi.tope')::uuid), true);

-- Cuatro elementos con el envase a 10 días. Si el tope falla, saldrán «low».
insert into public.inventory_items
  (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity,
   limit_date, date_kind, date_source, created_by)
select current_setting('opsi.casa')::uuid, n, 'volume', 'l', 1000, 1000,
       current_date + 10, 'best_before', 'package', current_setting('opsi.tope')::uuid
  from unnest(array['Tope sin usar', 'Tope usado', 'Tope abierto', 'Tope vuelto a congelar']) as n;

-- Un quinto que nunca se congeló: el contraste, para que el tope no se aplique a todo.
insert into public.inventory_items
  (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity,
   limit_date, date_kind, date_source, created_by)
values
  (current_setting('opsi.casa')::uuid, 'Tope nunca congelado', 'volume', 'l', 1000, 1000,
   current_date + 10, 'best_before', 'package', current_setting('opsi.tope')::uuid);

select set_config('opsi.sin_usar', (select id::text from public.inventory_items where name = 'Tope sin usar'), true);
select set_config('opsi.usado',    (select id::text from public.inventory_items where name = 'Tope usado'), true);
select set_config('opsi.abierto',  (select id::text from public.inventory_items where name = 'Tope abierto'), true);
select set_config('opsi.recong',   (select id::text from public.inventory_items where name = 'Tope vuelto a congelar'), true);
select set_config('opsi.nunca',    (select id::text from public.inventory_items where name = 'Tope nunca congelado'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa7777-aaaa-4aaa-8aaa-aaaa77777777","role":"authenticated"}';

-- Congelar y descongelar los cuatro primeros.
select lives_ok(
  format($$select public.freeze_item(%L), public.thaw_item(%L)$$, id, id),
  'congelar y descongelar: ' || name
)
from (values
  (current_setting('opsi.sin_usar'), 'sin usar'),
  (current_setting('opsi.usado'), 'usado'),
  (current_setting('opsi.abierto'), 'abierto'),
  (current_setting('opsi.recong'), 'vuelto a congelar')
) as t(id, name);

-- Se descongelaron hace 3 días (solo se puede retocar `thawed_at` sin la RLS).
reset role;
update public.inventory_items
   set thawed_at = now() - interval '3 days'
 where id in (
   current_setting('opsi.sin_usar')::uuid, current_setting('opsi.usado')::uuid,
   current_setting('opsi.abierto')::uuid, current_setting('opsi.recong')::uuid);
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa7777-aaaa-4aaa-8aaa-aaaa77777777","role":"authenticated"}';

-- ── Partida: descongelado y sin tocar. Ya funcionaba ─────────────────────

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.sin_usar')::uuid),
  (select thawed_at::date + 1 from public.inventory_items
    where id = current_setting('opsi.sin_usar')::uuid),
  'descongelado y sin tocar: manda el tope de 24 h, no el envase a 10 días'
);

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.sin_usar')::uuid),
  'high',
  'y como el tope ya pasó, es prioridad alta'
);

-- ── Usar una parte: antes del arreglo el tope desaparecía ────────────────

select lives_ok(
  format($$select public.use_quantity(%L, 100)$$, current_setting('opsi.usado')),
  'usar una parte de lo descongelado'
);

select is(
  (select state::text from public.inventory_items where id = current_setting('opsi.usado')::uuid),
  'partially_consumed',
  'queda empezado: el estado ya no es «descongelado»'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.usado')::uuid),
  (select thawed_at::date + 1 from public.inventory_items
    where id = current_setting('opsi.usado')::uuid),
  'usado: el tope de 24 h sigue mandando'
);

select is(
  (select effective_date_reason::text from public.inventory_with_priority
    where id = current_setting('opsi.usado')::uuid),
  'after_thawing',
  'usado: y el motivo sigue siendo haberlo descongelado'
);

select is(
  (select effective_date_source::text from public.inventory_with_priority
    where id = current_setting('opsi.usado')::uuid),
  'reference',
  'usado: y la fecha se dice orientativa, no del envase'
);

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.usado')::uuid),
  'high',
  'usado: sigue siendo prioridad alta, no «low» por la fecha del envase'
);

-- ── Abrirlo ──────────────────────────────────────────────────────────────

select lives_ok(
  format($$select public.open_item(%L)$$, current_setting('opsi.abierto')),
  'abrir lo descongelado'
);

select is(
  (select state::text from public.inventory_items where id = current_setting('opsi.abierto')::uuid),
  'open',
  'queda abierto: el estado ya no es «descongelado»'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.abierto')::uuid),
  (select thawed_at::date + 1 from public.inventory_items
    where id = current_setting('opsi.abierto')::uuid),
  'abierto: el tope de 24 h sigue mandando, aunque la conservación tras abrir diera más'
);

select is(
  (select effective_date_reason::text from public.inventory_with_priority
    where id = current_setting('opsi.abierto')::uuid),
  'after_thawing',
  'abierto: el motivo sigue siendo haberlo descongelado'
);

-- ── Congelar otra vez y descongelar: las 24 h empiezan de nuevo ──────────

select lives_ok(
  format($$select public.freeze_item(%L)$$, current_setting('opsi.recong')),
  'volver a congelar lo descongelado'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.recong')::uuid),
  null::date,
  'congelado otra vez: la cuenta atrás está parada, sin fecha (el tope viejo no cuenta)'
);

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.recong')::uuid),
  'frozen',
  'y el grupo es «congelado»'
);

select lives_ok(
  format($$select public.thaw_item(%L)$$, current_setting('opsi.recong')),
  'descongelarlo de nuevo'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.recong')::uuid),
  (select thawed_at::date + 1 from public.inventory_items
    where id = current_setting('opsi.recong')::uuid),
  'descongelado de nuevo: el tope cuenta desde esta descongelación'
);

select ok(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.recong')::uuid)
  > (select thawed_at::date + 1 - 3 from public.inventory_items
      where id = current_setting('opsi.recong')::uuid),
  'y no desde la de hace 3 días: las 24 h se reinician'
);

-- ── El contraste: lo que nunca se congeló no lleva tope ──────────────────

select lives_ok(
  format($$select public.use_quantity(%L, 100)$$, current_setting('opsi.nunca')),
  'usar una parte de lo que nunca se congeló'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.nunca')::uuid),
  current_date + 10,
  'nunca congelado: manda la fecha del envase, sin tope de 24 h'
);

select ok(
  (select effective_date_reason::text from public.inventory_with_priority
    where id = current_setting('opsi.nunca')::uuid) is distinct from 'after_thawing',
  'nunca congelado: el motivo no es el de haberlo descongelado'
);

select * from finish();

rollback;
