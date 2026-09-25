-- ═══════════════════════════════════════════════════════════════════════════
-- La vista de prioridad cuenta desde la fecha del USUARIO, no la del servidor
--
-- «Vence hoy» y «vence mañana» dependen de qué día es para quien mira. El
-- servidor va en UTC; una persona en España está una o dos horas por delante, y
-- entre medianoche y las dos de la madrugada ya es otro día para ella.
--
-- Este test existe porque la regresión ya ocurrió una vez, y nadie lo notó:
-- `20260921180000` recreó la vista copiando una definición anterior al arreglo
-- de `20260921140000`, y volvió a usar `current_date` sin que ningún test fallara.
-- Se arregló en `20260924130000`.
--
-- ── Cómo se prueba sin depender de la hora a la que corra ─────────────────
--
-- Se usan dos zonas horarias extremas: Kiritimati (UTC+14) y Pago Pago (UTC−11).
-- En cualquier instante del día, al menos una tiene una fecha distinta a la de
-- UTC (la primera desde las 10:00 UTC; la segunda hasta las 11:00 UTC, y las dos
-- franjas se solapan). Con la vista mal, la cuenta sale desplazada en esa zona,
-- así que el test falla a cualquier hora, no solo de madrugada.
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
  ('00000000-0000-0000-0000-000000000000', 'ffff6666-ffff-4fff-8fff-ffff66666666',
   'authenticated', 'authenticated', 'zoe@usuarios.opsi.local', '',
   now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

select set_config('opsi.zoe', 'ffff6666-ffff-4fff-8fff-ffff66666666', true);
select set_config('opsi.priv_zoe',
  (select m.household_id::text from public.household_members m
    where m.user_id = current_setting('opsi.zoe')::uuid), true);

-- ══════════════════════════════════════════════════════════════════════════
-- A · Kiritimati (UTC+14): el día del usuario va por delante del del servidor
-- ══════════════════════════════════════════════════════════════════════════

update public.user_settings set timezone = 'Pacific/Kiritimati'
 where user_id = current_setting('opsi.zoe')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffff6666-ffff-4fff-8fff-ffff66666666","role":"authenticated"}';

-- Tres elementos, fechados respecto al HOY DEL USUARIO: dentro de uno, de tres
-- y de diez días. La lógica de la vista es: ≤ hoy+1 → alta, ≤ hoy+4 → media.
select lives_ok(
  format($$select public.create_item(
      p_household_id := %L::uuid, p_name := 'K un dia',
      p_unit_family := 'count', p_display_unit := 'unit', p_quantity := 1,
      p_limit_date := public.today_for_user() + 1,
      p_date_kind := 'best_before', p_date_source := 'package')$$,
    current_setting('opsi.priv_zoe')),
  'un elemento que vence «mañana», visto desde Kiritimati'
);

select lives_ok(
  format($$select public.create_item(
      p_household_id := %L::uuid, p_name := 'K tres dias',
      p_unit_family := 'count', p_display_unit := 'unit', p_quantity := 1,
      p_limit_date := public.today_for_user() + 3,
      p_date_kind := 'best_before', p_date_source := 'package')$$,
    current_setting('opsi.priv_zoe')),
  'otro que vence dentro de tres días'
);

select lives_ok(
  format($$select public.create_item(
      p_household_id := %L::uuid, p_name := 'K diez dias',
      p_unit_family := 'count', p_display_unit := 'unit', p_quantity := 1,
      p_limit_date := public.today_for_user() + 10,
      p_date_kind := 'best_before', p_date_source := 'package')$$,
    current_setting('opsi.priv_zoe')),
  'y otro que vence dentro de diez'
);

select is(
  (select v.days_left from public.inventory_with_priority v where v.name = 'K tres dias'),
  3,
  'a tres días de HOY-DEL-USUARIO, la vista dice tres (con current_date diría dos o cuatro)'
);

select is(
  (select v.priority::text from public.inventory_with_priority v where v.name = 'K un dia'),
  'high',
  'lo que vence «mañana» para el usuario es de prioridad alta'
);

select is(
  (select v.priority::text from public.inventory_with_priority v where v.name = 'K tres dias'),
  'medium',
  'y lo de dentro de tres días, media'
);

select is(
  (select v.priority::text from public.inventory_with_priority v where v.name = 'K diez dias'),
  'low',
  'y lo de diez días, baja'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Pago Pago (UTC−11): el día del usuario va por DETRÁS del del servidor
-- ══════════════════════════════════════════════════════════════════════════

reset role;

update public.user_settings set timezone = 'Pacific/Pago_Pago'
 where user_id = current_setting('opsi.zoe')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub":"ffff6666-ffff-4fff-8fff-ffff66666666","role":"authenticated"}';

select lives_ok(
  format($$select public.create_item(
      p_household_id := %L::uuid, p_name := 'P un dia',
      p_unit_family := 'count', p_display_unit := 'unit', p_quantity := 1,
      p_limit_date := public.today_for_user() + 1,
      p_date_kind := 'best_before', p_date_source := 'package')$$,
    current_setting('opsi.priv_zoe')),
  'un elemento que vence «mañana», visto desde Pago Pago'
);

select lives_ok(
  format($$select public.create_item(
      p_household_id := %L::uuid, p_name := 'P tres dias',
      p_unit_family := 'count', p_display_unit := 'unit', p_quantity := 1,
      p_limit_date := public.today_for_user() + 3,
      p_date_kind := 'best_before', p_date_source := 'package')$$,
    current_setting('opsi.priv_zoe')),
  'y otro dentro de tres días'
);

select is(
  (select v.days_left from public.inventory_with_priority v where v.name = 'P tres dias'),
  3,
  'la vista dice tres también desde el otro lado de la fecha'
);

select is(
  (select v.priority::text from public.inventory_with_priority v where v.name = 'P un dia'),
  'high',
  'y «mañana» sigue siendo alta'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · Un mismo elemento cambia de urgencia según quién lo mira
-- ══════════════════════════════════════════════════════════════════════════
--
-- Es la consecuencia práctica, y la que hay que tener presente al mirar la vista
-- desde un servidor: una fecha fija tiene un `days_left` distinto según la zona
-- de quien pregunta. Los dos elementos de arriba se fecharon con zonas
-- distintas, así que los mismos días de calendario NO coinciden. No es un fallo:
-- «dentro de tres días» significa cosas distintas si hoy es 1 o es 2.

select is(
  (select count(*) from public.inventory_with_priority),
  5::bigint,
  'los cinco elementos siguen ahí: cambiar de zona no pierde nada'
);

reset role;

select * from finish();
rollback;
