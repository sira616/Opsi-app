-- ═══════════════════════════════════════════════════════════════════════════
-- `service_role` solo con lo que de verdad usa
--
-- `service_role` es la clave que va a vivir DENTRO de las Edge Functions (fase 2
-- en adelante) y salta la RLS. Es la más poderosa del sistema, y la única regla
-- que la acota son sus permisos de tabla.
--
-- Al revisar el catálogo salió que, en las tablas que ya existían, conserva
-- TRUNCATE, REFERENCES, TRIGGER y MAINTAIN: son los permisos «de fábrica» que
-- Supabase concede a sus tres roles sobre cada tabla nueva, y las migraciones de
-- la fase 0 solo revocaron los de `anon` y `authenticated`. (SELECT, INSERT,
-- UPDATE y DELETE ya no los tiene, salvo en `products`: lo quitó, sin decirlo, el
-- `revoke all` de 20260922120000.)
--
-- Nada de eso hace falta. Una función que escribe el catálogo de productos no
-- necesita poder vaciar la tabla de eventos, y si la clave se filtrara —o una
-- dependencia de una Edge Function se viera comprometida— que la lista de
-- lo que puede hacer sea la más corta posible.
--
-- ── Qué hace ──────────────────────────────────────────────────────────────
--
--   · Quita TODO a `service_role` en todas las tablas de `public`.
--   · Devuelve solo lo que `lookup-barcode` necesita: leer, insertar y actualizar
--     el catálogo global en `products`. Sin DELETE: la caché no se borra desde una
--     función. (Es lo mismo que ya concedía 20260924140000; se repite aquí para
--     que esta migración deje el estado entero a la vista, no a medias.)
--
-- Las tablas nuevas ya nacen sin nada para `service_role` desde 20260924140000.
-- Cuando una función nueva necesite una tabla, se pide aquí por escrito, con el
-- permiso concreto y el motivo, como `daily-digest` hará con `user_settings`.
--
-- No toca las secuencias: PostgREST no las expone y `service_role` no las usa.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on all tables in schema public from service_role;

grant select, insert, update on public.products to service_role;
