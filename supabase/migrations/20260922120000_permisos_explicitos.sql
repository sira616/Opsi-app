-- ═══════════════════════════════════════════════════════════════════════════
-- Los permisos de tabla que de verdad queríamos.
--
-- Esta migración no cambia el modelo ni añade nada: quita permisos que nadie
-- concedió a propósito y que estaban ahí igualmente.
--
-- ── Qué pasaba ───────────────────────────────────────────────────────────
--
-- Supabase concede TODOS los permisos (select, insert, update, delete,
-- references, trigger, truncate) a los roles de la Data API sobre cada tabla
-- nueva del esquema `public` creada por `postgres`. Lo hace un disparador de
-- evento; en config.toml es `auto_expose_new_tables`, viene activado y es el
-- comportamiento de la nube, así que esto NO es una rareza del entorno local:
-- pasa igual al desplegar.
--
-- Cada migración de la fase 0 escribió su `revoke all ... from anon` seguido
-- de su `grant ... to authenticated`, que es exactamente lo correcto… salvo
-- que el revoke solo nombraba a `anon`. Resultado: `authenticated` se quedó
-- con todo lo que el disparador le había dado, y lo único que separaba a un
-- usuario de reescribir el registro de eventos era la RLS.
--
-- ── Por qué importa si la RLS ya lo para ─────────────────────────────────
--
-- Porque son dos capas y se quieren las dos, y porque no fallan igual:
--
--   · Sin permiso, el intento muere en el motor con un 42501 ruidoso.
--   · Con permiso y sin política, la RLS deja el UPDATE en CERO FILAS y no
--     dice nada. El cliente cree que ha guardado. Eso es justo lo que hacía
--     fallar a rls_isolation_test.sql en «ni el dueño puede reescribir un
--     evento»: el registro seguía siendo inmutable, pero por una sola razón y
--     además silenciosa.
--
-- Y sobre todo: el día que alguien añada una política de escritura pensando
-- que los permisos ya acotan quién puede intentarlo, abriría bastante más de
-- lo que cree.
--
-- ── La regla, a partir de aquí ───────────────────────────────────────────
--
-- Toda tabla nueva del esquema public empieza por
--     revoke all on <tabla> from anon, authenticated;
-- y solo después concede lo que necesite. Nombrar a `authenticated` no es
-- redundante: es lo que deshace lo que el disparador acaba de conceder.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Hogares y pertenencia ─────────────────────────────────────────────────
-- Los hogares los crea el trigger de alta y las pertenencias solo las RPC de
-- la nevera compartida: aquí no hace falta ni INSERT ni DELETE. Del UPDATE se
-- salva únicamente el nombre, para que member_limit siga siendo cosa del
-- servidor (ver 20260922110000).
revoke all on public.households from anon, authenticated;
grant select on public.households to authenticated;
grant update (name) on public.households to authenticated;

-- Solo lectura, y basta con ella: entrar y salir de un hogar pasa por las RPC.
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;

-- ── El registro de eventos, que es inmutable de verdad ────────────────────
-- Se escribe y no se toca más. Ahora el UPDATE y el DELETE fallan en el motor,
-- que es lo que la migración que lo creó decía y no llegaba a cumplir.
revoke all on public.inventory_events from anon, authenticated;
grant select, insert on public.inventory_events to authenticated;

-- ── Lo que sí se edita desde la app ───────────────────────────────────────
revoke all on public.inventory_items from anon, authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;

revoke all on public.shopping_list_items from anon, authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;

revoke all on public.products from anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;

-- ── Ajustes: el nombre de usuario sigue siendo inmutable ──────────────────
-- Misma lista de columnas que 20260921160000_username.sql. Está repetida
-- porque `revoke all` se lleva también los permisos por columna, así que hay
-- que volver a concederlos enteros. Si algún día se añade una columna
-- editable, hay que tocar los dos sitios.
revoke all on public.user_settings from anon, authenticated;
grant select, insert on public.user_settings to authenticated;
grant update (
  timezone,
  digest_enabled,
  digest_hour,
  push_token,
  push_token_updated_at,
  auto_add_to_shopping_list,
  locale
) on public.user_settings to authenticated;

-- ── Referencia y vistas: lectura y nada más ───────────────────────────────
revoke all on public.open_shelf_life_reference from anon, authenticated;
grant select on public.open_shelf_life_reference to authenticated;

-- Una vista con permiso de escritura no es un adorno: PostgreSQL admite
-- INSERT y UPDATE sobre vistas simples y esta lo es en parte.
revoke all on public.inventory_with_priority from anon, authenticated;
grant select on public.inventory_with_priority to authenticated;
