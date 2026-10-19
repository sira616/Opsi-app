-- ═══════════════════════════════════════════════════════════════════════════
-- Salud e ingredientes: lo que lleva un producto y lo que evita cada persona
--
-- Dos cosas que se guardan POR SEPARADO y que el servidor no cruza jamás:
--
--   1. La ficha del producto (catálogo global, caché de Open Food Facts) guarda
--      ahora alérgenos, trazas, las etiquetas «sin gluten» y «sin lactosa» y el
--      texto de ingredientes.
--   2. Cada persona guarda qué alérgenos o intolerancias evita
--      (`user_health_preferences`).
--
-- El cruce «lo que evito × lo que lleva este producto» se hace en el MÓVIL. Ninguna
-- función de la base de datos ni de la Edge Function lee las preferencias de salud:
-- si alguna lo hiciera, un fallo suyo (o de la clave `service_role`, que salta la
-- RLS) las sacaría de la base de datos. Y los avisos son solo avisos: nunca se
-- prohíbe añadir un producto.
--
-- ── «Sin datos» no es «sin alérgenos» ──────────────────────────────────────
--
-- Lo peor que puede hacer esta función es que un producto de cuya ficha no sabemos
-- nada parezca apto. Por eso `health_data_at` guarda CUÁNDO se trajeron estos datos
-- de OFF, y es la única forma de distinguir los dos casos:
--
--   · `health_data_at` NULL  → no consta. Una ficha de antes de esta migración, o un
--                              producto escrito a mano. Las demás columnas, NULL.
--   · `health_data_at` fecha → OFF se consultó ese día. `allergens_tags = '{}'`
--                              significa «OFF no declara ninguno», no «no sé».
--
-- Una ficha sin `health_data_at` se trata como caducada y `lookup-barcode` la renueva
-- desde OFF la próxima vez que alguien la escanee.
--
-- ── Quién puede escribir estas columnas ────────────────────────────────────
--
-- Solo el catálogo global, y solo por `upsert_global_product`. Un producto PRIVADO de
-- una nevera lo escribe cualquiera de sus miembros con un insert directo (la RLS de
-- `products` se lo permite), así que sin el CHECK `products_health_global_only_ck`
-- una persona podría guardar ahí `health_data_at` y `allergens_tags = '{}'` y
-- fingir ante sus compañeros un «sin alérgenos» que nadie ha comprobado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La ficha del producto ─────────────────────────────────────────────

alter table public.products
  add column allergens_tags   text[],
  add column traces_tags      text[],
  add column labels_tags      text[],
  add column ingredients_text text,
  add column health_data_at   timestamptz;

comment on column public.products.allergens_tags is
  'Alérgenos que Open Food Facts declara en la ficha (allergens_tags), p. ej. '
  '{en:milk,en:gluten}. Solo catálogo global. NULL = no consta (mira health_data_at); '
  '{} = OFF se consultó y no declara ninguno. Es texto de un wiki público: entrada no '
  'confiable, ya filtrada por formato.';

comment on column public.products.traces_tags is
  'Trazas que OFF declara (traces_tags): «puede contener». Mismo formato y mismas '
  'reglas que allergens_tags.';

comment on column public.products.labels_tags is
  'Solo las etiquetas de una lista CERRADA (en:no-gluten, en:no-lactose, '
  'en:suitable-for-celiacs) de las labels_tags de OFF; el resto se descarta. Son '
  'declaraciones del fabricante o de quien edita la ficha, no una garantía: la app '
  'las enseña como «según Open Food Facts».';

comment on column public.products.ingredients_text is
  'Ingredientes en español (o, si no hay, el texto original), de OFF: máximo 2000 '
  'caracteres, acabado en «…» si se recortó y sin los guiones bajos con los que OFF '
  'marca los alérgenos. Es texto de un wiki público: entrada no confiable. Nunca se '
  'interpola en un prompt sin encapsular.';

comment on column public.products.health_data_at is
  'Cuándo se trajeron de OFF los datos de salud (alérgenos, trazas, etiquetas, '
  'ingredientes). NULL = no consta: ficha anterior a esta función o producto escrito '
  'a mano. Es lo que distingue «no sé» de «OFF no declara nada».';

-- Las dos mitades de una ficha: o no consta nada, o se consultó y las tres listas
-- existen (aunque vacías). Los ingredientes sí pueden faltar: OFF no siempre los tiene.
alter table public.products
  add constraint products_health_coherent_ck check (
    (health_data_at is null
       and allergens_tags is null and traces_tags is null
       and labels_tags is null and ingredients_text is null)
    or
    (health_data_at is not null
       and allergens_tags is not null and traces_tags is not null
       and labels_tags is not null)
  );

-- Lo que impide falsear un «sin alérgenos» desde una nevera: ver la cabecera. Se
-- nombran las cinco columnas a propósito en vez de apoyarse en la coherencia de
-- arriba: este CHECK tiene que sostenerse solo.
alter table public.products
  add constraint products_health_global_only_ck check (
    household_id is null
    or (health_data_at is null
        and allergens_tags is null and traces_tags is null
        and labels_tags is null and ingredients_text is null)
  );

-- Topes y lista cerrada. El FORMATO de cada etiqueta lo valida solo
-- `upsert_global_product` (un CHECK no admite subconsultas para mirar elemento a
-- elemento), y es la única vía de escritura al catálogo global; aquí queda lo que sí
-- se puede decir con operadores, para que un fallo de esa función no llene la tabla.
alter table public.products
  add constraint products_health_limits_ck check (
    cardinality(allergens_tags) <= 40
    and cardinality(traces_tags) <= 40
    and cardinality(labels_tags) <= 40
    and array_position(allergens_tags, null) is null
    and array_position(traces_tags, null) is null
    and labels_tags <@ array['en:no-gluten', 'en:no-lactose', 'en:suitable-for-celiacs']
    and length(ingredients_text) <= 2000
  );

-- ── 2 · Escribir en el catálogo global, ahora con salud ───────────────────
--
-- Mismo contrato que en `20261010100000`: la única vía, SECURITY DEFINER, y se
-- revalida TODO lo que `lookup-barcode` ya filtró (dos filtros de dos lenguajes
-- distintos no fallan por la misma razón). Cambia la firma, así que no se puede
-- reemplazar: se borra y se vuelve a crear, con sus permisos.
--
-- Lo nuevo:
--   · Alérgenos, trazas y etiquetas: formato de OFF, 40 como máximo y, en las
--     etiquetas, solo las tres de la lista cerrada.
--   · Los tres arrays son OBLIGATORIOS (vacíos si OFF no declara nada). Esta función
--     marca `health_data_at = now()` porque solo se llama tras una consulta fresca a
--     OFF; si aceptara un NULL lo guardaría como «OFF no declara nada», que es
--     justo el falso «apto» que se quiere evitar.
--   · Ingredientes: opcionales, de 2000 caracteres como mucho y con los mismos
--     caracteres prohibidos que el nombre.
--   · Un refresco de OFF reemplaza también estas columnas y la fecha.

drop function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb
);

create function public.upsert_global_product(
  p_barcode          text,
  p_name             text,
  p_brand            text,
  p_unit_family      public.unit_family,
  p_net_quantity     numeric,
  p_image_url        text,
  p_categories_tags  text[],
  p_payload          jsonb,
  p_allergens_tags   text[],
  p_traces_tags      text[],
  p_labels_tags      text[],
  p_ingredients_text text
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Control, DEL y C1; guion blando; espacios de ancho cero y marcas direccionales;
  -- separadores de línea y párrafo y formato bidireccional; los «sin ancho» de
  -- U+2060 a U+206F y BOM, y el marcado. Es la clase de 20261010100000, escrita con
  -- escapes para que se vea qué hay dentro.
  c_prohibido constant text :=
    '[\u0001-\u001F\u007F-\u009F­​-‏ -‮⁠-⁯﻿<>]';
  c_etiqueta  constant text := '^[a-z]{2}:[a-z0-9-]{1,80}$';
  -- Las únicas labels_tags de OFF que se guardan. Si se cambia esta lista, hay que
  -- cambiarla TAMBIÉN en products_health_limits_ck y en ETIQUETAS_DE_SALUD de
  -- `_shared/off.ts` (una prueba de la función comprueba que coinciden).
  c_etiquetas_salud constant text[] :=
    array['en:no-gluten', 'en:no-lactose', 'en:suitable-for-celiacs'];
  v_nombre       text := trim(p_name);
  v_marca        text := nullif(trim(p_brand), '');
  v_ingredientes text := nullif(trim(p_ingredients_text), '');
  v_fila         public.products;
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
          where etiqueta is null or etiqueta !~ c_etiqueta
       )
     ) then
    raise exception 'Categorías no válidas' using errcode = '22023';
  end if;

  if p_payload is not null and length(p_payload::text) > 8192 then
    raise exception 'Datos de origen demasiado grandes' using errcode = '22023';
  end if;

  -- Salud. Primero que existan los tres arrays (ver la cabecera de esta sección).
  if p_allergens_tags is null or p_traces_tags is null or p_labels_tags is null then
    raise exception 'Faltan los datos de salud: alérgenos, trazas y etiquetas son obligatorios'
      using errcode = '22023';
  end if;

  if cardinality(p_allergens_tags) > 40 or exists (
       select 1 from unnest(p_allergens_tags) as t(etiqueta)
        where etiqueta is null or etiqueta !~ c_etiqueta
     ) then
    raise exception 'Alérgenos no válidos' using errcode = '22023';
  end if;

  if cardinality(p_traces_tags) > 40 or exists (
       select 1 from unnest(p_traces_tags) as t(etiqueta)
        where etiqueta is null or etiqueta !~ c_etiqueta
     ) then
    raise exception 'Trazas no válidas' using errcode = '22023';
  end if;

  -- `<@` con un elemento NULL da falso, así que un NULL dentro también se rechaza.
  if cardinality(p_labels_tags) > 40 or not (p_labels_tags <@ c_etiquetas_salud) then
    raise exception 'Etiquetas no válidas' using errcode = '22023';
  end if;

  if v_ingredientes is not null
     and (length(v_ingredientes) > 2000 or v_ingredientes ~ c_prohibido) then
    raise exception 'Ingredientes no válidos' using errcode = '22023';
  end if;

  insert into public.products as p
    (household_id, barcode, name, brand, unit_family, net_quantity, image_url,
     categories_tags, data_source, off_payload,
     allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at)
  values
    (null, p_barcode, v_nombre, v_marca, p_unit_family, p_net_quantity, p_image_url,
     p_categories_tags, 'openfoodfacts', p_payload,
     p_allergens_tags, p_traces_tags, p_labels_tags, v_ingredientes, now())
  on conflict (barcode) where household_id is null and barcode is not null
  do update set
    name             = excluded.name,
    brand            = excluded.brand,
    unit_family      = excluded.unit_family,
    net_quantity     = excluded.net_quantity,
    image_url        = excluded.image_url,
    categories_tags  = excluded.categories_tags,
    off_payload      = excluded.off_payload,
    allergens_tags   = excluded.allergens_tags,
    traces_tags      = excluded.traces_tags,
    labels_tags      = excluded.labels_tags,
    ingredients_text = excluded.ingredients_text,
    health_data_at   = excluded.health_data_at
  returning p.* into v_fila;

  return v_fila;
end;
$$;

comment on function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb, text[], text[], text[], text
) is
  'La única vía de escritura al catálogo global. Revalida nombre, marca, imagen, '
  'categorías, cantidad y los datos de salud (alérgenos, trazas, etiquetas de una '
  'lista cerrada e ingredientes) aunque la Edge Function ya los filtrara. Marca '
  'health_data_at = now(): solo se llama tras una consulta fresca a OFF. Solo service_role.';

comment on column public.products.off_payload is
  'Subconjunto YA FILTRADO de la ficha de Open Food Facts (no la respuesta cruda), sin '
  'lo que ya tiene columna propia en los datos de salud. Es texto de un wiki público: '
  'entrada no confiable. Nunca se interpola en un prompt sin encapsular.';

revoke all on function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb, text[], text[], text[], text
) from public, anon, authenticated;

grant execute on function public.upsert_global_product(
  text, text, text, public.unit_family, numeric, text, text[], jsonb, text[], text[], text[], text
) to service_role;

-- ── 3 · Lo que evita cada persona ─────────────────────────────────────────
--
-- DATO DE SALUD, categoría especial del RGPD. Una fila por persona, con la lista de
-- lo que evita. Los valores son una lista CERRADA: los 14 alérgenos de declaración
-- obligatoria en la UE más la lactosa («gluten» cubre también la celiaquía). Qué
-- etiqueta de OFF corresponde a cada uno lo decide el móvil, que es quien cruza.
--
-- ── Por qué la RLS es la única barrera ─────────────────────────────────────
--
-- Nada más protege esta tabla, y está bien que sea así. No la ve nadie más que su
-- dueña: ni la gente de una nevera compartida (que sí comparte el inventario), ni
-- `service_role` (sin ningún permiso), ni `anon`. No hay función SECURITY DEFINER
-- que la lea, ni vista, ni la lee la Edge Function: `salud_test.sql` lo comprueba
-- buscando el nombre en el código de todas las funciones. Cada permiso se concede a
-- mano y columna a columna, porque un permiso de tabla cubre también las columnas que
-- se añadan después (ver `user_settings` en `20260924100000`).
--
-- No hay DELETE: vaciar la lista es `avoid = '{}'`, y al borrar la cuenta la fila se
-- va con ella (`on delete cascade`).

create table public.user_health_preferences (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  avoid      text[] not null default '{}',
  updated_at timestamptz not null default now(),

  -- Lista cerrada y tope. Con el trigger de abajo (sin repetidos) 15 es el máximo
  -- posible; se escribe igualmente por si un día se quita el trigger.
  constraint user_health_preferences_avoid_ck check (
    avoid <@ array[
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'nuts',
      'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs', 'lactose'
    ]
    and cardinality(avoid) <= 15
  )
);

comment on table public.user_health_preferences is
  'DATO DE SALUD (RGPD, categoría especial). Qué alérgenos o intolerancias evita cada '
  'persona. Solo su dueña la lee o la escribe: la RLS es la única barrera, ni la gente '
  'de su nevera, ni service_role, ni anon la ven. Ninguna función la lee. El cruce con '
  'los productos se hace en el móvil.';

comment on column public.user_health_preferences.avoid is
  'Lista CERRADA, sin repetidos y ordenada: gluten, crustaceans, eggs, fish, peanuts, '
  'soybeans, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs, lactose. '
  '«gluten» cubre la celiaquía. Vacía = no evita nada.';

-- Sin repetidos y ordenada: así «las mismas preferencias» son siempre el mismo valor
-- y la app no tiene que ordenar ni deduplicar antes de comparar o de guardar.
-- Un NULL se deja pasar tal cual para que hable el NOT NULL, y un elemento fuera de
-- la lista, para que hable el CHECK (los dos se comprueban DESPUÉS de este trigger).
create function public.normalize_health_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.avoid is not null then
    new.avoid := coalesce(
      (select array_agg(a order by a collate "C")
         from (select distinct a from unnest(new.avoid) as u(a)) as d),
      '{}'::text[]
    );
  end if;
  return new;
end;
$$;

comment on function public.normalize_health_preferences() is
  'Trigger de user_health_preferences: deja avoid sin repetidos y ordenado.';

create trigger user_health_preferences_normalize
  before insert or update on public.user_health_preferences
  for each row execute function public.normalize_health_preferences();

create trigger user_health_preferences_touch_updated_at
  before update on public.user_health_preferences
  for each row execute function public.touch_updated_at();

alter table public.user_health_preferences enable row level security;

create policy user_health_preferences_select on public.user_health_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_health_preferences_insert on public.user_health_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_health_preferences_update on public.user_health_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Permisos mínimos, como en `user_settings`. `service_role` se nombra aunque ya nazca
-- sin nada: que siga sin nada si cambian los privilegios por defecto del proyecto.
revoke all on public.user_health_preferences from anon, authenticated, service_role;

grant select on public.user_health_preferences to authenticated;
grant insert (user_id, avoid) on public.user_health_preferences to authenticated;
grant update (avoid) on public.user_health_preferences to authenticated;

revoke all on function public.normalize_health_preferences() from public, anon, authenticated;
