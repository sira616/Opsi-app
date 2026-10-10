-- ═══════════════════════════════════════════════════════════════════════════
-- La vista de prioridad vuelve a contar los días desde la fecha DEL USUARIO
--
-- `20260921140000_today_for_user` había cambiado `current_date` (la fecha del
-- servidor, que en Supabase es UTC) por `today_for_user()` (la fecha en la zona
-- horaria de quien mira). Es la diferencia entre «vence hoy» y «vence mañana»
-- entre la medianoche y las dos de la madrugada en España, que es justo cuando
-- alguien abre la app para ver qué tiene que gastar hoy.
--
-- Después, `20260921180000_categorias` tuvo que borrar y recrear la vista
-- (añadía una columna a `inventory_items` y `i.*` la coloca en medio), y la
-- recreó copiando la definición de `20260921100100`, ANTERIOR al arreglo. El
-- arreglo se perdió sin ruido: ningún test miraba la zona horaria de la vista.
--
-- Aquí se devuelve, y con él un test que sí la mira
-- (`supabase/tests/prioridad_zona_horaria_test.sql`).
--
-- Las columnas no cambian ni de nombre, ni de tipo, ni de orden, así que basta
-- `create or replace view`: conserva los permisos, el comentario y todo lo que
-- dependa de ella. La definición es la de `20260921180000` con UNA diferencia:
-- las tres apariciones de `current_date`.
--
-- Lección para la próxima vez que haya que recrear esta vista: copiarla de la
-- ÚLTIMA migración que la define, no de la primera, y correr
-- `prioridad_zona_horaria_test.sql`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.inventory_with_priority
with (security_invoker = true) as
with candidates as (
  select
    i.*,

    -- 1) La del envase, más los días que estuvo parada en el congelador.
    case
      when i.limit_date is not null then i.limit_date + i.frozen_days
    end as date_from_label,

    -- 2) La de conservación tras apertura: primero la del producto, si no la
    --    de su categoría, y de las categorías que encajen la MÁS CORTA.
    case
      when i.opened_at is not null then
        i.opened_at::date + coalesce(
          p.open_shelf_life_days,
          (
            select min(r.days)
            from public.open_shelf_life_reference r
            where r.category_tag = any (p.categories_tags)
          )
        )
    end as date_from_opening,

    -- 3) El tope de seguridad: 24 h desde que se descongeló.
    case
      when i.state = 'thawed' and i.thawed_at is not null
      then i.thawed_at::date + 1
    end as date_from_thaw

  from public.inventory_items i
  left join public.products p on p.id = i.product_id
),
resolved as (
  select
    c.*,
    case
      -- Lo agotado y lo tirado ya no tiene fecha que vigilar.
      when c.state in ('finished', 'discarded') then null
      -- Mientras está congelado, la cuenta atrás está parada: no vence.
      when c.state = 'frozen' then null
      else least(c.date_from_thaw, c.date_from_opening, c.date_from_label)
    end as effective_limit_date
  from candidates c
)
select
  r.*,

  -- Por qué esa fecha y no otra. La pantalla de detalle lo explica con esto,
  -- en vez de soltar un número sin más.
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'after_thawing'
    when r.effective_limit_date = r.date_from_opening then 'after_opening'
    else 'label'
  end::public.effective_date_reason as effective_date_reason,

  -- El origen que se muestra al usuario. Todo lo que no venga del envase es
  -- orientativo, y se dice.
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'reference'
    when r.effective_limit_date = r.date_from_opening then 'reference'
    else r.date_source
  end::public.date_source as effective_date_source,

  (r.effective_limit_date - public.today_for_user()) as days_left,

  case
    when r.state in ('finished', 'discarded')     then 'closed_out'
    when r.state = 'frozen'                        then 'frozen'
    when r.effective_limit_date is null            then 'undated'
    when r.effective_limit_date <= public.today_for_user() + 1 then 'high'
    when r.effective_limit_date <= public.today_for_user() + 4 then 'medium'
    else 'low'
  end::public.priority_group as priority

from resolved r;

comment on view public.inventory_with_priority is
  'Inventario con la fecha límite efectiva, por qué es esa y su urgencia. '
