-- ═══════════════════════════════════════════════════════════════════════════
-- Nutrición de los productos (Opsi Premium ⭐)
--
-- Nutri-Score, grupo NOVA, valores por 100 g o 100 ml (energía, grasas, saturadas,
-- hidratos, azúcares, fibra, proteínas y sal), niveles de grasa, saturadas, azúcares y
-- sal, ración y aditivos de cada producto del catálogo global. Salen de Open Food Facts
-- (OFF), como los alérgenos y los ingredientes de `20261021100000`, y son de Opsi
-- Premium: el plan lo decide el SERVIDOR (D-49).
--
-- ── Por qué una tabla aparte y no columnas en `products` ─────────────────────────
--
-- `products` la lee cualquier persona con sesión (el catálogo global es de todo el
-- mundo). Para que unas columnas concretas no las lea quien no es premium habría que
-- pasar `products` a permisos de columna, uno a uno: `revoke select` de la tabla y un
-- `grant select (…)` con CADA columna que sí se puede leer. Es frágil por dos lados:
-- cada columna nueva nace cerrada y alguien tiene que acordarse de abrirla (o, peor, un
-- permiso de tabla vuelve a cubrirla sola), y cada `select *` del código —o de un
-- cliente modificado— falla entero por una columna que no se podía leer. Y la RLS no
-- ayuda: es por FILA, no por columna.
--
-- Una tabla propia se cierra con lo de siempre: RLS por plan y un solo sitio donde mirar.
-- `products` no cambia: sigue leyéndose entera, sigue sin ninguna columna de nutrición,
-- y los permisos que tiene hoy siguen siendo los suyos.
--
-- ── La fila ES la marca de «se consultó OFF» ───────────────────────────────────────
--
-- Lo mismo que hace `health_data_at` con la salud, aquí lo hace la propia fila:
--
--   · SIN fila             → no consta. Una ficha de antes de esta migración, un
--                            producto escrito a mano o una consulta que falló.
--   · Fila con todo NULL   → OFF se consultó (`nutrition_data_at`) y no declara datos
--                            nutricionales de este producto.
--   · Fila con valores     → lo que OFF declara. Un NULL suelto es «OFF no lo da».
--
-- «Sin datos» NUNCA puede leerse como cero: `energy_kcal = 0` significa que OFF dice
-- cero, y la ausencia de dato es NULL (o la ausencia de fila). Una ficha sin fila se
-- trata como caducada y `lookup-barcode` la renueva desde OFF la próxima vez que se
-- escanee, igual que las que no tienen `health_data_at`.
--
-- ── Premium: doble candado, los dos en el servidor ───────────────────────────────
--
--   1. RLS: `select` solo para `authenticated`, y solo si `my_plan()` es premium. Es la
--      puerta de la tabla: quien no es premium recibe CERO filas, no un error, de un
--      `select` directo.
--   2. `nutrition_of_products(uuid[])`: la vía de la app. Es un POST de RPC (un `select`
--      con cientos de ids revienta el límite de longitud de la URL) y comprueba el plan
--      ANTES de leer nada, con el mismo error que `my_known_products`: 42501 y pista
--      `premium`. Es SECURITY INVOKER: la RLS de arriba sigue aplicándose por debajo, así
--      que si alguien quitara la comprobación de la función, la tabla seguiría cerrada, y
--      viceversa.
--
-- `lookup-barcode` NO devuelve nutrición. Devolverla saltaría este candado: esa función
-- no mira el plan de quien pregunta. La app la lee solo por `nutrition_of_products`.
--
-- ── Quién escribe ──────────────────────────────────────────────────────────────────
--
-- Solo el catálogo global, y solo por `upsert_product_nutrition`: SECURITY DEFINER, solo
-- `service_role`, que revalida TODO lo que la Edge Function ya filtró (dos filtros de dos
-- lenguajes no fallan por la misma razón) y pone `nutrition_data_at = now()`. Ningún rol
-- tiene permiso de escritura sobre la tabla: ni `authenticated` (hay RLS de lectura y
-- nada más), ni `anon`, ni `service_role`.
--
-- Un producto PRIVADO de una nevera lo escribe cualquiera de sus miembros, así que
-- nutrición ahí sería un dato falso a la vista de sus compañeras («este yogur tiene 0 g
-- de azúcar»). `products_health_global_only_ck` lo impide para la salud con un CHECK; aquí
-- el dato vive en OTRA tabla y un CHECK no puede mirar la fila de `products`. Lo hace un
-- trigger BEFORE INSERT OR UPDATE (`check_nutrition_product`), que vale para todos los
-- roles: también para `postgres`, para que un fallo de la función no deje nutrición en
-- un producto privado. Un producto no cambia de nevera (`forbid_household_change`), así
-- que lo que es global hoy lo seguirá siendo.
--
-- ── Lo que `service_role` puede hacer aquí, por escrito ──────────────────────────
--
--   · EXECUTE sobre `upsert_product_nutrition`: escribir.
--   · SELECT sobre DOS columnas, `product_id` y `nutrition_data_at`: que `buscarEnCatalogo`
--     sepa si la ficha ya tiene su nutrición (si no, la renueva). Los VALORES nutricionales
--     no los lee: la función sirve a toda persona con sesión, y si se comprometiera la
--     clave no habría nada premium que sacar con ella.
--
-- ── Rangos ─────────────────────────────────────────────────────────────────────────
--
-- Todo es por 100 g o por 100 ml. Energía: 0–950 kcal (la grasa pura son 900). El resto
-- de nutrientes: 0–100 g. Coherencia por pares: las saturadas no pueden superar a las
-- grasas totales ni los azúcares a los hidratos (con 0,5 g de margen por el redondeo de
-- OFF): una ficha que se contradice no es fiable en ninguno de los dos valores, y la
-- Edge Function descarta AMBOS. Aquí se rechaza.
--
-- Lo que esta base de datos NO impone, porque lo decide la Edge Function (que es quien
-- sabe de qué ficha viene cada dato): que un valor positivo que al redondearse a dos
-- decimales queda en 0,00 (una sal de 0,004 g) se guarde como NULL y no como 0, que «0»
-- significa «OFF declara cero»; y que `additives_tags` sea NULL y no {} cuando la ficha no
-- trae ingredientes. Aquí se guarda lo que llega.
--
-- ── Orden de despliegue ────────────────────────────────────────────────────────────
--
-- Esta migración tiene que estar aplicada ANTES de desplegar la versión de `lookup-barcode`
-- que la usa: `buscarEnCatalogo` hace el embed `product_nutrition(nutrition_data_at)` en el
-- camino crítico del escáner y, sin la tabla, TODOS los escaneos darían 500.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La tabla ──────────────────────────────────────────────────────────

create table public.product_nutrition (
  product_id          uuid primary key references public.products (id) on delete cascade,

  -- Cuándo se consultó OFF. La pone `upsert_product_nutrition`; no tiene valor por
  -- omisión a propósito: una fila sin fecha de consulta no significaría nada.
  nutrition_data_at   timestamptz not null,

  nutriscore_grade    text,
  nova_group          smallint,

  -- De qué son los valores de abajo: 'g' (por 100 g) o 'ml' (por 100 ml). OFF lo da todo
  -- por 100 g o 100 ml; se deduce de la familia de unidades del producto. NULL = no se
  -- sabe, y la app no debe inventarlo.
  basis               text,

  -- Con dos decimales y hasta 999,99 sobra: el mayor valor posible es 950 (energía).
  energy_kcal         numeric(5, 2),
  fat                 numeric(5, 2),
  saturated_fat       numeric(5, 2),
  carbohydrates       numeric(5, 2),
  sugars              numeric(5, 2),
  fiber               numeric(5, 2),
  proteins            numeric(5, 2),
  salt                numeric(5, 2),

  -- Los semáforos que OFF calcula (`nutrient_levels`): solo estos cuatro.
  fat_level           text,
  saturated_fat_level text,
  sugars_level        text,
  salt_level          text,

  serving_size        text,

  -- Códigos de OFF tipo {en:e330,en:e150d}. El recuento se deriva en la app: guardarlo
  -- aparte sería un segundo dato que un día dejaría de coincidir con la lista.
  --
  -- NULL y {} NO son lo mismo, y «{}» nunca se lee como «sin aditivos» a secas: OFF
  -- solo analiza los aditivos a partir de los ingredientes, así que una lista vacía de
  -- una ficha SIN ingredientes no dice nada. `lookup-barcode` guarda NULL en ese caso y
  -- {} solo si la lista viene vacía Y la ficha trae ingredientes.
  additives_tags      text[],

  constraint product_nutrition_grade_ck check (nutriscore_grade in ('a', 'b', 'c', 'd', 'e')),
  constraint product_nutrition_nova_ck  check (nova_group between 1 and 4),
  constraint product_nutrition_basis_ck check (basis in ('g', 'ml')),

  -- Un NaN o un Infinity no pasan: en `numeric` son mayores que cualquier número.
  constraint product_nutrition_ranges_ck check (
    energy_kcal   between 0 and 950
    and fat           between 0 and 100
    and saturated_fat between 0 and 100
    and carbohydrates between 0 and 100
    and sugars        between 0 and 100
    and fiber         between 0 and 100
    and proteins      between 0 and 100
    and salt          between 0 and 100
  ),

  -- Un dato que se contradice no se guarda. Con un solo valor del par no hay contradicción.
  constraint product_nutrition_pairs_ck check (
    (saturated_fat is null or fat is null or saturated_fat <= fat + 0.5)
    and (sugars is null or carbohydrates is null or sugars <= carbohydrates + 0.5)
  ),

  constraint product_nutrition_levels_ck check (
    fat_level           in ('low', 'moderate', 'high')
    and saturated_fat_level in ('low', 'moderate', 'high')
    and sugars_level    in ('low', 'moderate', 'high')
    and salt_level      in ('low', 'moderate', 'high')
  ),

  -- Texto de un wiki público: corto y sin los caracteres que nombre e ingredientes
  -- prohíben, y algunos más (la clase de `upsert_global_product` ampliada: ver el
  -- `c_prohibido` de `upsert_product_nutrition`). Escrita con escapes.
  constraint product_nutrition_serving_ck check (
    length(serving_size) between 1 and 60
    and serving_size !~ '[\u0001-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uE000-\uF8FF\uFEFF\uFFF9-\uFFFB\U000E0000-\U000E007F<>]'
  ),

  -- El FORMATO de cada código y los repetidos los valida solo `upsert_product_nutrition`
  -- (un CHECK no admite subconsultas para mirar elemento a elemento); aquí, lo que sí se
  -- puede decir con operadores.
  constraint product_nutrition_additives_ck check (
    cardinality(additives_tags) <= 60
    and array_position(additives_tags, null) is null
  )
);

comment on table public.product_nutrition is
  'Opsi Premium. Nutrición de un producto del catálogo GLOBAL, de Open Food Facts. La fila es '
  'la marca de «se consultó OFF»: sin fila = no consta; fila con todo NULL = OFF no declara '
  'nada; un NULL suelto = OFF no da ese dato. Nunca se lee un NULL como cero. Se lee solo con '
  'plan premium (RLS) y se escribe solo con upsert_product_nutrition (service_role).';

comment on column public.product_nutrition.product_id is
  'Producto del catálogo global (household_id NULL). Un trigger rechaza uno privado.';
comment on column public.product_nutrition.nutrition_data_at is
  'Cuándo se consultó OFF. Lo pone el servidor (now()).';
comment on column public.product_nutrition.nutriscore_grade is
  'Nutri-Score de OFF: a, b, c, d o e. NULL = OFF no lo calcula (unknown o not-applicable).';
comment on column public.product_nutrition.nova_group is
  'Grupo NOVA de OFF (1 a 4, de menos a más procesado). NULL = OFF no lo da.';
comment on column public.product_nutrition.basis is
  'De qué son los valores: g (por 100 g) o ml (por 100 ml), según la familia de unidades '
  'del producto. NULL = no se sabe.';
comment on column public.product_nutrition.energy_kcal is
  'Energía por 100 g o 100 ml, en kcal. De 0 a 950. NULL = OFF no la da (no es cero).';
comment on column public.product_nutrition.fat is
  'Grasas por 100 g o 100 ml, en gramos (0 a 100). NULL = OFF no las da.';
comment on column public.product_nutrition.saturated_fat is
  'Grasas saturadas por 100 g o 100 ml (0 a 100). Nunca más que las grasas + 0,5.';
comment on column public.product_nutrition.carbohydrates is
  'Hidratos de carbono por 100 g o 100 ml (0 a 100).';
comment on column public.product_nutrition.sugars is
  'Azúcares por 100 g o 100 ml (0 a 100). Nunca más que los hidratos + 0,5.';
comment on column public.product_nutrition.fiber is
  'Fibra por 100 g o 100 ml (0 a 100).';
comment on column public.product_nutrition.proteins is
  'Proteínas por 100 g o 100 ml (0 a 100).';
comment on column public.product_nutrition.salt is
  'Sal por 100 g o 100 ml (0 a 100).';
comment on column public.product_nutrition.fat_level is
  'Semáforo de grasas de OFF: low, moderate o high.';
comment on column public.product_nutrition.saturated_fat_level is
  'Semáforo de grasas saturadas de OFF: low, moderate o high.';
comment on column public.product_nutrition.sugars_level is
  'Semáforo de azúcares de OFF: low, moderate o high.';
comment on column public.product_nutrition.salt_level is
  'Semáforo de sal de OFF: low, moderate o high.';
comment on column public.product_nutrition.serving_size is
  'La ración que declara OFF, p. ej. «30 g». Máximo 60 caracteres. Es texto de un wiki '
  'público: entrada no confiable, nunca se interpola en un prompt sin encapsular.';
comment on column public.product_nutrition.additives_tags is
  'Aditivos que OFF declara, p. ej. {en:e330,en:e150d,en:e331iii}. Sin repetidos, máximo 60. '
  'NULL = no se sabe: OFF no da la lista, o la da vacía pero la ficha no trae ingredientes (OFF '
  'solo analiza aditivos a partir de ellos). {} = lista vacía CON ingredientes: OFF los analizó '
  'y no declara ninguno. Aun así la app nunca afirma «sin aditivos»: dice lo que OFF declara. '
  'El recuento se calcula en la app.';

-- ── 2 · Solo en productos del catálogo global ─────────────────────────────

-- Lo que `products_health_global_only_ck` hace para la salud. Un CHECK no puede mirar
-- otra tabla, así que es un trigger, y sirve para TODOS los roles (también `postgres`).
--
-- SECURITY INVOKER a propósito: si quien escribe no viera el producto por su RLS (lo
-- que solo pasa con un rol que ni siquiera tiene permiso de escritura aquí), la
-- consecuencia es rechazar de más, que es el lado seguro. Un producto que no existe
-- también se rechaza: el trigger se dispara antes de que mire la clave foránea.
--
-- Es 23514 (check_violation) por ser el equivalente de un CHECK.
create function public.check_nutrition_product()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.products p
     where p.id = new.product_id
       and p.household_id is null
  ) then
    raise exception 'La nutrición solo se guarda en productos del catálogo, no en los de una nevera.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.check_nutrition_product() is
  'Trigger de product_nutrition: el producto tiene que existir y ser del catálogo global. '
  'Un producto privado lo escribe cualquier miembro de su nevera, y la nutrición sería un '
  'dato falso a la vista de sus compañeras.';

revoke all on function public.check_nutrition_product() from public, anon, authenticated;

create trigger product_nutrition_check_product
  before insert or update on public.product_nutrition
  for each row execute function public.check_nutrition_product();

-- ── 3 · Quién lee: la RLS ─────────────────────────────────────────────────

alter table public.product_nutrition enable row level security;

-- `(select …)` hace que el plan se mire UNA vez por consulta y no por fila.
-- `my_plan()` lee la propia fila de ajustes de quien llama (la RLS de `user_settings`
-- se lo permite) y sin fila devuelve 'basic': el valor seguro. `plan` no lo escribe el
-- cliente (ningún permiso de columna lo concede).
create policy product_nutrition_select on public.product_nutrition
  for select to authenticated
  using ((select public.my_plan()) = 'premium');

-- Sin políticas de escritura Y sin permisos de escritura: dos cerrojos. Cada permiso, con
-- nombre y apellidos (un permiso de tabla cubriría también las columnas que se añadan
-- después). `service_role` salta la RLS, así que lo único que lo acota son estos permisos.
revoke all on public.product_nutrition from anon, authenticated, service_role;

grant select on public.product_nutrition to authenticated;
grant select (product_id, nutrition_data_at) on public.product_nutrition to service_role;

-- ── 4 · Quién lee: la función de la app ───────────────────────────────────

create function public.nutrition_of_products(p_product_ids uuid[])
returns setof public.product_nutrition
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Primero el plan, antes de leer nada: ni el número de ids ni cuáles existen se
  -- notan si no eres premium.
  if public.my_plan() <> 'premium' then
    raise exception 'Esto es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
  end if;

  if p_product_ids is null then
    raise exception 'Indica de qué productos quieres la nutrición.' using errcode = '22023';
  end if;
  if cardinality(p_product_ids) > 200 then
    raise exception 'Pide la nutrición de 200 productos como máximo cada vez.' using errcode = '22023';
  end if;

  -- Lo que no tiene fila (no consta) simplemente no sale. La RLS sigue aplicándose.
  return query
  select n.*
    from public.product_nutrition n
   where n.product_id = any (p_product_ids);
end;
$$;

comment on function public.nutrition_of_products(uuid[]) is
  'Premium (si no, 42501 con pista premium). La nutrición de hasta 200 productos del catálogo. '
  'Un producto sin fila no sale: no consta. SECURITY INVOKER: la RLS de product_nutrition '
  'sigue siendo la segunda puerta.';

revoke all on function public.nutrition_of_products(uuid[]) from public, anon;
grant execute on function public.nutrition_of_products(uuid[]) to authenticated;

-- ── 5 · Quién escribe: la única vía ───────────────────────────────────────
--
-- Revalida TODO lo que `lookup-barcode` ya filtró, aunque venga de una función que lo
-- hizo bien: lo que entra aquí lo ven todas las personas premium y, en la fase 5, el
-- modelo. Todos los parámetros son obligatorios (NULL si OFF no lo da): un NULL es un
-- dato que no consta, y la Edge Function tiene que decirlo expresamente.
--
--   · El producto tiene que existir y ser del catálogo global.
--   · Nutri-Score de a a e, NOVA de 1 a 4, base g o ml, niveles low/moderate/high.
--   · Energía de 0 a 950 y el resto de 0 a 100; las saturadas no superan a las grasas
--     ni los azúcares a los hidratos (+ 0,5). Se comprueba el valor TAL CUAL llega, y la
--     columna lo redondea a dos decimales: como redondear no cambia el orden de dos
--     valores, un par que pasa aquí pasa también el CHECK.
--   · Ración de 60 caracteres como máximo y sin los caracteres prohibidos del nombre.
--   · Aditivos con el formato de OFF (`en:e330`, `en:e150d`, `en:e331iii`: de 3 a 4 cifras
--     y hasta 4 letras, por las subformas en cifras romanas), sin repetidos y 60 como
--     máximo. Que una lista vacía sea NULL o {} depende de los ingredientes de la ficha,
--     y eso lo decide la Edge Function: aquí se guarda lo que llega.
--
-- Un refresco de OFF reemplaza la fila entera y la fecha. No devuelve nada: el valor de
-- lo guardado no tiene por qué volver a la Edge Function.

create function public.upsert_product_nutrition(
  p_product_id          uuid,
  p_nutriscore_grade    text,
  p_nova_group          integer,
  p_basis               text,
  p_energy_kcal         numeric,
  p_fat                 numeric,
  p_saturated_fat       numeric,
  p_carbohydrates       numeric,
  p_sugars              numeric,
  p_fiber               numeric,
  p_proteins            numeric,
  p_salt                numeric,
  p_fat_level           text,
  p_saturated_fat_level text,
  p_sugars_level        text,
  p_salt_level          text,
  p_serving_size        text,
  p_additives_tags      text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- La clase de `upsert_global_product`, ampliada para acercarse al `\p{C}` de la Edge
  -- Function (`off.ts`), con escapes para que se vea qué hay dentro. Control, DEL y C1;
  -- guion blando; marca de letra árabe (U+061C) y separador mongol (U+180E); ancho cero y
  -- marcas direccionales; separadores de línea y párrafo y formato bidireccional; U+2060 a
  -- U+206F; uso privado (U+E000 a U+F8FF); BOM; anotaciones interlineales (U+FFF9 a
  -- U+FFFB); caracteres «etiqueta» (U+E0000 a U+E007F, con los que se esconde texto
  -- invisible); marcado. La de `upsert_global_product` (nombre, marca, ingredientes) sigue
  -- siendo la antigua: ver el apartado de deuda de `docs/threat-model.md` §8.
  c_prohibido constant text :=
    '[\u0001-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uE000-\uF8FF\uFEFF\uFFF9-\uFFFB\U000E0000-\U000E007F<>]';
  c_aditivo   constant text := '^en:e[0-9]{3,4}[a-z]{0,4}$';
  c_niveles   constant text[] := array['low', 'moderate', 'high'];
  v_racion    text := nullif(trim(p_serving_size), '');
begin
  if p_product_id is null or not exists (
       select 1 from public.products p where p.id = p_product_id and p.household_id is null
     ) then
    raise exception 'El producto no existe o no es del catálogo global' using errcode = '22023';
  end if;

  if p_nutriscore_grade is not null and p_nutriscore_grade not in ('a', 'b', 'c', 'd', 'e') then
    raise exception 'Nutri-Score no válido' using errcode = '22023';
  end if;

  if p_nova_group is not null and p_nova_group not between 1 and 4 then
    raise exception 'Grupo NOVA no válido' using errcode = '22023';
  end if;

  if p_basis is not null and p_basis not in ('g', 'ml') then
    raise exception 'Base de los valores no válida' using errcode = '22023';
  end if;

  -- Se pregunta por lo que está DENTRO del rango y se niega: lo que no cabe en él no
  -- entra, sea lo que sea. En `numeric` un NaN es mayor que cualquier número y un
  -- Infinity también, así que ninguno de los dos pasa el `between`.
  if p_energy_kcal is not null and not (p_energy_kcal between 0 and 950) then
    raise exception 'Energía no válida' using errcode = '22023';
  end if;

  if exists (
       select 1
         from unnest(array[p_fat, p_saturated_fat, p_carbohydrates, p_sugars, p_fiber, p_proteins, p_salt])
              as n(valor)
        where valor is not null and not (valor between 0 and 100)
     ) then
    raise exception 'Los nutrientes tienen que estar entre 0 y 100 g por cada 100 g o 100 ml'
      using errcode = '22023';
  end if;

  if p_saturated_fat is not null and p_fat is not null and p_saturated_fat > p_fat + 0.5 then
    raise exception 'Las grasas saturadas no pueden superar a las grasas totales'
      using errcode = '22023';
  end if;

  if p_sugars is not null and p_carbohydrates is not null and p_sugars > p_carbohydrates + 0.5 then
    raise exception 'Los azúcares no pueden superar a los hidratos de carbono'
      using errcode = '22023';
  end if;

  -- Un nivel NULL es «OFF no lo da» y pasa; uno que no esté en la lista se rechaza.
  if (p_fat_level is not null and not (p_fat_level = any (c_niveles)))
     or (p_saturated_fat_level is not null and not (p_saturated_fat_level = any (c_niveles)))
     or (p_sugars_level is not null and not (p_sugars_level = any (c_niveles)))
     or (p_salt_level is not null and not (p_salt_level = any (c_niveles))) then
    raise exception 'Nivel no válido: solo low, moderate o high' using errcode = '22023';
  end if;

  if v_racion is not null and (length(v_racion) > 60 or v_racion ~ c_prohibido) then
    raise exception 'Ración no válida' using errcode = '22023';
  end if;

  if p_additives_tags is not null and (
       cardinality(p_additives_tags) > 60
       or exists (
         select 1 from unnest(p_additives_tags) as t(aditivo)
          where aditivo is null or aditivo !~ c_aditivo
       )
       or cardinality(p_additives_tags) <>
          (select count(distinct t.aditivo) from unnest(p_additives_tags) as t(aditivo))
     ) then
    raise exception 'Aditivos no válidos' using errcode = '22023';
  end if;

  insert into public.product_nutrition as n
    (product_id, nutrition_data_at, nutriscore_grade, nova_group, basis,
     energy_kcal, fat, saturated_fat, carbohydrates, sugars, fiber, proteins, salt,
     fat_level, saturated_fat_level, sugars_level, salt_level, serving_size, additives_tags)
  values
    (p_product_id, now(), p_nutriscore_grade, p_nova_group::smallint, p_basis,
     p_energy_kcal, p_fat, p_saturated_fat, p_carbohydrates, p_sugars, p_fiber, p_proteins, p_salt,
     p_fat_level, p_saturated_fat_level, p_sugars_level, p_salt_level, v_racion, p_additives_tags)
  on conflict (product_id) do update set
    nutrition_data_at   = excluded.nutrition_data_at,
    nutriscore_grade    = excluded.nutriscore_grade,
    nova_group          = excluded.nova_group,
    basis               = excluded.basis,
    energy_kcal         = excluded.energy_kcal,
    fat                 = excluded.fat,
    saturated_fat       = excluded.saturated_fat,
    carbohydrates       = excluded.carbohydrates,
    sugars              = excluded.sugars,
    fiber               = excluded.fiber,
    proteins            = excluded.proteins,
    salt                = excluded.salt,
    fat_level           = excluded.fat_level,
    saturated_fat_level = excluded.saturated_fat_level,
    sugars_level        = excluded.sugars_level,
    salt_level          = excluded.salt_level,
    serving_size        = excluded.serving_size,
    additives_tags      = excluded.additives_tags;
end;
$$;

comment on function public.upsert_product_nutrition(
  uuid, text, integer, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, text, text[]
) is
  'La única vía de escritura a product_nutrition. Revalida producto global, listas cerradas, '
  'rangos, coherencia de los pares (saturadas/grasas, azúcares/hidratos), ración y aditivos '
  'aunque la Edge Function ya los filtrara. Marca nutrition_data_at = now(): solo se llama '
  'tras una consulta fresca a OFF. Solo service_role.';

revoke all on function public.upsert_product_nutrition(
  uuid, text, integer, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, text, text[]
) from public, anon, authenticated;

grant execute on function public.upsert_product_nutrition(
  uuid, text, integer, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, text, text[]
) to service_role;
