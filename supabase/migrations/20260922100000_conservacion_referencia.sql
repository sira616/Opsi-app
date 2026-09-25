-- ═══════════════════════════════════════════════════════════════════════════
-- Conservación tras apertura, por CATEGORÍA DE LA APP.
--
-- Esta tabla NO sustituye a `open_shelf_life_reference`, que ya existe: son dos
-- eslabones distintos de la misma decisión (D-15) y hacen falta los dos.
--
--   · open_shelf_life_reference  se indexa por ETIQUETA DE OPEN FOOD FACTS
--     («es:leche»). Solo puede contestar cuando el elemento viene del catálogo,
--     es decir, cuando alguien escaneó un código de barras y el producto trajo
--     sus `categories_tags`. Hoy está VACÍA y se llena en la fase 2, con el
--     escáner. No se toca aquí.
--   · esta tabla se indexa por `food_category`, los diez pasillos de
--     supermercado que el alta ya pide. Contesta en el camino que hoy es el
--     principal, y con diferencia: un elemento dado de alta A MANO, sin
--     producto asociado y por tanto sin ninguna etiqueta de Open Food Facts.
--
-- Quien las confunda acabará borrando una de las dos por «duplicada». No lo
-- son: una va por producto de catálogo y la otra por categoría de la app.
--
-- ── De dónde salen los números ────────────────────────────────────────────
--
-- Son VALORES DE TRABAJO, no una fuente autorizada. Recogen la práctica común
-- de conservación doméstica en frigorífico, redondeada siempre a la baja, y
-- están pendientes de revisión contra una guía oficial igual que los de la
-- tabla hermana (ver Q3 en la bitácora).
--
-- Regla al tocar una fila: ante la duda entre dos plazos, el corto. Este
-- proyecto prefiere que alguien tire un yogur bueno a que se coma uno malo.
--
-- Consecuencia incómoda y deliberada: una categoría ancha se queda con el
-- plazo de su caso MÁS restrictivo. Por eso `despensa` dice tres días, que es
-- lo que dura una conserva abierta, aunque la pasta seca aguante meses. El
-- usuario puede corregir la fecha del elemento; lo que no puede es adivinar
-- que la conserva se le estaba pasando.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.category_shelf_life_reference (
  category              public.food_category primary key,

  -- Días orientativos DESDE QUE SE ABRE. Nunca es la fecha del envase: lo que
  -- diga el envase manda siempre por encima de esta tabla.
  days                  integer not null check (days between 1 and 3650),

  -- Dónde debería guardarse una vez abierto. Es un consejo, no una regla: el
  -- elemento tiene su propia `location` y el usuario la cambia cuando quiera.
  recommended_location  public.storage_location not null,

  -- Una línea en español, legible tal cual en la pantalla de detalle. Corta a
  -- propósito: si no cabe en una línea de móvil, no se lee.
  note                  text not null check (length(trim(note)) between 1 and 120),

  source                text not null,
  updated_at            timestamptz not null default now()
);

comment on table public.category_shelf_life_reference is
  'Días orientativos de conservación tras abrir, por categoría de la app. El '
  'eslabón de D-15 que responde cuando el elemento no tiene producto de '
  'catálogo, que es el caso del alta manual.';
comment on column public.category_shelf_life_reference.days is
  'Siempre ORIENTATIVO: lo que se derive de aquí es date_source = reference.';
comment on column public.category_shelf_life_reference.source is
  'De dónde sale el criterio. Mientras diga «orientativo» no es una fuente '
  'autorizada y se puede corregir sin discusión.';

-- ── Las diez categorías, con los plazos cortos ────────────────────────────
insert into public.category_shelf_life_reference
  (category, days, recommended_location, note, source) values

  ('frutas_verduras',  3, 'fridge',
   'Ya cortada o pelada, tapada y en la nevera',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  ('carne',            2, 'fridge',
   'Carne fresca abierta. La picada, el mismo día',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  ('pescado',          1, 'fridge',
   'Pescado fresco: el mismo día o el siguiente',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  ('lacteos',          3, 'fridge',
   'Leche y yogur abiertos, tapados y en frío',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  ('panaderia',        3, 'pantry',
   'Cerrado y a temperatura ambiente; en la nevera se seca antes',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  -- El caso más restrictivo de un cajón de sastre: la conserva abierta.
  ('despensa',         3, 'fridge',
   'Una conserva abierta, a un recipiente y a la nevera. Lo seco dura mucho más',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  -- Coherente con el tope de 24 h tras descongelar de la vista de prioridad.
  ('congelados',       1, 'freezer',
   'Descongelado se consume en 24 h y no se vuelve a congelar',
   'orientativo · mismo criterio que el tope tras descongelar (D-14)'),

  ('bebidas',          3, 'fridge',
   'Zumo o refresco abierto, en la nevera',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  ('dulces',           7, 'pantry',
   'Bien cerrado y a temperatura ambiente',
   'orientativo · práctica doméstica común, redondeada a la baja'),

  -- El cajón de lo que no sabemos qué es. Plazo corto y en frío.
  ('otros',            3, 'fridge',
   'Sin saber de qué se trata, el plazo corto y en frío',
   'orientativo · práctica doméstica común, redondeada a la baja');

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Mismo trato que open_shelf_life_reference: son datos de referencia, no de
-- nadie. Se leen enteros y no se escriben desde la app; sin políticas de
-- escritura, solo la service_role puede tocarlos.
alter table public.category_shelf_life_reference enable row level security;

create policy category_shelf_life_reference_select
  on public.category_shelf_life_reference
  for select to authenticated
  using (true);

-- Se revoca también a `authenticated`, y no sobra: Supabase concede TODOS los
-- permisos a los roles de la Data API sobre cada tabla nueva del esquema
-- public (`auto_expose_new_tables` en config.toml, que viene activado porque
-- es el comportamiento de la nube). Sin nombrar aquí a `authenticated`, la
-- tabla nacería con INSERT, UPDATE y DELETE concedidos y lo único que los
-- pararía sería la RLS. Se quieren las dos capas: los permisos deciden quién
-- puede intentarlo y la RLS qué filas ve. Con una sola, el día que alguien
-- añada una política de escritura se abre más de lo que creía.
revoke all on public.category_shelf_life_reference from anon, authenticated;
grant select on public.category_shelf_life_reference to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- La precedencia de D-15, en UN SOLO SITIO
-- ═══════════════════════════════════════════════════════════════════════════

-- De dónde salió el plazo. La pantalla lo enseña: «el origen de cada fecha
-- visible» es un principio del proyecto, no un detalle de implementación, y
-- para poder decirlo hay que devolverlo, no deducirlo en el cliente.
create type public.shelf_life_origin as enum ('producto', 'categoria');

comment on type public.shelf_life_origin is
  'Quién contestó en la cadena de D-15: el catálogo para ese producto, o la '
  'tabla de referencia por categoría.';

-- Dado un elemento, cuántos días dura una vez abierto, dónde guardarlo y de
-- dónde sale ese dato. El orden es el de D-15 y el primero que conteste gana:
--
--   1. products.open_shelf_life_days  → origin = 'producto'
--   2. category_shelf_life_reference  → origin = 'categoria'
--   3. nada
--
-- El tercer caso devuelve CERO FILAS, y eso no es un error: «no lo sabemos» es
-- una respuesta legítima y la app la pinta como tal en vez de inventarse un
-- número. Pasa cuando el elemento no existe, cuando no es de tu hogar (la RLS
-- lo esconde y aquí se nota igual) o si alguna vez se añade un valor al enum
-- `food_category` sin sembrar su fila.
--
-- SECURITY INVOKER —el valor por omisión, y aquí se quiere—: la función corre
-- con los permisos de quien llama, así que la RLS de inventory_items sigue
-- decidiendo a qué elementos llega. Preguntar por el elemento de otro no
-- devuelve nada, sin necesidad de comprobar el hogar a mano.
--
-- La ubicación recomendada sale SIEMPRE de la tabla por categoría, también
-- cuando los días los pone el producto: el catálogo no guarda dónde conservar
-- nada. El `origin` se refiere a los DÍAS, que es lo que resuelve la cadena.
create function public.shelf_life_for_item(p_item_id uuid)
returns table (
  days                  integer,
  recommended_location  public.storage_location,
  origin                public.shelf_life_origin
)
language sql
stable
as $$
  with item as (
    select i.id, i.category, p.open_shelf_life_days
    from public.inventory_items i
    left join public.products p on p.id = i.product_id
    where i.id = p_item_id
  ),
  -- Ojo al escribir aquí: los nombres de salida (days, recommended_location,
  -- origin) también son nombres de columna de las tablas. Toda referencia va
  -- CUALIFICADA; sin cualificar, PostgreSQL responde «column reference is
  -- ambiguous» y el error no se parece en nada a su causa.
  candidatos as (
    -- 1) Lo que diga el catálogo PARA ESE PRODUCTO. Lo más específico que hay.
    select 1 as rango,
           it.open_shelf_life_days                  as days,
           r.recommended_location                   as recommended_location,
           'producto'::public.shelf_life_origin     as origin
    from item it
    left join public.category_shelf_life_reference r on r.category = it.category
    where it.open_shelf_life_days is not null

    union all

    -- 2) La referencia por categoría. Contesta siempre que la fila exista.
    select 2,
           r.days,
           r.recommended_location,
           'categoria'::public.shelf_life_origin
    from item it
    join public.category_shelf_life_reference r on r.category = it.category
  )
  select c.days, c.recommended_location, c.origin
  from candidatos c
  order by c.rango
  limit 1;
$$;

comment on function public.shelf_life_for_item(uuid) is
  'Días tras abrir, dónde guardarlo y de dónde sale el dato, resolviendo '
  'D-15: producto → categoría → nada. Cero filas significa «no lo sabemos», '
  'que es una respuesta válida. SECURITY INVOKER: la RLS del elemento manda.';

revoke all on function public.shelf_life_for_item(uuid) from public, anon;
grant execute on function public.shelf_life_for_item(uuid) to authenticated;

-- Lo que esta migración NO hace, y conviene saberlo antes de buscar el fallo:
-- `inventory_with_priority` sigue resolviendo la conservación tras apertura por
-- etiquetas de Open Food Facts, como estaba. Enchufarle esta tabla cambiaría
-- las fechas que la lista ya enseña hoy —a todos los elementos de alta manual
-- les aparecería una—, y eso es una decisión de producto, no de esquema. Esta
-- función es lo que la pantalla de detalle usa para proponer y explicar; el
-- día que se decida que además mande en la lista, será otra migración.
