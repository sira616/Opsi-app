-- ═══════════════════════════════════════════════════════════════════════════
-- Privilegios por defecto: que una tabla nueva nazca sin permisos para nadie
--
-- Supabase concede TODO a `anon`, `authenticated` y `service_role` sobre cada
-- tabla nueva de `public`, a través de `pg_default_acl`. Es lo que hizo que las
-- migraciones de la fase 0 —que escribían `revoke all … from anon` sin nombrar a
-- `authenticated`— dejaran a cualquier persona con sesión con INSERT, UPDATE y
-- DELETE sobre todo (corregido en `20260922120000_permisos_explicitos`).
--
-- Aquel arreglo fue POR DISCIPLINA: revocar tabla a tabla. Vale mientras
-- alguien se acuerde, y la siguiente `create table` sin su `revoke` nace con
-- `anon` pudiendo leer, escribir y vaciar; si además se olvida la RLS, queda
-- abierta a internet con solo la clave anónima, que va en cada binario. La fase
-- del escáner añade tablas (caché de faltas, uso por usuario): es justo cuando
-- pasa. Esto lo convierte en estructural.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────
--
--   · Las TABLAS y SECUENCIAS nuevas de `public` nacen sin nada para nadie.
--     Cada migración concede lo que quiere, con nombre y apellidos, que es lo
--     que ya hace este proyecto.
--   · `service_role` incluido. No es un capricho: Supabase ha anunciado que en
--     los proyectos nuevos (desde 2026-05-30) y en todos los existentes
--     (2026-10-30) las tablas de `public` dejan de exponerse solas y `service_role`
--     también necesita GRANT explícito. Aquí, con el valor por defecto, el local
--     seguía en el comportamiento antiguo: `lookup-barcode` habría funcionado en
--     local y fallado con 42501 en un proyecto nuevo.
--
-- Solo afecta a lo que se cree DESPUÉS y a los objetos creados por `postgres`,
-- que es quien ejecuta las migraciones. Las tablas que ya existen no cambian.
--
-- ── Lo que esto NO hace, y por qué ───────────────────────────────────────
--
-- No toca las FUNCIONES. `EXECUTE` sobre una función nueva lo concede PUBLIC por
-- omisión, y quitarlo para todo lo que cree `postgres` (`alter default
-- privileges revoke execute on functions from public`, sin `in schema`) alcanzaría
-- también a las extensiones que se instalen después, pgTAP incluida, y los tests
-- que corren como `authenticated` dejarían de poder llamarlas. Para las funciones
-- la regla sigue siendo la de siempre —`revoke all … from public, anon` en cada
-- una— y lo que la hace cumplir es el test `privilegios_test.sql`, que falla si
-- `anon` puede ejecutar algo que no esté en su lista.
--
-- ═══════════════════════════════════════════════════════════════════════════

alter default privileges in schema public revoke all on tables    from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;

-- ── Lo que se había escapado ──────────────────────────────────────────────
--
-- Salió al escribir el test de privilegios: dos cosas que las migraciones
-- anteriores dejaron abiertas sin que nadie lo notara.

-- Las secuencias de las dos tablas con identidad las tocaban `anon` y
-- `authenticated`. No es explotable —PostgREST no expone secuencias y una
-- columna `generated always as identity` no necesita permiso sobre la suya— pero
-- es superficie que no sirve para nada.
revoke all on sequence public.household_invite_attempts_id_seq from anon, authenticated;
revoke all on sequence public.inventory_events_id_seq          from anon, authenticated;

-- `touch_updated_at` es una función de trigger, y `anon` podía ejecutarla. Un
-- trigger no comprueba EXECUTE de quien lo dispara, solo al crearlo, así que
-- quitarlo no rompe nada.
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ── Lo que `service_role` va a necesitar ──────────────────────────────────
--
-- `lookup-barcode` (fase 2) escribe el catálogo global de `products` con la
-- clave `service_role`, por la decisión D-08. Se concede aquí, con lo mínimo, en
-- vez de descubrir el 42501 el día que se despliegue: SELECT para comprobar si el
-- código ya está, INSERT para guardarlo y UPDATE para refrescarlo. Sin DELETE: la
-- caché no se borra desde una función.
grant select, insert, update on public.products to service_role;
