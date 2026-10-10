-- ═══════════════════════════════════════════════════════════════════════════
-- Escáner de códigos de barras (fase 2): lo que necesita `lookup-barcode`
--
-- La Edge Function es la primera pieza con la clave `service_role` y la primera
-- que llama a un tercero. El diseño y sus amenazas están en
-- `docs/threat-model.md` §4; esta migración es la parte que vive en la base de
-- datos:
--
--   · Límite de consultas por persona y hacia Open Food Facts (OFF), atómico.
--   · Caché de faltas: lo que OFF no conoce no se vuelve a preguntar en horas.
--   · La ÚNICA vía de escritura al catálogo global, con su propia validación.
--   · Un cierre que faltaba en `create_item`: el producto que se enlaza.
--
-- ── Por qué todo es una función y no permisos de tabla ───────────────────
--
-- `service_role` salta la RLS. Si la función tuviera INSERT y UPDATE sobre
-- `products`, un fallo suyo (o de una dependencia) escribiría lo que quisiera en
-- un catálogo que ve todo el mundo. Aquí no tiene ninguna escritura directa:
-- solo EJECUTA funciones que validan lo que reciben, aunque el código de la
-- función ya lo hubiera filtrado. Dos filtros de dos lenguajes distintos
-- no fallan por la misma razón.
--
-- Las tablas nuevas no se conceden a nadie: nacen cerradas por los privilegios
-- por defecto (`20260924140000`) y solo las tocan estas funciones, que son
-- SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Contadores de uso ─────────────────────────────────────────────────────
--
-- Una fila por clave y ventana de tiempo: `u:<uuid>:m` (minuto de una persona),
-- `u:<uuid>:d` (día de una persona) y `off:m` (minuto de TODAS hacia OFF). El
-- contador sube con un único `insert … on conflict do update`, que es atómico:
-- dos consultas a la vez no pueden leer el mismo número y colarse las dos.
create table public.lookup_usage (
  clave    text        not null check (length(clave) between 1 and 80),
  ventana  timestamptz not null,
  n        integer     not null default 0 check (n >= 0),
  primary key (clave, ventana)
);

comment on table public.lookup_usage is
  'Contadores de consultas del escáner por ventana de tiempo. Solo las funciones '
  'consume_lookup_quota y consume_off_slot la tocan. Se purga a los 2 días.';

create index lookup_usage_ventana_idx on public.lookup_usage (ventana);

alter table public.lookup_usage enable row level security;

-- ── Caché de faltas ───────────────────────────────────────────────────────
--
-- Sin esto, un producto que OFF no tiene (los hay a miles: marcas blancas,
-- granel) costaría una llamada externa CADA vez que alguien lo escaneara, y es
-- justo lo que agota el límite hacia OFF. No guarda quién preguntó.
create table public.barcode_misses (
  barcode    text primary key check (barcode ~ '^[0-9]{8,14}$'),
  missed_at  timestamptz not null default now()
);

comment on table public.barcode_misses is
  'Códigos que Open Food Facts dijo no conocer, para no volver a preguntar durante '
  'unas horas. No guarda quién los consultó.';

create index barcode_misses_missed_at_idx on public.barcode_misses (missed_at);

alter table public.barcode_misses enable row level security;

-- ── Cuota por persona ─────────────────────────────────────────────────────

create function public.consume_lookup_quota(p_user_id uuid)
returns table (permitido boolean, reintentar_en integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Ventanas FIJAS (minuto y día UTC), calculadas desde la época y no con
  -- date_trunc, para que no dependan de la zona horaria de la sesión.
  v_ahora   timestamptz := now();
  v_epoca   bigint      := floor(extract(epoch from now()))::bigint;
  v_min_ini timestamptz := to_timestamp((v_epoca / 60) * 60);
  v_dia_ini timestamptz := to_timestamp((v_epoca / 86400) * 86400);
  v_n_min   integer;
  v_n_dia   integer;
begin
  if p_user_id is null then
    raise exception 'Falta la persona que consulta' using errcode = '22023';
  end if;

  -- Limpieza a ratos y no en cada llamada: así no hay dos consultas peleándose
  -- por borrar las mismas filas, y la tabla no crece sin límite.
  if random() < 0.01 then
    delete from public.lookup_usage where ventana < v_ahora - interval '2 days';
  end if;

  insert into public.lookup_usage as u (clave, ventana, n)
  values ('u:' || p_user_id::text || ':m', v_min_ini, 1)
  on conflict (clave, ventana) do update set n = u.n + 1
  returning u.n into v_n_min;

  insert into public.lookup_usage as u (clave, ventana, n)
  values ('u:' || p_user_id::text || ':d', v_dia_ini, 1)
  on conflict (clave, ventana) do update set n = u.n + 1
  returning u.n into v_n_dia;

  -- 30 por minuto y 500 por día. Los intentos denegados también cuentan: quien
  -- sigue golpeando no recupera el cupo antes.
  if v_n_min > 30 then
    return query select false, (60 - (v_epoca % 60))::integer;
  elsif v_n_dia > 500 then
    return query select false, (86400 - (v_epoca % 86400))::integer;
  else
    return query select true, 0;
  end if;
end;
$$;

comment on function public.consume_lookup_quota(uuid) is
  'Cuenta una consulta del escáner de esta persona y dice si cabe: 30 por minuto y '
  '500 por día. Atómica. Solo service_role.';

-- ── Hueco global hacia Open Food Facts ────────────────────────────────────

create function public.consume_off_slot()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_epoca bigint := floor(extract(epoch from now()))::bigint;
  v_n     integer;
begin
  insert into public.lookup_usage as u (clave, ventana, n)
  values ('off:m', to_timestamp((v_epoca / 60) * 60), 1)
  on conflict (clave, ventana) do update set n = u.n + 1
  returning u.n into v_n;

  -- 10 por minuto entre TODAS las personas. OFF pide no abusar de su API, y un
  -- aluvión de consultas legítimas desde muchas cuentas también cuenta.
  return v_n <= 10;
end;
$$;

comment on function public.consume_off_slot() is
  'Reserva una llamada a Open Food Facts: 10 por minuto entre todas las personas. '
  'Solo service_role.';

-- ── Caché de faltas: leer y escribir ──────────────────────────────────────

create function public.is_recent_barcode_miss(p_barcode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.barcode_misses
     where barcode = p_barcode and missed_at > now() - interval '6 hours'
  );
$$;

comment on function public.is_recent_barcode_miss(text) is
  '¿Dijo Open Food Facts hace menos de 6 horas que no conoce este código? '
  'Solo service_role.';

create function public.record_barcode_miss(p_barcode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_barcode is null or p_barcode !~ '^[0-9]{8,14}$' then
    raise exception 'Código de barras no válido' using errcode = '22023';
  end if;

  insert into public.barcode_misses (barcode, missed_at)
  values (p_barcode, now())
  on conflict (barcode) do update set missed_at = excluded.missed_at;

  if random() < 0.05 then
    delete from public.barcode_misses where missed_at < now() - interval '7 days';
  end if;
end;
$$;

comment on function public.record_barcode_miss(text) is
  'Anota que Open Food Facts no conoce este código. Solo service_role.';

-- ── Escribir en el catálogo global ────────────────────────────────────────
--
-- La única vía. Revalida TODO lo que `lookup-barcode` ya filtró, porque lo que
-- entra aquí lo ve toda la gente que use la app y, en la fase 5, el modelo:
--
--   · nada de caracteres de control, de formato (ancho cero, bidireccionales) ni
--     de marcado (< >) en nombre ni marca;
--   · la imagen, solo del dominio de imágenes de OFF: otra URL convertiría el
--     catálogo en un píxel de seguimiento;
--   · las categorías, con el formato exacto de OFF;
--   · cantidad y familia, las dos o ninguna.
--
-- Los días de conservación tras abrir (`open_shelf_life_days`) NO se tocan: los
-- pone a mano quien cura el catálogo y un refresco de OFF no los pisa.

create function public.upsert_global_product(
  p_barcode          text,
  p_name             text,
  p_brand            text,
  p_unit_family      public.unit_family,
  p_net_quantity     numeric,
  p_image_url        text,
  p_categories_tags  text[],
  p_payload          jsonb
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Control, DEL y C1; espacios de ancho cero y marcas direccionales; separadores
  -- de línea y párrafo y formato bidireccional; el «sin ancho» de BOM, el guion
  -- blando y el marcado.
  c_prohibido constant text :=
    '[\u0001-\u001F\u007F-\u009F­​-‏ -‮⁠-⁯﻿<>]';
  v_nombre text := trim(p_name);
  v_marca  text := nullif(trim(p_brand), '');
  v_fila   public.products;
begin
  if p_barcode is null or p_barcode !~ '^[0-9]{8,14}$' then
    raise exception 'Código de barras no válido' using errcode = '22023';
  end if;

  if v_nombre is null or length(v_nombre) not between 1 and 120 or v_nombre ~ c_prohibido then
    raise exception 'Nombre de producto no válido' using errcode = '22023';
  end if;

  if v_marca is not null and (length(v_marca) > 80 or v_marca ~ c_prohibido) then
    raise exception 'Marca no válida' using errcode = '22023';
  end if;

  if (p_unit_family is null) <> (p_net_quantity is null) then
    raise exception 'La cantidad y su familia de unidades van juntas o no va ninguna'
      using errcode = '22023';
  end if;

  if p_net_quantity is not null and (p_net_quantity <= 0 or p_net_quantity > 1000000) then
    raise exception 'Cantidad no válida' using errcode = '22023';
  end if;

  if p_image_url is not null
     and p_image_url !~ '^https://images\.openfoodfacts\.org/[A-Za-z0-9_./%-]{1,250}$' then
    raise exception 'Imagen no válida' using errcode = '22023';
  end if;

  if p_categories_tags is not null and (
       cardinality(p_categories_tags) > 40
       or exists (
         select 1 from unnest(p_categories_tags) as t(etiqueta)
          where etiqueta is null or etiqueta !~ '^[a-z]{2}:[a-z0-9-]{1,80}$'
       )
     ) then
    raise exception 'Categorías no válidas' using errcode = '22023';
  end if;

  if p_payload is not null and length(p_payload::text) > 8192 then
    raise exception 'Datos de origen demasiado grandes' using errcode = '22023';
  end if;

  insert into public.products as p
    (household_id, barcode, name, brand, unit_family, net_quantity, image_url,
     categories_tags, data_source, off_payload)
  values
    (null, p_barcode, v_nombre, v_marca, p_unit_family, p_net_quantity, p_image_url,
     p_categories_tags, 'openfoodfacts', p_payload)
  on conflict (barcode) where household_id is null and barcode is not null
  do update set
    name            = excluded.name,
    brand           = excluded.brand,
    unit_family     = excluded.unit_family,
    net_quantity    = excluded.net_quantity,
    image_url       = excluded.image_url,
    categories_tags = excluded.categories_tags,
    off_payload     = excluded.off_payload
  returning p.* into v_fila;

  return v_fila;
end;
$$;

comment on function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb
) is
  'La única vía de escritura al catálogo global. Revalida nombre, marca, imagen, '
  'categorías y cantidad aunque la Edge Function ya los filtrara. Solo service_role.';

comment on column public.products.off_payload is
  'Subconjunto YA FILTRADO de la ficha de Open Food Facts (no la respuesta cruda). '
  'Es texto de un wiki público: entrada no confiable. Nunca se interpola en un '
  'prompt sin encapsular.';

-- ── Permisos ──────────────────────────────────────────────────────────────
--
-- `create function` concede EXECUTE a PUBLIC por omisión, y `anon` es miembro de
-- PUBLIC: se quita de todas, y solo `service_role` las ejecuta.

revoke all on function public.consume_lookup_quota(uuid)            from public, anon, authenticated;
revoke all on function public.consume_off_slot()                    from public, anon, authenticated;
revoke all on function public.is_recent_barcode_miss(text)          from public, anon, authenticated;
revoke all on function public.record_barcode_miss(text)             from public, anon, authenticated;
revoke all on function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb
) from public, anon, authenticated;

grant execute on function public.consume_lookup_quota(uuid)         to service_role;
grant execute on function public.consume_off_slot()                 to service_role;
grant execute on function public.is_recent_barcode_miss(text)       to service_role;
grant execute on function public.record_barcode_miss(text)          to service_role;
grant execute on function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb
) to service_role;

-- `service_role` deja de poder escribir en `products`: ahora lo hace a través de
-- `upsert_global_product`, que valida. Conserva SELECT para comprobar si un
-- código ya está.
revoke insert, update on public.products from service_role;

-- ── La imagen de un producto, de cualquier producto ───────────────────────
--
-- La ficha del elemento pinta `image_url` tal cual. Para el catálogo global ya lo
-- garantiza `upsert_global_product`, pero un producto PRIVADO lo escribe su
-- propia nevera con un insert directo: sin esto, una persona con acceso a una
-- nevera compartida podría poner la URL de su servidor y enterarse de cuándo y
-- desde qué IP abre cada compañera el producto. La app solo recibe imágenes de
-- Open Food Facts, así que es lo único que se admite.
alter table public.products
  add constraint products_image_url_ck check (
    image_url is null
    or image_url ~ '^https://images\.openfoodfacts\.org/[A-Za-z0-9_./%-]{1,250}$'
  );

-- ── create_item: el producto que se enlaza ────────────────────────────────
--
-- Hasta ahora ningún cliente mandaba `p_product_id` (el alta era siempre a mano),
-- así que nadie había mirado qué pasa si se manda uno. Con el escáner se manda
-- siempre. La clave foránea comprueba que el producto EXISTE, no que sea
-- visible para quien llama: sin esto, se podía enlazar un elemento a un producto
-- privado de otra nevera con solo conocer su uuid. Ahora el producto tiene que
-- ser del catálogo global o de la MISMA nevera donde se guarda.
--
-- Mismo mensaje para «no existe» y «no es tuyo», por la misma razón que en la
-- comprobación de la nevera: si fueran distintos, una lista de uuids diría cuáles
-- existen.
create or replace function public.create_item(
  p_household_id  uuid,
  p_name          text,
  p_unit_family   public.unit_family,
  p_display_unit  public.measurement_unit,
  p_quantity      numeric,
  p_location      public.storage_location default 'pantry',
  p_limit_date    date                    default null,
  p_date_kind     public.date_kind        default null,
  p_date_source   public.date_source      default null,
  p_product_id    uuid                    default null,
  p_notes         text                    default null,
  p_category      public.food_category    default 'otros'
)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  if p_household_id is null then
    raise exception 'Elige en qué nevera lo guardas.' using errcode = '22023';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Esa nevera no existe o no es tuya. Elige una de tus neveras y vuelve a probar.'
      using errcode = 'P0002';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad tiene que ser mayor que cero' using errcode = '22023';
  end if;

  if num_nonnulls(p_limit_date, p_date_kind, p_date_source) not in (0, 3) then
    raise exception 'Una fecha necesita saber de qué tipo es y de dónde sale'
      using errcode = '22023';
  end if;

  if p_product_id is not null and not exists (
    select 1 from public.products
     where id = p_product_id
       and (household_id is null or household_id = p_household_id)
  ) then
    raise exception 'Ese producto no existe o no es de esta nevera. Vuelve a escanearlo.'
      using errcode = 'P0002';
  end if;

  insert into public.inventory_items (
    household_id, product_id, name, location, category,
    unit_family, display_unit, initial_quantity, remaining_quantity,
    limit_date, date_kind, date_source, notes, created_by
  )
  values (
    p_household_id, p_product_id, trim(p_name), p_location, coalesce(p_category, 'otros'),
    p_unit_family, p_display_unit, p_quantity, p_quantity,
    p_limit_date, p_date_kind, p_date_source, p_notes, (select auth.uid())
  )
  returning * into v_item;

  perform public.record_inventory_event(v_item, 'created');
  return v_item;
end;
$$;
