-- ═══════════════════════════════════════════════════════════════════════════
-- Matriz de privilegios: quién puede tocar qué, comprobado en el catálogo
--
-- La RLS filtra filas; los GRANT deciden quién puede siquiera intentarlo. Son dos
-- capas y hacen falta las dos. Este test vigila la segunda, que es la que falló
-- en silencio una vez: Supabase concede todo a `anon` y `authenticated` sobre
-- cada tabla nueva, las migraciones solo revocaban a `anon`, y `authenticated`
-- se quedó con INSERT, UPDATE y DELETE sobre todo. Ningún test lo notó porque
-- todos comprobaban la RLS, y la RLS estaba bien.
--
-- Aquí no se prueba con una consulta que falle: se lee el catálogo. Así un
-- privilegio de más sale aunque no haya ninguna fila que lo demuestre, y una
-- tabla nueva que llegue sin `revoke` rompe este test el día que se crea, no el
-- día que alguien la explota.
--
-- Si un test de aquí falla porque AÑADISTE una tabla y hay que concederle algo,
-- no lo relajes: añade la tabla a la lista de abajo con lo que de verdad necesita.
--
--   npm run db:test
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

-- ══════════════════════════════════════════════════════════════════════════
-- A · anon: nada. Sin sesión no se toca ninguna tabla
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p') and r.rolname = 'anon'),
  0::bigint,
  'anon no tiene ningún permiso sobre ninguna tabla ni vista de public'
);

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
     join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and c.relkind = 'S' and r.rolname in ('anon', 'authenticated')),
  0::bigint,
  'ni anon ni authenticated tienen permisos sobre ninguna secuencia'
);

-- ══════════════════════════════════════════════════════════════════════════
-- B · Toda tabla tiene RLS. Sin excepciones
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      -- Solo existe en `npm run db:check`: los dobles de pgTAP de PGlite guardan
      -- aquí sus resultados. El pgTAP de verdad no crea ninguna tabla en public.
      and c.relname <> 'pgtap_results'),
  0::bigint,
  'ninguna tabla de public se queda sin RLS'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C · authenticated: lo que puede, y sobre todo lo que NO puede
-- ══════════════════════════════════════════════════════════════════════════

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and c.relkind in ('r', 'p') and r.rolname = 'authenticated'
      and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0::bigint,
  'authenticated no puede vaciar una tabla, ni crear referencias, ni disparadores'
);

-- Las tablas que solo escriben las RPC (y los seeds): nadie con sesión las toca
-- con un INSERT, UPDATE o DELETE suelto. Que aparezca una nueva aquí es una
-- decisión, no un descuido.
select ok(
  not exists (
    select 1
      from unnest(array[
        'households', 'household_members', 'household_invitations',
        'household_invite_attempts', 'household_icons',
        'category_shelf_life_reference', 'open_shelf_life_reference'
      ]) as t(nombre)
     where has_table_privilege('authenticated', 'public.' || t.nombre, 'INSERT')
        or has_table_privilege('authenticated', 'public.' || t.nombre, 'UPDATE')
        or has_table_privilege('authenticated', 'public.' || t.nombre, 'DELETE')
  ),
  'las tablas que solo escriben las funciones no se escriben desde el cliente'
);

select ok(
  not has_table_privilege('authenticated', 'public.household_invite_attempts', 'SELECT'),
  'el registro de intentos de invitar no lo lee ni el propio cliente'
);

-- El registro de eventos es inmutable: se escribe y no se toca más.
select ok(
  has_table_privilege('authenticated', 'public.inventory_events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.inventory_events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.inventory_events', 'DELETE'),
  'los eventos del inventario se pueden añadir, pero no reescribir ni borrar'
);

select ok(
  not has_table_privilege('authenticated', 'public.user_settings', 'DELETE'),
  'nadie borra su fila de ajustes con un delete suelto'
);

-- ── Por columna: la trampa de un INSERT concedido a nivel de tabla ─────────
--
-- Un permiso de tabla cubre TAMBIÉN las columnas que se añadan después. Por eso
-- `household_limit` (cuántas neveras tiene la persona: lo que un plan de pago
-- subirá) se comprueba columna a columna, y por eso los permisos de esa tabla se
-- conceden columna a columna y no de golpe.
select ok(
  not has_column_privilege('authenticated', 'public.user_settings', 'household_limit', 'INSERT')
    and not has_column_privilege('authenticated', 'public.user_settings', 'household_limit', 'UPDATE'),
  'el cliente no puede escribir su propio límite de neveras, ni al crear la fila ni después'
);

select ok(
  not has_column_privilege('authenticated', 'public.user_settings', 'username', 'UPDATE'),
  'ni cambiarse el nombre de usuario: es la identidad'
);

-- ══════════════════════════════════════════════════════════════════════════
-- C2 · service_role: la clave que vivirá en las Edge Functions
-- ══════════════════════════════════════════════════════════════════════════
--
-- Salta la RLS, así que lo único que la acota son sus permisos de tabla. Hoy solo
-- necesita el catálogo global de productos (lookup-barcode, fase 2). Cada función
-- nueva que necesite otra tabla lo pide por escrito en una migración, con el
-- permiso concreto: este test es lo que obliga a hacerlo a la vista.

select is(
  (select count(*)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and r.rolname = 'service_role' and c.relname <> 'products'),
  0::bigint,
  'service_role no tiene ningún permiso sobre ninguna tabla salvo el catálogo de productos'
);

select ok(
  has_table_privilege('service_role', 'public.products', 'SELECT')
    and has_table_privilege('service_role', 'public.products', 'INSERT')
    and has_table_privilege('service_role', 'public.products', 'UPDATE')
    and not has_table_privilege('service_role', 'public.products', 'DELETE')
    and not has_table_privilege('service_role', 'public.products', 'TRUNCATE'),
  'y sobre products puede leer, insertar y actualizar, pero no borrar ni vaciar'
);

-- ══════════════════════════════════════════════════════════════════════════
-- D · Funciones: anon solo puede ejecutar la lista blanca
-- ══════════════════════════════════════════════════════════════════════════
--
-- `EXECUTE` sobre una función nueva lo concede PUBLIC por omisión, y `anon` es
-- miembro de PUBLIC. La regla de este proyecto es `revoke all … from public,
-- anon` en cada función; esto es lo que la hace cumplir. Hoy solo hay una que
-- `anon` necesita: la que dice cuál es el dominio del correo sintético, porque
-- el cliente lo necesita ANTES de tener sesión.

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), array[]::text[])
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      -- Los dobles de pgTAP de `npm run db:check` viven en public. En el pgTAP de
      -- verdad están en el esquema `extensions`, así que aquí no aparecen y esta
      -- lista no afloja nada en la base real.
      and p.proname not in ('no_plan', 'finish', 'ok', 'is', 'lives_ok', 'throws_ok')),
  array['dominio_sintetico']::text[],
  'sin sesión solo se puede ejecutar dominio_sintetico(): ninguna otra función de public'
);

-- ══════════════════════════════════════════════════════════════════════════
-- E · Lo que se cree DESPUÉS nace cerrado
-- ══════════════════════════════════════════════════════════════════════════
--
-- Es lo que arregla `20260924140000_privilegios_por_defecto` y lo que evita que
-- la próxima `create table` sin su `revoke` nazca abierta. Se crea una tabla de
-- verdad, dentro de esta transacción (se deshace al final), y se mira qué
-- permisos trae.

create table public.zz_tabla_recien_creada (id int primary key);

select is(
  (select count(*)
     from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     join pg_roles r on r.oid = a.grantee
    where c.oid = 'public.zz_tabla_recien_creada'::regclass
      and r.rolname in ('anon', 'authenticated', 'service_role')),
  0::bigint,
  'una tabla nueva nace sin permisos para anon, authenticated ni service_role'
);

select * from finish();
rollback;
