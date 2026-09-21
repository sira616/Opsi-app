-- ═══════════════════════════════════════════════════════════════════════════
-- Acciones del inventario y vista de prioridad.
--
-- Lo que de verdad se prueba aquí:
--   · Que cada accion deja un evento, en la misma transaccion.
--   · Que congelar pausa y descongelar reanuda (D-12)...
--   · ...pero que el tope de 24 h tras descongelar GANA (D-14). Este es el
--     test que impide que vuelva el comportamiento inseguro.
--   · Que la vista respeta la RLS. Una vista sin security_invoker devolveria
--     el inventario de todos los hogares, y eso no se ve a simple vista.
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
  ('00000000-0000-0000-0000-000000000000', '4444dddd-4444-4444-8444-444444444444',
   'authenticated', 'authenticated', 'diego@opsi.test', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', '5555eeee-5555-4555-8555-555555555555',
   'authenticated', 'authenticated', 'elena@opsi.test', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.diego', '4444dddd-4444-4444-8444-444444444444', true);
select set_config('opsi.elena', '5555eeee-5555-4555-8555-555555555555', true);
select set_config('opsi.casa',
  (select household_id::text from public.household_members
    where user_id = current_setting('opsi.diego')::uuid), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"4444dddd-4444-4444-8444-444444444444","role":"authenticated"}';

-- Un brick de leche cerrado, con consumo preferente dentro de 3 dias.
insert into public.inventory_items
  (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity,
   limit_date, date_kind, date_source, created_by)
values
  (current_setting('opsi.casa')::uuid, 'Leche entera', 'volume', 'l', 1000, 1000,
   current_date + 3, 'best_before', 'package', current_setting('opsi.diego')::uuid);

select set_config('opsi.leche',
  (select id::text from public.inventory_items where name = 'Leche entera'), true);

-- ── Estado de partida ─────────────────────────────────────────────────────

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  'medium',
  'un elemento que vence en 3 dias es prioridad media'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  current_date + 3,
  'sin abrir ni congelar, manda la fecha del envase'
);

select is(
  (select effective_date_reason::text from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  'label',
  'y el motivo es que viene de la etiqueta'
);

-- ── Congelar: la cuenta atras se para ─────────────────────────────────────

select lives_ok(
  format($$select public.freeze_item(%L)$$, current_setting('opsi.leche')),
  'congelar funciona'
);

select is(
  (select state::text from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  'frozen',
  'queda congelado'
);

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  'frozen',
  'mientras esta congelado no tiene urgencia: la cuenta atras esta parada'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  null::date,
  'y no tiene fecha limite efectiva'
);

select is(
  (select count(*) from public.inventory_events
    where item_id = current_setting('opsi.leche')::uuid and type = 'frozen'),
  1::bigint,
  'congelar deja su evento'
);

-- ── Han pasado 30 dias en el congelador ───────────────────────────────────

update public.inventory_items
   set frozen_at = now() - interval '30 days'
 where id = current_setting('opsi.leche')::uuid;

select lives_ok(
  format($$select public.thaw_item(%L)$$, current_setting('opsi.leche')),
  'descongelar funciona'
);

select is(
  (select frozen_days from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  30,
  'descongelar acumula los 30 dias del tramo (D-12)'
);

select is(
  (select frozen_at from public.inventory_items where id = current_setting('opsi.leche')::uuid),
  null::timestamptz,
  'y cierra el tramo, para no contarlo dos veces'
);

-- ── EL TEST QUE IMPORTA: el tope de 24 h gana (D-14) ──────────────────────

select is(
  (select date_from_label from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  current_date + 33,
  'la fecha reanudada seria dentro de 33 dias (3 del envase + 30 congelada)'
);

select is(
  (select effective_limit_date from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  current_date + 1,
  'PERO la fecha limite efectiva es manana: 24 h desde que se descongelo'
);

select is(
  (select effective_date_reason::text from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  'after_thawing',
  'y la pantalla puede explicar que el motivo es el descongelado'
);

select is(
  (select effective_date_source::text from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  'reference',
  'ese tope es orientativo, no sale del envase'
);

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.leche')::uuid),
  'high',
  'y por tanto sube a prioridad alta'
);

-- ── Abrir, usar y terminar ────────────────────────────────────────────────

insert into public.inventory_items
  (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity, created_by)
values
  (current_setting('opsi.casa')::uuid, 'Arroz', 'mass', 'kg', 1000, 1000,
   current_setting('opsi.diego')::uuid);

select set_config('opsi.arroz',
  (select id::text from public.inventory_items where name = 'Arroz'), true);

select lives_ok(
  format($$select public.open_item(%L)$$, current_setting('opsi.arroz')),
  'abrir funciona'
);

select throws_ok(
  format($$select public.open_item(%L)$$, current_setting('opsi.arroz')),
  'P0001',
  null,
  'abrir dos veces lo mismo se rechaza'
);

select lives_ok(
  format($$select public.use_quantity(%L, 400)$$, current_setting('opsi.arroz')),
  'usar 400 g funciona'
);

select is(
  (select remaining_quantity from public.inventory_items where id = current_setting('opsi.arroz')::uuid),
  600::numeric,
  'quedan 600 g'
);

select is(
  (select state::text from public.inventory_items where id = current_setting('opsi.arroz')::uuid),
  'partially_consumed',
  'y pasa a consumido parcialmente'
);

select throws_ok(
  format($$select public.use_quantity(%L, 9999)$$, current_setting('opsi.arroz')),
  '22023',
  null,
  'no se puede usar mas de lo que queda'
);

select throws_ok(
  format($$select public.use_quantity(%L, 0)$$, current_setting('opsi.arroz')),
  '22023',
  null,
  'ni una cantidad de cero'
);

select lives_ok(
  format($$select public.use_quantity(%L, 600)$$, current_setting('opsi.arroz')),
  'usar los 600 g que quedaban funciona'
);

select is(
  (select state::text from public.inventory_items where id = current_setting('opsi.arroz')::uuid),
  'finished',
  'llegar a cero lo da por terminado'
);

-- ok(... is not null) en vez de isnt(x, null): en pgTAP un NULL sin castear
-- deja la funcion polimorfica sin tipo que resolver.
select ok(
  (select closed_out_at is not null from public.inventory_items
    where id = current_setting('opsi.arroz')::uuid),
  'y anota cuando se termino'
);

select is(
  (select count(*) from public.inventory_events
    where item_id = current_setting('opsi.arroz')::uuid),
  4::bigint,
  'quedan 4 eventos: abierto, dos consumos y terminado'
);

select throws_ok(
  format($$select public.open_item(%L)$$, current_setting('opsi.arroz')),
  'P0001',
  null,
  'un elemento terminado no admite mas acciones'
);

-- ── Tirar guarda cuanto se desperdicio ────────────────────────────────────

insert into public.inventory_items
  (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity, created_by)
values
  (current_setting('opsi.casa')::uuid, 'Tomate frito', 'mass', 'g', 400, 250,
   current_setting('opsi.diego')::uuid);

select set_config('opsi.tomate',
  (select id::text from public.inventory_items where name = 'Tomate frito'), true);

select lives_ok(
  format($$select public.discard_item(%L, 'se puso malo')$$, current_setting('opsi.tomate')),
  'tirar funciona'
);

select is(
  (select (payload ->> 'wasted_quantity')::numeric from public.inventory_events
    where item_id = current_setting('opsi.tomate')::uuid and type = 'discarded'),
  250::numeric,
  'y registra los 250 g desperdiciados, que es lo que alimentara los patrones'
);

select is(
  (select priority::text from public.inventory_with_priority
    where id = current_setting('opsi.tomate')::uuid),
  'closed_out',
  'lo tirado sale de la lista de urgencias'
);

-- ── El alta registra su evento ────────────────────────────────────────────

select lives_ok(
  $$select public.create_item('Lentejas', 'mass', 'kg', 1000, 'pantry')$$,
  'dar de alta un elemento funciona'
);

select is(
  (select count(*) from public.inventory_events e
    join public.inventory_items i on i.id = e.item_id
   where i.name = 'Lentejas' and e.type = 'created'),
  1::bigint,
  'y deja su evento created, que antes no emitia nadie'
);

select is(
  (select remaining_quantity from public.inventory_items where name = 'Lentejas'),
  1000::numeric,
  'nace con la cantidad completa'
);

select throws_ok(
  $$select public.create_item('Malo', 'volume', 'kg', 100)$$,
  '23514',
  null,
  'el alta respeta la regla de familia y unidad (D-07)'
);

select throws_ok(
  $$select public.create_item('Malo', 'mass', 'g', 100, 'pantry', current_date + 3)$$,
  '22023',
  null,
  'una fecha sin tipo ni origen se rechaza con un mensaje legible'
);

select throws_ok(
  $$select public.create_item('Malo', 'mass', 'g', 0)$$,
  '22023',
  null,
  'la cantidad tiene que ser mayor que cero'
);

-- ── La vista respeta la RLS ───────────────────────────────────────────────

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"5555eeee-5555-4555-8555-555555555555","role":"authenticated"}';

select is(
  (select count(*) from public.inventory_with_priority), 0::bigint,
  'Elena NO ve el inventario de Diego a traves de la vista (security_invoker)'
);

select throws_ok(
  format($$select public.open_item(%L)$$, current_setting('opsi.leche')),
  'P0002',
  null,
  'Elena NO puede ejecutar acciones sobre elementos de Diego'
);

reset role;

select * from finish();
rollback;
