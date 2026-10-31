-- ═════════════════════════════════════════════════════════════════
-- Marcas en los tickets: lo que la persona confirma y lo que hace falta para resolverlo
--
-- Al leer un ticket (opsi-ticket, 20261028) Opsi saca los nombres de los productos. Esto añade la capa
-- que intenta saber QUÉ producto es cada uno y de qué marca (opsi-marcas, _shared/resolver.ts), sin
-- inventar ninguna. Es 100 % ADITIVO: no toca ninguna tabla, función ni dato que ya existan.
--
-- Qué hay:
--
--   1. `ticket_associations`   lo que ESTA persona confirmó: «el texto de ticket X, en la tienda Y, es este
--                              producto de esta marca». Es suyo (la RLS le deja leer y borrar las suyas) y solo se
--                              escribe por función, y solo tras una confirmación explícita en la pantalla.
--   2. `ticket_associations_for`   las asociaciones de una tanda de líneas, sin enlazar a productos que la
--                              nevera de destino no puede ver.
--   3. `confirm_ticket_association` / `update_ticket_association`   guardar y corregir.
--   4. `search_catalog`        busca por palabras en el catálogo que la persona ya ve (el global y los
--                              privados de UNA nevera): sin extensiones, para el primer paso del resolutor.
--   5. `ensure_private_product`   el producto privado de una nevera por nombre y marca, UNO solo: es lo
--                              que evita crear un duplicado cada vez que el mismo artículo sale en un
--                              ticket nuevo.
--   6. `consume_off_search`    el cupo de búsquedas por texto hacia Open Food Facts, por persona y global.
--
-- Qué NO hay, a propósito:
--
--   · Ninguna tabla de tickets ni de líneas de ticket. Un ticket no se guarda (la foto tampoco): lo que
--     queda de él es el elemento de inventario, enlazado al producto del catálogo si se pudo, y la
--     asociación que la persona confirmó. Guardar cada ticket sería guardar dónde y qué compra alguien
--     día a día, y nada de lo que hace Opsi lo necesita.
--   · Ninguna extensión (pg_trgm, unaccent) ni columna nueva en `products`: la búsqueda por palabras
--     funciona con lo que ya hay. Si el catálogo llega a decenas de miles de filas, aquí es donde
--     se pondría un índice de trigramas.
--   · Ninguna caché de resultados de Open Food Facts en la base de datos: escribirla exigiría la clave
--     de servicio o dejar que el cliente la escriba, y una caché global que escribe el cliente es una
--     caché que envenena cualquiera.
-- ═════════════════════════════════════════════════════════════════

-- ── 1 · Las asociaciones confirmadas ───────────────────────────────────────

create table public.ticket_associations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,

  -- El texto impreso de la línea, normalizado por el servidor (minúsculas, sin acentos, sin el
  -- importe del final) y la tienda del ticket ('' = no se sabía). Los números y las unidades se
  -- CONSERVAN: «leche entera 1l» y «leche entera 200ml» son dos asociaciones distintas.
  line_key       text not null check (line_key ~ '^[a-z0-9.% ]{1,160}$' and line_key = trim(line_key)),
  store_key      text not null default '' check (store_key ~ '^[a-z0-9.% ]{0,40}$' and store_key = trim(store_key)),

  -- A qué producto del catálogo apunta, si apunta a alguno. Si el producto se borra, la asociación
  -- sigue: lo que la persona confirmó es el nombre y la marca, que se guardan aparte.
  product_id     uuid references public.products (id) on delete set null,
  name           text not null check (length(trim(name)) between 1 and 200),
  -- Null = «marca sin identificar», que es una respuesta válida.
  brand          text check (brand is null or length(trim(brand)) between 1 and 120),
  barcode        text check (barcode ~ '^[0-9]{8,14}$'),
  unit_family    public.unit_family,
  net_quantity   numeric check (net_quantity > 0 and net_quantity <= 1000000),

  -- De dónde salió lo que la persona confirmó, y la puntuación interna con la que se propuso (0–100).
  -- Es trazabilidad, no una probabilidad: ver _shared/resolver.ts.
  source         text not null check (source in ('history', 'catalog', 'off', 'supermarket', 'manual')),
  match_score    smallint check (match_score between 0 and 100),

  -- Cuántas veces la ha confirmado igual. Una corrección que cambia el producto o la marca vuelve a 1.
  confirmations  integer not null default 1 check (confirmations >= 1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint ticket_associations_unit_ck check ((unit_family is null) = (net_quantity is null)),
  constraint ticket_associations_key_uq unique (user_id, store_key, line_key)
);

comment on table public.ticket_associations is
  'Lo que una persona confirmó al revisar un ticket: texto de línea + tienda → producto y marca. Solo suyo, '
  'solo por función y solo tras una confirmación explícita. La RLS deja a su dueña leer y borrar las suyas.';

create index ticket_associations_user_line_idx on public.ticket_associations (user_id, line_key);

alter table public.ticket_associations enable row level security;

create policy ticket_associations_select on public.ticket_associations
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Borrar es un derecho que no depende del plan: quien deja de ser premium sigue pudiendo vaciar lo suyo.
create policy ticket_associations_delete on public.ticket_associations
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Leer y borrar las suyas, sí. Escribir, no: se escribe por función (que mira el plan, valida el formato y
-- acota cuántas hay), y un INSERT suelto se saltaría todo eso.
revoke all on public.ticket_associations from public, anon, authenticated, service_role;
grant select, delete on public.ticket_associations to authenticated;

-- ── 2 · Las asociaciones de una tanda de líneas ────────────────────────────

create function public.ticket_associations_for(p_keys text[], p_household_id uuid)
returns table (
  line_key      text,
  store_key     text,
  product_id    uuid,
  name          text,
  brand         text,
  barcode       text,
  unit_family   public.unit_family,
  net_quantity  numeric,
  confirmations integer
)
language sql
stable
set search_path = ''
as $$
  -- SECURITY INVOKER: la RLS de la tabla deja ver solo las de quien llama. Si el producto es privado de
  -- OTRA nevera, se devuelve sin enlazar: guardarlo en esta daría "no es de esta nevera".
  select a.line_key, a.store_key,
         case
           when a.product_id is null then null
           when exists (
             select 1 from public.products p
              where p.id = a.product_id
                and (p.household_id is null or p.household_id = p_household_id)
           ) then a.product_id
           else null
         end,
         a.name, a.brand, a.barcode, a.unit_family, a.net_quantity, a.confirmations
    from public.ticket_associations a
   where a.user_id = (select auth.uid())
     and a.line_key = any (p_keys[1:60])
   limit 120;
$$;

comment on function public.ticket_associations_for(text[], uuid) is
  'Las asociaciones confirmadas de QUIEN LLAMA para estas claves de línea (60 como mucho), con el producto '
  'sin enlazar si es privado de una nevera distinta de la indicada. SECURITY INVOKER: la RLS manda.';

-- ── 3 · Confirmar y corregir ───────────────────────────────────────────────

create function public.confirm_ticket_association(
  p_line_key      text,
  p_store_key     text,
  p_name          text,
  p_brand         text,
  p_product_id    uuid,
  p_barcode       text,
  p_unit_family   public.unit_family,
  p_net_quantity  numeric,
  p_source        text,
  p_match_score   integer
)
returns public.ticket_associations
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max   constant integer := 2000;
  v_user  uuid := auth.uid();
  v_brand text := nullif(trim(p_brand), '');
  v_store text := coalesce(trim(p_store_key), '');
  v_fila  public.ticket_associations;
  v_ya    boolean;
begin
  -- Quién es sale de la sesión, nunca de un argumento.
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '28000';
  end if;

  -- Recordar lo confirmado es de Premium, como leer el ticket: se mira antes de escribir nada.
  if public.my_plan() <> 'premium' then
    raise exception 'Recordar marcas es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
  end if;

  -- El producto, si se da, tiene que ser uno que quien llama VEA: este código corre con permisos
  -- de la base de datos (se salta la RLS), así que la comprobación es explícita.
  if p_product_id is not null and not exists (
    select 1 from public.products p
     where p.id = p_product_id
       and (p.household_id is null or public.is_household_member(p.household_id))
  ) then
    raise exception 'Ese producto no existe o no es tuyo.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ticket_assoc:' || v_user::text, 0));

  -- Un tope por persona: si ya hay 2000 y esta es nueva, sale la que hace más que no se toca.
  select exists (
    select 1 from public.ticket_associations
     where user_id = v_user and store_key = v_store and line_key = p_line_key
  ) into v_ya;
  if not v_ya and (select count(*) from public.ticket_associations where user_id = v_user) >= c_max then
    delete from public.ticket_associations
     where id = (
       select id from public.ticket_associations
        where user_id = v_user order by updated_at asc, created_at asc limit 1
     );
  end if;

  insert into public.ticket_associations as a (
    user_id, line_key, store_key, product_id, name, brand, barcode, unit_family, net_quantity, source, match_score
  )
  values (
    v_user, p_line_key, v_store, p_product_id, trim(p_name), v_brand, p_barcode, p_unit_family, p_net_quantity,
    p_source, p_match_score
  )
  on conflict (user_id, store_key, line_key) do update
    set product_id    = excluded.product_id,
        name          = excluded.name,
        brand         = excluded.brand,
        barcode       = excluded.barcode,
        unit_family   = excluded.unit_family,
        net_quantity  = excluded.net_quantity,
        source        = excluded.source,
        match_score   = excluded.match_score,
        -- La misma respuesta otra vez suma; una corrección empieza de nuevo.
        confirmations = case
          when a.product_id is not distinct from excluded.product_id
           and a.barcode is not distinct from excluded.barcode
           and lower(coalesce(a.brand, '')) = lower(coalesce(excluded.brand, ''))
           and lower(a.name) = lower(excluded.name)
          then a.confirmations + 1
          else 1
        end,
        updated_at    = now()
  returning * into v_fila;

  return v_fila;
end;
$$;

comment on function public.confirm_ticket_association(text, text, text, text, uuid, text, public.unit_family, numeric, text, integer) is
  'Premium. Guarda lo que QUIEN LLAMA confirmó para una línea de ticket (y una tienda), o lo corrige: la misma '
  'respuesta suma una confirmación, otra distinta la sustituye. Máximo 2000 por persona. SECURITY DEFINER porque '
  'la tabla no admite escrituras sueltas.';

create function public.update_ticket_association(p_id uuid, p_name text, p_brand text)
returns public.ticket_associations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_fila public.ticket_associations;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '28000';
  end if;

  -- Corregir lo propio no depende del plan. Es una corrección a mano: deja de apuntar al producto del
  -- catálogo (que podía tener otra marca) y pasa a ser lo que la persona dice.
  update public.ticket_associations
     set name = trim(p_name),
         brand = nullif(trim(p_brand), ''),
         product_id = null,
         barcode = null,
         unit_family = null,
         net_quantity = null,
         source = 'manual',
         match_score = null,
         confirmations = 1,
         updated_at = now()
   where id = p_id and user_id = v_user
  returning * into v_fila;

  if not found then
    raise exception 'Esa marca ya no está.' using errcode = 'P0002';
  end if;
  return v_fila;
end;
$$;

comment on function public.update_ticket_association(uuid, text, text) is
  'Corrige a mano el nombre y la marca de una asociación de QUIEN LLAMA (no depende del plan). Deja de apuntar al '
  'producto del catálogo. P0002 si no existe o no es suya.';

-- ── 4 · Buscar en el catálogo que la persona ya ve ─────────────────────────

create function public.search_catalog(p_words text[], p_household_id uuid, p_barcode text default null)
returns table (
  id              uuid,
  household_id    uuid,
  barcode         text,
  name            text,
  brand           text,
  unit_family     public.unit_family,
  net_quantity    numeric,
  image_url       text,
  categories_tags text[]
)
language sql
stable
set search_path = ''
as $$
  -- SECURITY INVOKER: la RLS de `products` deja ver el global y los privados de las neveras de quien llama;
  -- además se pide UNA nevera, porque guardar un elemento enlazado a un producto privado de otra falla.
  -- Las palabras se aceptan solo como letras y cifras (nada de comodines) y se buscan sin acentos.
  with palabras as (
    select distinct w
      from unnest(p_words[1:6]) as w
     where w ~ '^[a-z0-9]{3,30}$'
  ),
  catalogo as (
    select p.*,
           translate(lower(coalesce(p.brand, '') || ' ' || p.name), 'áéíóúüñàèìòùç', 'aeiouunaeiouc') as pajar
      from public.products p
     where p.household_id is null or p.household_id = p_household_id
  ),
  puntuado as (
    select c.id, c.household_id, c.barcode, c.name, c.brand, c.unit_family, c.net_quantity, c.image_url, c.categories_tags,
           (select count(*) from palabras w where c.pajar like '%' || w.w || '%')
             + case when p_barcode ~ '^[0-9]{8,14}$' and c.barcode = p_barcode then 100 else 0 end as aciertos
      from catalogo c
  )
  select u.id, u.household_id, u.barcode, u.name, u.brand, u.unit_family, u.net_quantity, u.image_url, u.categories_tags
    from puntuado u
   where u.aciertos > 0
   order by u.aciertos desc, (u.household_id is null) desc, u.name
   limit 30;
$$;

comment on function public.search_catalog(text[], uuid, text) is
  'Productos del catálogo que quien llama ve (el global y los privados de UNA nevera) que contienen alguna de '
  'estas palabras (6 como mucho, sin acentos) o tienen este código, los que más aciertan primero. 30 como mucho. '
  'SECURITY INVOKER: la RLS manda.';

-- ── 5 · El producto privado de una nevera, uno solo ────────────────────────

create function public.ensure_private_product(p_household_id uuid, p_name text, p_brand text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_name  text := trim(p_name);
  v_brand text := nullif(trim(p_brand), '');
  v_id    uuid;
begin
  if p_household_id is null or not public.is_household_member(p_household_id) then
    raise exception 'Esa nevera no existe o no es tuya.' using errcode = 'P0002';
  end if;
  if v_name is null or length(v_name) not between 1 and 200 or length(coalesce(v_brand, '')) > 120 then
    raise exception 'El nombre o la marca no son válidos.' using errcode = '22023';
  end if;

  -- Dos tickets a la vez con el mismo artículo no crean dos productos: el segundo espera y lo encuentra.
  perform pg_advisory_xact_lock(
    hashtextextended('private_product:' || p_household_id::text || ':' || lower(v_name) || ':' || lower(coalesce(v_brand, '')), 0)
  );

  select p.id into v_id
    from public.products p
   where p.household_id = p_household_id
     and p.barcode is null
     and lower(trim(p.name)) = lower(v_name)
     and lower(coalesce(trim(p.brand), '')) = lower(coalesce(v_brand, ''))
   order by p.created_at
   limit 1;

  if v_id is null then
    insert into public.products (household_id, name, brand, data_source)
    values (p_household_id, v_name, v_brand, 'user')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

comment on function public.ensure_private_product(uuid, text, text) is
  'El producto privado SIN código de barras de esta nevera con este nombre y esta marca (sin distinguir mayúsculas), '
  'o lo crea. Devuelve su id. SECURITY INVOKER: la RLS exige ser miembro, y un producto privado solo lo ve su nevera.';

-- ── 6 · El cupo de búsquedas hacia Open Food Facts ─────────────────────────

create function public.consume_off_search(p_n integer default 1)
returns table (concedidas integer, reintentar_en integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_por_hora   constant integer := 60;  -- por persona
  c_por_minuto constant integer := 10;  -- entre TODAS las personas
  v_user    uuid := auth.uid();
  v_epoca   bigint := floor(extract(epoch from now()))::bigint;
  v_n       integer := least(greatest(coalesce(p_n, 1), 1), 12);
  v_total   integer;
  v_pedidas integer := v_n;
  v_espera  integer := 0;
begin
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '28000';
  end if;

  -- Leer tickets es de Premium: sin plan no se toca ni un contador.
  if public.my_plan() <> 'premium' then
    raise exception 'Leer tickets es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
  end if;

  if random() < 0.01 then
    delete from public.lookup_usage where ventana < now() - interval '2 days';
  end if;

  -- Primero el tope de ESTA persona. Si no cabe, no se toca el global: una cuenta que insiste no puede
  -- gastar el cupo de las demás más allá del suyo propio.
  insert into public.lookup_usage as u (clave, ventana, n)
  values ('os:' || v_user::text || ':h', to_timestamp((v_epoca / 3600) * 3600), v_n)
  on conflict (clave, ventana) do update set n = u.n + v_n
  returning u.n into v_total;
  v_n := greatest(0, least(v_n, c_por_hora - (v_total - v_n)));
  if v_n < v_pedidas then
    v_espera := (3600 - (v_epoca % 3600))::integer;
  end if;
  if v_n = 0 then
    return query select 0, v_espera;
    return;
  end if;

  -- Después el global, que es por minuto y distinto del de los códigos de barras (`off:m`).
  v_pedidas := v_n;
  insert into public.lookup_usage as u (clave, ventana, n)
  values ('offs:m', to_timestamp((v_epoca / 60) * 60), v_n)
  on conflict (clave, ventana) do update set n = u.n + v_n
  returning u.n into v_total;
  v_n := greatest(0, least(v_n, c_por_minuto - (v_total - v_n)));
  if v_n < v_pedidas then
    v_espera := greatest(v_espera, (60 - (v_epoca % 60))::integer);
  end if;

  return query select v_n, v_espera;
end;
$$;

comment on function public.consume_off_search(integer) is
  'Premium. Reserva hasta p_n (máx. 12) búsquedas de texto hacia Open Food Facts: 60 por hora por persona y 10 '
  'por minuto entre todas (aparte del de códigos de barras). Devuelve cuántas se conceden y cuánto esperar para '
  'el resto. Los intentos denegados también cuentan. SECURITY DEFINER porque la tabla no concede nada a nadie.';

-- ── Permisos ──────────────────────────────────────────────────────────────
--
-- Supabase concede EXECUTE a `anon` y `authenticated` sobre cada función nueva. Se quita todo y se vuelve
-- a dar solo a quien tiene sesión; ni `anon` ni `service_role` ejecutan nada de esto (lo vigila privilegios_test.sql).

revoke all on function public.ticket_associations_for(text[], uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_ticket_association(text, text, text, text, uuid, text, public.unit_family, numeric, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.update_ticket_association(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.search_catalog(text[], uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.ensure_private_product(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.consume_off_search(integer) from public, anon, authenticated, service_role;

grant execute on function public.ticket_associations_for(text[], uuid) to authenticated;
grant execute on function public.confirm_ticket_association(text, text, text, text, uuid, text, public.unit_family, numeric, text, integer) to authenticated;
grant execute on function public.update_ticket_association(uuid, text, text) to authenticated;
grant execute on function public.search_catalog(text[], uuid, text) to authenticated;
grant execute on function public.ensure_private_product(uuid, text, text) to authenticated;
grant execute on function public.consume_off_search(integer) to authenticated;
